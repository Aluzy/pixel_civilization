import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';
import { ProjectKind } from './colony-store.js';

// Canals (docs/design/02-monde.md, « Canaux »; decision 0027): a colony brings the water to its
// village. The canal is traced from the camp, or from the house farthest from water, to the nearest
// water, then dug tile by tile from the water's edge, each new tile next to water or to the canal
// already dug: water runs in it at once. One drinks beside a canal as beside a lake, a plot beside
// it is watered by itself, and one wades through it (slower); predators do not cross it.

const DX4 = Int8Array.from([1, -1, 0, 0]);
const DY4 = Int8Array.from([0, 0, 1, -1]);

/** Side of the square searched for a canal's route, and its cells. */
const SPAN = 81;
const CELLS = SPAN * SPAN;
// Scratch for the route search (one search at a time, once a day at most).
const prev = new Int32Array(CELLS);
const queue = new Int32Array(CELLS);

/**
 * True if (x, y) holds water: the water biome or a canal.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function wetAt(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  return (p & PACK.MASK) === ctx.waterBiome || p >>> PACK.STRUCTURE_SHIFT === ctx.canalCode;
}

/**
 * True if one of the 4 neighbours of (x, y) holds water.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function besideWet(state, ctx, x, y) {
  for (let k = 0; k < 4; k++) if (wetAt(state, ctx, x + DX4[k], y + DY4[k])) return true;
  return false;
}

/**
 * True if a canal is on one of the 8 neighbours of (x, y) (a plot there is irrigated).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function besideCanal(state, ctx, x, y) {
  if (ctx.canalCode === 0) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (state.world.packedAt(x + dx, y + dy) >>> PACK.STRUCTURE_SHIFT === ctx.canalCode) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Distance (Chebyshev) from (x, y) to the nearest water, up to `max`; `max + 1` if none.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} max
 * @returns {number}
 */
export function waterDistance(state, ctx, x, y, max) {
  if (wetAt(state, ctx, x, y)) return 0;
  for (let r = 1; r <= max; r++) {
    for (let d = -r; d <= r; d++) {
      if (wetAt(state, ctx, x + d, y - r) || wetAt(state, ctx, x + d, y + r)) return r;
      if (wetAt(state, ctx, x - r, y + d) || wetAt(state, ctx, x + r, y + d)) return r;
    }
  }
  return max + 1;
}

/**
 * True if a canal may be dug on (x, y): walkable ground with nothing built on it (a plot gives
 * way), or a plain wall segment of an enclosure (the canal passes under it, a water gate).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function diggable(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  if (ctx.biomeSpeed[p & PACK.MASK] <= 0) return false;
  const code = p >>> PACK.STRUCTURE_SHIFT;
  return code === 0 || code === ctx.plotCode || code === ctx.wallCode;
}

/**
 * Where the colony wants water: its camp if water is farther than `reach`, else the house whose
 * bed is the farthest from water (beyond `reach`). Writes x, y of a diggable tile there in `out`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {Int32Array} out
 * @returns {boolean} False if every home has water near enough.
 */
function thirstiest(state, ctx, colony, out) {
  const reach = ctx.balance.canal.reach;
  let bx = colony.campX;
  let by = colony.campY;
  let worst = waterDistance(state, ctx, bx, by, reach);
  for (let k = 0; k < colony.bedCount; k++) {
    const d = waterDistance(state, ctx, colony.bedX[k], colony.bedY[k], reach);
    if (d > worst) {
      worst = d;
      bx = colony.bedX[k];
      by = colony.bedY[k];
    }
  }
  if (worst <= reach) return false;
  // The canal ends on a free tile near it (beside the house, in its lane).
  for (let r = 0; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = bx + dx;
        const y = by + dy;
        if (!diggable(state, ctx, x, y) || colony.onRing(x, y)) continue;
        out[0] = x;
        out[1] = y;
        return true;
      }
    }
  }
  return false;
}

/**
 * The colony traces a canal: from the thirstiest home to the nearest tile beside water, through
 * tiles that can be dug (4-connected, within 40 tiles), no longer than `maxLength`. The route is
 * kept from the water's end (`canalX`, `canalY`), to be dug in that order.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {boolean} False if no home lacks water, or no route was found.
 */
export function planCanal(state, ctx, colony) {
  const out = ctx.recallTarget;
  if (ctx.canalCode === 0 || !thirstiest(state, ctx, colony, out)) return false;
  const tx = out[0];
  const ty = out[1];
  const half = (SPAN - 1) >> 1;
  const ox = tx - half;
  const oy = ty - half;
  prev.fill(-2);
  let head = 0;
  let tail = 0;
  const start = half * SPAN + half;
  prev[start] = -1;
  queue[tail++] = start;
  let end = -1;
  while (head < tail) {
    const c = queue[head++];
    const cx = ox + (c % SPAN);
    const cy = oy + ((c / SPAN) | 0);
    if (besideWet(state, ctx, cx, cy)) {
      end = c;
      break;
    }
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX4[k] - ox;
      const ny = cy + DY4[k] - oy;
      if (nx < 0 || ny < 0 || nx >= SPAN || ny >= SPAN) continue;
      const n = ny * SPAN + nx;
      if (prev[n] !== -2 || !diggable(state, ctx, ox + nx, oy + ny)) continue;
      prev[n] = c;
      queue[tail++] = n;
    }
  }
  if (end < 0) return false;
  let len = 0;
  for (let c = end; c >= 0; c = prev[c]) len++;
  if (len > Math.min(ctx.balance.canal.maxLength, colony.canalX.length)) return false;
  // From the water's end to the home.
  let k = 0;
  for (let c = end; c >= 0; c = prev[c]) {
    colony.canalX[k] = ox + (c % SPAN);
    colony.canalY[k] = oy + ((c / SPAN) | 0);
    k++;
  }
  colony.canalLen = len;
  colony.canalNext = 0;
  return true;
}

/**
 * Next tile of the colony's canal to dig. Writes x, y in `out`.
 * @param {import('./colony-store.js').Colony} colony
 * @param {Int32Array} out
 * @returns {boolean} False once it is dug.
 */
export function nextCanal(colony, out) {
  if (colony.canalNext >= colony.canalLen) return false;
  out[0] = colony.canalX[colony.canalNext];
  out[1] = colony.canalY[colony.canalNext];
  return true;
}

/**
 * Materials the canal project needs next: a batch of tiles.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} project
 * @returns {void}
 */
export function canalNeeds(ctx, colony, project) {
  const catalog = ctx.catalog;
  const r = catalog.recipeForStructure[ctx.canalCode];
  project.recipe = r;
  project.needs.fill(0);
  if (r < 0) return;
  const units = Math.min(ctx.balance.canal.batch, colony.canalLen - colony.canalNext);
  for (const input of catalog.recipes[r].inputs) project.needs[input.good] = input.count * units;
}

/**
 * The digger lays the next tile of its colony's canal (`siteX`, `siteY`), from a tile next to it:
 * only beside water already there, never under someone. Whatever grew there is cleared, a plot
 * given up, a wall segment becomes a water gate. A route that can no longer be dug is given up.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if dug.
 */
export function digCanal(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return false;
  const colony = state.colonies[c];
  const r = a.craftRecipe[id];
  const x = a.siteX[id];
  const y = a.siteY[id];
  const gap = Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y));
  if (gap !== 1 || !a.recipes[id].knows(r)) return false;
  if (colony.canalNext >= colony.canalLen) return false;
  if (colony.canalX[colony.canalNext] !== x || colony.canalY[colony.canalNext] !== y) return false;
  for (const input of ctx.catalog.recipes[r].inputs) {
    if (a.carried(id, input.good) < input.count) return false;
  }
  if (state.world.occupantAt(x, y) >= 0) return false;
  const slot = a.taskProject[id];
  const project = slot >= 0 ? colony.projects[slot] : null;
  if (!diggable(state, ctx, x, y) || !besideWet(state, ctx, x, y)) {
    // Something was built in the way: the route is given up, another will be traced.
    colony.canalLen = 0;
    if (project) project.clear();
    a.taskProject[id] = -1;
    a.taskBuild[id] = 0;
    return false;
  }
  for (const input of ctx.catalog.recipes[r].inputs) a.addCarried(id, input.good, -input.count);
  a.recipes[id].use(r, state.tick, ctx.balance.memory.consolidation, ctx.maxTau);
  a.recordMade(id, r, state.tick);
  a.builds[id]++;
  const p = state.world.packedAt(x, y);
  if (p >>> PACK.STRUCTURE_SHIFT === ctx.plotCode) {
    const plot = state.crops.at(x, y);
    if (plot >= 0) state.crops.retire(plot);
  }
  if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) state.world.setResource(x, y, 0, 0);
  state.world.setStructure(x, y, ctx.canalCode);
  colony.canalNext++;
  colony.canalTiles++;
  a.taskTick[id] = state.tick;
  if (!project) return true;
  project.addContributor(id);
  if (colony.canalNext < colony.canalLen) return true;
  // Dug to the end: the water reaches the home.
  let helpers = 0;
  for (const other of project.contributors) if (other >= 0) helpers++;
  state.events.push(state.tick, EventType.COLONY_PROJECT, id, x, y, helpers * 16 + project.kind);
  colony.lastProject.set(project.contributors);
  colony.canalLen = 0;
  colony.canalNext = 0;
  a.taskProject[id] = -1;
  a.taskAmount[id] = 0;
  a.taskBuild[id] = 0;
  project.clear();
  return true;
}

/**
 * Once a day: a colony large enough, with no canal under way, traces one if a home lacks water.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {void}
 */
export function canalProject(state, ctx, colony) {
  if (ctx.canalCode === 0) return;
  const s = colony.findProject(ProjectKind.CANAL);
  if (s >= 0) {
    if (colony.projects[s].builder < 0) canalNeeds(ctx, colony, colony.projects[s]);
    return;
  }
  const day = state.balance.time.ticksPerDay;
  if (state.tick % day !== 0 || colony.members < ctx.balance.canal.minMembers) return;
  const slot = colony.freeSlot();
  if (slot < 0 || !planCanal(state, ctx, colony)) return;
  const p = colony.projects[slot];
  p.clear();
  p.kind = ProjectKind.CANAL;
  p.number = ++colony.canalsPlanned;
  p.startTick = state.tick;
  canalNeeds(ctx, colony, p);
}
