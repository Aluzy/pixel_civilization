import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';
import { Component } from './harmony.js';
import { Enclosure, MAX_COLONIES, MAX_WORK_TILES, ProjectKind } from './colony-store.js';
import { insideAny, onAnyRing } from './fortress.js';
import { stockPortions } from '../farming/food.js';

// Architecture (docs/design/17-architecture.md, decision 0028): the colonies shape their land.
// A work of architecture is a list of tiles, each to receive a structure (a paving stone, a stone
// wall, a tree…) or a new ground (a drained marsh becomes a plain); members bring its materials by
// batches, and a builder lays the tiles one by one from beside them. What a colony builds follows
// the order of data/works.json: a paved square at its camp, streets from it along the four axes,
// four public buildings at the corners of the square, its houses rebuilt in stone, its palisade in
// stone, an avenue of trees round its walls, paved roads to its kin, then its marshes drained.

/** `craftRecipe` of a builder laying the tiles of a work (no recipe: labour and materials). */
export const WORKS_RECIPE = -2;

/** Public buildings: their offset from the camp (a corner of the square) and their stone. */
const EDIFICES = Object.freeze([
  { id: 'temple', dx: 4, dy: -4, edge: 'temple', centre: 'temple' },
  { id: 'granary', dx: -4, dy: -4, edge: 'granary', centre: 'granary' },
  { id: 'market', dx: 4, dy: 4, edge: 'market', centre: 'market' },
  { id: 'monument', dx: -4, dy: 4, edge: 'monument', centre: 'statue' },
]);

const DX4 = Int8Array.from([1, -1, 0, 0]);
const DY4 = Int8Array.from([0, 0, 1, -1]);

/** Side of the square searched for a road (two camps up to 90 tiles apart), and its cells. */
const SPAN = 201;
const CELLS = SPAN * SPAN;
const prev = new Int32Array(CELLS);
const queue = new Int32Array(CELLS);

/**
 * Costs of a tile of work: materials and labour, per structure code and per ground.
 * @typedef {object} TileCost
 * @property {{ good: number, count: number }[]} inputs
 * @property {number} ticks
 */

/**
 * Builds the tables of works from data/works.json: costs per structure code and per biome, and
 * the works in their order.
 * @param {object} data - Content of data/works.json.
 * @param {import('../crafting/catalog.js').Catalog} catalog
 * @param {import('../world/world-data.js').WorldTables} tables
 * @returns {{ byCode: (TileCost | null)[], byBiome: (TileCost | null)[], works: { id: string,
 *   name: string, repeat: boolean }[], index: Record<string, number> }}
 */
export function buildWorks(data, catalog, tables) {
  const byCode = Array.from({ length: catalog.structures.length + 1 }, () => null);
  const byBiome = Array.from({ length: tables.biomes.length }, () => null);
  const goodOf = (id) => tables.resources.findIndex((r) => r.id === id) + 1;
  for (const [id, c] of Object.entries(data.costs)) {
    const cost = {
      inputs: Object.entries(c.cost).map(([g, count]) => ({ good: goodOf(g), count })),
      ticks: c.ticks,
    };
    const st = catalog.structures.find((s) => s.id === id);
    if (st) byCode[st.code] = cost;
    const b = tables.biomes.findIndex((bi) => bi.id === id);
    if (b >= 0) byBiome[b] = cost;
  }
  const works = data.works.map((w) => ({
    id: w.id,
    name: w.name,
    repeat: w.id === 'stone_house' || w.id === 'road' || w.id === 'drain',
  }));
  const index = Object.fromEntries(works.map((w, i) => [w.id, i]));
  return { byCode, byBiome, works, index };
}

/**
 * Cost of laying a tile code (a structure, or −1 − biome).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} code
 * @returns {TileCost | null}
 */
export function tileCost(ctx, code) {
  return code > 0 ? ctx.works.byCode[code] : ctx.works.byBiome[-1 - code];
}

/**
 * True if (x, y) can take something new: walkable ground with nothing built or sown on it, off
 * every enclosure's ring.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function freeLand(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  if (ctx.biomeSpeed[p & PACK.MASK] <= 0) return false;
  // Fields are left alone: one does not pave over the harvest.
  if (p >>> PACK.STRUCTURE_SHIFT !== 0) return false;
  return !onAnyRing(ctx.colonies, x, y);
}

/**
 * @param {import('./colony-store.js').Project} p
 * @param {number} x
 * @param {number} y
 * @param {number} code
 * @param {number} from
 * @returns {boolean} False once the work is full.
 */
function addTile(p, x, y, code, from) {
  if (p.tileLen >= MAX_WORK_TILES) return false;
  const k = p.tileLen++;
  p.tileX[k] = x;
  p.tileY[k] = y;
  p.tileCode[k] = code;
  p.tileFrom[k] = from;
  return true;
}

/**
 * True if tile k of a work can still be laid: what was there when it was planned is still there.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Project} p
 * @param {number} k
 * @returns {boolean}
 */
function stillValid(state, ctx, p, k) {
  const packed = state.world.packedAt(p.tileX[k], p.tileY[k]);
  const code = packed >>> PACK.STRUCTURE_SHIFT;
  const biome = packed & PACK.MASK;
  const from = p.tileFrom[k];
  if (from < 0) return code === 0 && biome === -1 - from;
  if (from === 0) return code === 0 && ctx.biomeSpeed[biome] > 0;
  return code === from;
}

/**
 * Next tile of a work to lay, skipping those that can no longer be (something was built there).
 * Writes x, y in `out`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Project} p
 * @param {Int32Array} out
 * @returns {boolean} False once every tile is laid or given up.
 */
export function nextTile(state, ctx, p, out) {
  while (p.tileNext < p.tileLen) {
    if (stillValid(state, ctx, p, p.tileNext)) {
      out[0] = p.tileX[p.tileNext];
      out[1] = p.tileY[p.tileNext];
      return true;
    }
    p.tileNext++;
  }
  return false;
}

/**
 * Materials a work needs next: those of its next batch of tiles.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
export function worksNeeds(ctx, p) {
  p.needs.fill(0);
  const end = Math.min(p.tileLen, p.tileNext + ctx.balance.works.batch);
  for (let k = p.tileNext; k < end; k++) {
    const cost = tileCost(ctx, p.tileCode[k]);
    if (cost === null) continue;
    for (const input of cost.inputs) p.needs[input.good] += input.count;
  }
}

/**
 * Labour of the tile the builder is about to lay, in ticks.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function worksTicks(state, ctx, id) {
  const p = projectOf(state, ctx, id);
  if (p === null || p.tileNext >= p.tileLen) return 1;
  return tileCost(ctx, p.tileCode[p.tileNext])?.ticks ?? 1;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {import('./colony-store.js').Project | null} The work the agent builds, if any.
 */
function projectOf(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  const slot = a.taskProject[id];
  if (c < 0 || slot < 0) return null;
  const p = state.colonies[c].projects[slot];
  return p.kind === ProjectKind.WORKS ? p : null;
}

/**
 * The builder lays the next tile of its work (`siteX`, `siteY`) from a tile next to it, with the
 * materials it carries; never under someone. Whatever grew there is cleared, a plot given up.
 * The last tile completes the work.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if laid.
 */
export function layTile(state, ctx, id) {
  const a = ctx.agents;
  const p = projectOf(state, ctx, id);
  if (p === null) return false;
  const colony = state.colonies[a.colony[id]];
  const out = ctx.siteOut;
  if (!nextTile(state, ctx, p, out)) return false;
  const x = out[0];
  const y = out[1];
  if (x !== a.siteX[id] || y !== a.siteY[id]) return false;
  if (Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y)) !== 1) return false;
  if (state.world.occupantAt(x, y) >= 0) return false;
  const code = p.tileCode[p.tileNext];
  const cost = tileCost(ctx, code);
  if (cost === null) return false;
  for (const input of cost.inputs) if (a.carried(id, input.good) < input.count) return false;
  for (const input of cost.inputs) a.addCarried(id, input.good, -input.count);
  const world = state.world;
  const packed = world.packedAt(x, y);
  if (packed >>> PACK.STRUCTURE_SHIFT === ctx.plotCode) {
    const plot = state.crops.at(x, y);
    if (plot >= 0) state.crops.retire(plot);
    world.setStructure(x, y, 0);
  }
  if (((packed >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) world.setResource(x, y, 0, 0);
  if (code > 0) world.setStructure(x, y, code);
  else world.setBiome(x, y, -1 - code);
  p.tileNext++;
  a.builds[id]++;
  a.taskTick[id] = state.tick;
  p.addContributor(id);
  if (nextTile(state, ctx, p, out)) return true;
  completeWork(state, ctx, colony, p, id, x, y);
  return true;
}

/**
 * A work is done: reported with its contributors (`other` names the work), marked done if it is
 * built once, its builder freed.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @param {number} id - Builder, or -1.
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function completeWork(state, ctx, colony, p, id, x, y) {
  let helpers = 0;
  for (const other of p.contributors) if (other >= 0) helpers++;
  if (p.tileLen > 0 && helpers > 0) {
    state.events.push(
      state.tick,
      EventType.COLONY_PROJECT,
      id,
      x,
      y,
      helpers * 16 + p.kind,
      p.work,
    );
    colony.lastProject.set(p.contributors);
  }
  if (!ctx.works.works[p.work].repeat) colony.worksDone |= 1 << p.work;
  if (id >= 0) {
    const a = ctx.agents;
    a.taskProject[id] = -1;
    a.taskAmount[id] = 0;
    a.taskBuild[id] = 0;
  }
  p.clear();
}

/**
 * True if felling wood on (x, y) clears land for the colony: forest within reach of its fields.
 * Such wood is not counted against the durability of its harvests: it is a clearing, not a
 * forest worn out.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} x
 * @param {number} y
 * @param {number} resource
 * @returns {boolean}
 */
export function clearing(state, ctx, colony, x, y, resource) {
  if (resource !== ctx.woodResource || !colony.hasCamp) return false;
  if ((state.world.packedAt(x, y) & PACK.MASK) !== ctx.forestBiome) return false;
  return colony.fieldDistance(x, y) <= ctx.balance.agriculture.farmRadius;
}

/**
 * The land changed for good when its resource runs out (decision 0028): wood felled to the last
 * near a colony leaves a clearing (the forest becomes a plain, it does not grow back), and stone
 * or ore dug to the last in the mountains or the desert leaves a quarry.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id - Who took the last unit.
 * @param {number} x
 * @param {number} y
 * @param {number} resource
 * @returns {boolean} True if it must not grow back.
 */
export function exhausted(state, ctx, id, x, y, resource) {
  const c = ctx.agents.colony[id];
  if (c >= 0 && clearing(state, ctx, state.colonies[c], x, y, resource)) {
    state.world.setBiome(x, y, ctx.plainBiome);
    return true;
  }
  const p = state.world.packedAt(x, y);
  const code = p >>> PACK.STRUCTURE_SHIFT;
  // Quarries are dug in the hills and the desert, not in the fields.
  const rocky = ctx.quarryBiome[p & PACK.MASK] === 1;
  if (rocky && ctx.regrowTicks[resource] <= 0 && code === 0 && ctx.quarryCode !== 0) {
    if (ctx.edible[resource] === 1 || resource === ctx.carcass) return false;
    state.world.setStructure(x, y, ctx.quarryCode);
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// The plans: each fills the work's tiles, or says there is nothing to do.

/**
 * The paved square: every free tile within `plazaRadius` of the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
function planPlaza(state, ctx, colony, p) {
  const r = ctx.balance.works.plazaRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = colony.campX + dx;
      const y = colony.campY + dy;
      if (freeLand(state, ctx, x, y)) addTile(p, x, y, ctx.pavementCode, 0);
    }
  }
}

/**
 * The streets: from the square along the four axes through the camp, to the enclosure's wall
 * (or `streetLength` tiles), as far as nothing stands in the way.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
function planStreets(state, ctx, colony, p) {
  const cfg = ctx.balance.works;
  for (let k = 0; k < 4; k++) {
    for (let d = cfg.plazaRadius + 1; d <= cfg.streetLength; d++) {
      const x = colony.campX + DX4[k] * d;
      const y = colony.campY + DY4[k] * d;
      if (colony.onRing(x, y)) break;
      const code = state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT;
      if (code === ctx.pavementCode || code === ctx.bridgeCode) continue;
      // A canal across the street: a bridge over it.
      if (code !== 0 && code === ctx.canalCode) {
        addTile(p, x, y, ctx.bridgeCode, code);
        continue;
      }
      // A field across the street is skipped (the street resumes beyond it); anything else
      // ends it.
      if (state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT === ctx.plotCode) continue;
      if (!freeLand(state, ctx, x, y)) break;
      addTile(p, x, y, ctx.pavementCode, 0);
    }
  }
}

/**
 * A public building on its corner of the square: a 3 × 3 block, its centre first (laid from the
 * square before the sides close it), if all of it is free.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @param {string} id
 * @returns {void}
 */
function planEdifice(state, ctx, colony, p, id) {
  const e = EDIFICES.find((ed) => ed.id === id);
  // On its corner, or the nearest free spot around it, off the streets.
  let cx = 0;
  let cy = 0;
  let found = false;
  for (let r = 0; r <= 3 && !found; r++) {
    for (let oy = -r; oy <= r && !found; oy++) {
      for (let ox = -r; ox <= r && !found; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const x = colony.campX + e.dx + ox;
        const y = colony.campY + e.dy + oy;
        if (Math.abs(x - colony.campX) < 2 || Math.abs(y - colony.campY) < 2) continue;
        found = blockFree(state, ctx, x, y);
        cx = x;
        cy = y;
      }
    }
  }
  if (!found) return;
  const centre = ctx.structureCode[e.centre];
  const edge = ctx.structureCode[e.edge];
  addTile(p, cx, cy, centre, 0);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) addTile(p, cx + dx, cy + dy, edge, 0);
    }
  }
}

/**
 * True if the 3 × 3 block around (x, y) is free land.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function blockFree(state, ctx, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (!freeLand(state, ctx, x + dx, y + dy)) return false;
  }
  return true;
}

/**
 * The first house still of wood: its walls, rebuilt in stone.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
function planStoneHouse(state, ctx, colony, p) {
  const per = ctx.bedsPerHouse;
  const wood = ctx.houseWallCode;
  const stone = ctx.structureCode.house_wall_stone;
  for (let k = 0; k < colony.shelterCount && (k + 1) * per <= colony.bedCount; k++) {
    // The box: its beds and the walls around them.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let b = k * per; b < (k + 1) * per; b++) {
      x0 = Math.min(x0, colony.bedX[b] - 1);
      y0 = Math.min(y0, colony.bedY[b] - 1);
      x1 = Math.max(x1, colony.bedX[b] + 1);
      y1 = Math.max(y1, colony.bedY[b] + 1);
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT === wood) {
          addTile(p, x, y, stone, wood);
        }
      }
    }
    if (p.tileLen > 0) return;
  }
}

/**
 * The palisade of a closed enclosure, rebuilt in stone.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
function planStoneWall(state, ctx, colony, p) {
  if (colony.encState !== Enclosure.CLOSED) return;
  const stone = ctx.structureCode.stone_wall;
  for (let y = colony.encY0; y <= colony.encY1; y++) {
    for (let x = colony.encX0; x <= colony.encX1; x++) {
      if (!colony.onRing(x, y)) continue;
      if (state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT !== ctx.wallCode) continue;
      if (!addTile(p, x, y, stone, ctx.wallCode)) return;
    }
  }
}

/**
 * An avenue of trees round the walls: a tree every `avenueStep` tiles on the ring two tiles out
 * from the enclosure, where the ground is free.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
function planAvenue(state, ctx, colony, p) {
  if (colony.encState === Enclosure.NONE) return;
  const g = ctx.balance.works.avenueGap;
  const step = ctx.balance.works.avenueStep;
  const x0 = colony.encX0 - g;
  const y0 = colony.encY0 - g;
  const x1 = colony.encX1 + g;
  const y1 = colony.encY1 + g;
  let k = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
      if (k++ % step !== 0) continue;
      if (!freeLand(state, ctx, x, y) || insideAny(ctx.colonies, x, y)) continue;
      addTile(p, x, y, ctx.treeCode, 0);
    }
  }
}

/**
 * True if a road may pass over (x, y): walkable ground free or already a road, a bridge, a gate
 * (crossed as it is), a plot (given up).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function roadway(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  if (ctx.biomeSpeed[p & PACK.MASK] <= 0) return false;
  const code = p >>> PACK.STRUCTURE_SHIFT;
  if (code === ctx.pavementCode || code === ctx.bridgeCode || code === ctx.gateCode) return true;
  return code === 0 || code === ctx.plotCode;
}

/**
 * A paved road to a kin colony not joined yet: the shortest way (4-connected) between the two
 * camps over open ground, through the gates, with a tree beside it every `roadTrees` tiles.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
function planRoad(state, ctx, colony, p) {
  for (let c = 0; c < MAX_COLONIES && c < state.colonies.length; c++) {
    if (c === colony.id || colony.relKin[c] !== 1 || (colony.roads & (1 << c)) !== 0) continue;
    const other = state.colonies[c];
    if (!other.hasCamp) continue;
    // Either way, one road is enough.
    colony.roads |= 1 << c;
    other.roads |= 1 << colony.id;
    const half = (SPAN - 1) >> 1;
    const ox = colony.campX - half;
    const oy = colony.campY - half;
    const tx = other.campX - ox;
    const ty = other.campY - oy;
    if (tx < 0 || ty < 0 || tx >= SPAN || ty >= SPAN) continue;
    prev.fill(-2);
    let head = 0;
    let tail = 0;
    const start = half * SPAN + half;
    const goal = ty * SPAN + tx;
    prev[start] = -1;
    queue[tail++] = start;
    while (head < tail && prev[goal] === -2) {
      const cell = queue[head++];
      const cx = cell % SPAN;
      const cy = (cell / SPAN) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DX4[k];
        const ny = cy + DY4[k];
        if (nx < 0 || ny < 0 || nx >= SPAN || ny >= SPAN) continue;
        const n = ny * SPAN + nx;
        if (prev[n] !== -2) continue;
        if (n !== goal && !roadway(state, ctx, ox + nx, oy + ny)) continue;
        prev[n] = cell;
        queue[tail++] = n;
      }
    }
    if (prev[goal] === -2) continue;
    const every = ctx.balance.works.roadTrees;
    let step = 0;
    for (let cell = goal; cell >= 0; cell = prev[cell]) {
      const x = ox + (cell % SPAN);
      const y = oy + ((cell / SPAN) | 0);
      if (freeLand(state, ctx, x, y) && !addTile(p, x, y, ctx.pavementCode, 0)) return;
      // A tree beside it now and then, out of the walls.
      if (++step % every !== 0) continue;
      const pc = prev[cell];
      if (pc < 0) continue;
      const vertical = pc % SPAN === cell % SPAN;
      const sx = x + (vertical ? 1 : 0);
      const sy = y + (vertical ? 0 : 1);
      if (freeLand(state, ctx, sx, sy) && !insideAny(ctx.colonies, sx, sy)) {
        if (!addTile(p, sx, sy, ctx.treeCode, 0)) return;
      }
    }
    if (p.tileLen > 0) return;
  }
}

/**
 * Marshes near the colony drained into plains: up to `drainTiles` marsh tiles within the farm's
 * reach, the nearest to the camp first.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @returns {void}
 */
function planDrain(state, ctx, colony, p) {
  const marsh = ctx.marshBiome;
  const plain = ctx.plainBiome;
  if (marsh < 0 || plain < 0 || ctx.works.byBiome[plain] === null) return;
  const far = ctx.balance.agriculture.farmRadius;
  const max = ctx.balance.works.drainTiles;
  const reach = far + 32;
  for (let r = 1; r <= reach && p.tileLen < max; r++) {
    for (let k = 0; k < 8 * r && p.tileLen < max; k++) {
      // Ring of radius r, clockwise from the north-west corner.
      const side = (k / (2 * r)) | 0;
      const t = k - side * 2 * r;
      const dx = side === 0 ? -r + t : side === 1 ? r : side === 2 ? r - t : -r;
      const dy = side === 0 ? -r : side === 1 ? -r + t : side === 2 ? r : r - t;
      const x = colony.campX + dx;
      const y = colony.campY + dy;
      const packed = state.world.packedAt(x, y);
      if ((packed & PACK.MASK) !== marsh || packed >>> PACK.STRUCTURE_SHIFT !== 0) continue;
      if (colony.fieldDistance(x, y) > far) continue;
      addTile(p, x, y, -1 - plain, -1 - marsh);
    }
  }
}

/**
 * Fills the work's tiles for the work `w` (index in data/works.json).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} p
 * @param {number} w
 * @returns {void}
 */
function planWork(state, ctx, colony, p, w) {
  const id = ctx.works.works[w].id;
  switch (id) {
    case 'plaza':
      planPlaza(state, ctx, colony, p);
      break;
    case 'streets':
      planStreets(state, ctx, colony, p);
      break;
    case 'stone_house':
      planStoneHouse(state, ctx, colony, p);
      break;
    case 'stone_wall':
      planStoneWall(state, ctx, colony, p);
      break;
    case 'avenue':
      planAvenue(state, ctx, colony, p);
      break;
    case 'road':
      planRoad(state, ctx, colony, p);
      break;
    case 'drain':
      planDrain(state, ctx, colony, p);
      break;
    default:
      planEdifice(state, ctx, colony, p, id);
  }
}

/**
 * The colony's works (colony system): the work under way gets the materials of its next batch;
 * a work given up or done is closed. Once a day, a colony of `minMembers` without a work opens
 * the first one of data/works.json it can do, if it is stable and well (`calmAbove`) and its
 * pantry full enough: every `everyDays` days, or each day when beauty is the weakest part of its
 * harmony.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {void}
 */
export function worksProject(state, ctx, colony) {
  const cfg = ctx.balance.works;
  const s = colony.findProject(ProjectKind.WORKS);
  if (s >= 0) {
    const p = colony.projects[s];
    if (p.builder >= 0) return;
    if (!nextTile(state, ctx, p, ctx.siteOut)) completeWork(state, ctx, colony, p, -1, 0, 0);
    else worksNeeds(ctx, p);
    return;
  }
  const day = state.balance.time.ticksPerDay;
  if (state.tick % day !== 0 || colony.members < cfg.minMembers || !colony.hasCamp) return;
  // Bread before stones: no new work while the pantry is short or running down.
  const food = stockPortions(ctx.foodTables, colony.stock, ctx.balance.cooking.portion);
  if (food < colony.members * cfg.foodPerMember || colony.pantryFalling()) return;
  // Only a colony at peace with its needs embellishes itself: stable and well, every few days,
  // each day when beauty is its weakest point.
  const h = colony.harmony;
  const calm = ctx.balance.harmony.calmAbove;
  if (h[1 + Component.STABILITY] < calm || h[1 + Component.WELLBEING] < calm) return;
  const due =
    colony.focus === Component.BEAUTY || state.tick - colony.lastWork >= cfg.everyDays * day;
  if (!due) return;
  const slot = colony.freeSlot();
  if (slot < 0) return;
  const p = colony.projects[slot];
  // The work opened the fewest times first (in the order of data/works.json on a tie): the
  // houses rebuilt one by one do not hold up the rest.
  const order = ctx.worksOrder;
  const n = ctx.works.works.length;
  for (let w = 0; w < n; w++) order[w] = w;
  order.subarray(0, n).sort((u, v) => colony.worksCount[u] - colony.worksCount[v] || u - v);
  for (let k = 0; k < n; k++) {
    const w = order[k];
    if ((colony.worksDone & (1 << w)) !== 0) continue;
    p.clear();
    planWork(state, ctx, colony, p, w);
    if (p.tileLen === 0) continue;
    colony.worksCount[w]++;
    p.kind = ProjectKind.WORKS;
    p.work = w;
    p.number = w + 1;
    p.startTick = state.tick;
    colony.lastWork = state.tick;
    worksNeeds(ctx, p);
    return;
  }
  p.clear();
}

/**
 * What the colony's town looks like, counted once a day around its camp (its enclosure, or its
 * territory): paved tiles, stone and wooden house walls, public buildings, trees planted, stone
 * and wooden ring walls, fountains, quarries and drained land are counted in `beautyCounts`.
 * Beauty is the mean of: paving (against a square and four streets), houses in stone, public
 * buildings (four), trees (`treesWanted`), walls in stone (if it has walls) and a fountain.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number} Beauty, 0 to 1.
 */
export function beauty(state, ctx, colony) {
  const cfg = ctx.balance.works;
  const c = colony.beautyCounts;
  c.fill(0);
  let x0;
  let y0;
  let x1;
  let y1;
  if (colony.encState !== Enclosure.NONE) {
    const g = cfg.avenueGap + 1;
    x0 = colony.encX0 - g;
    y0 = colony.encY0 - g;
    x1 = colony.encX1 + g;
    y1 = colony.encY1 + g;
  } else {
    const r = ctx.balance.harmony.territoryRadius;
    x0 = colony.campX - r;
    y0 = colony.campY - r;
    x1 = colony.campX + r;
    y1 = colony.campY + r;
  }
  const kinds = ctx.structureKind;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const code = state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT;
      if (code === 0) continue;
      if (code === ctx.pavementCode || code === ctx.bridgeCode) c[0]++;
      else if (code === ctx.houseWallCode) c[1]++;
      else if (code === ctx.structureCode.house_wall_stone) c[2]++;
      else if (kinds[code] === 'edifice' || kinds[code] === 'market') c[3]++;
      else if (code === ctx.treeCode) c[4]++;
      else if (code === ctx.wallCode) c[5]++;
      else if (code === ctx.structureCode.stone_wall) c[6]++;
      else if (kinds[code] === 'fountain') c[7]++;
    }
  }
  const r = cfg.plazaRadius;
  const paving = (2 * r + 1) * (2 * r + 1) + 4 * (cfg.streetLength - r);
  const terms = [
    Math.min(1, c[0] / paving),
    c[1] + c[2] > 0 ? c[2] / (c[1] + c[2]) : 0,
    Math.min(1, c[3] / (EDIFICES.length * 9)),
    Math.min(1, c[4] / cfg.treesWanted),
    c[7] > 0 ? 1 : 0,
  ];
  if (c[5] + c[6] > 0) terms.push(c[6] / (c[5] + c[6]));
  let sum = 0;
  for (const t of terms) sum += t;
  return sum / terms.length;
}
