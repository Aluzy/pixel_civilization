import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';
import { Enclosure, ProjectKind } from './colony-store.js';

// Treasures and fortresses (docs/design/16-guerre-et-forteresses.md, « Trésors et forteresses »):
// a colony keeps its gold, gems and écus in a treasure room; when the danger felt at the camp or
// the worth of the treasure calls for it, it rings the treasure room and all its houses with a
// wall (a rectangle with room inside for the houses to come) with gates, built segment by segment,
// then raises a tower beside each gate. Walls stop everyone, gates let agents through but not
// predators.

/** Sides of the ring, for the gates. */
const Side = Object.freeze({ NORTH: 0, SOUTH: 1, WEST: 2, EAST: 3 });

/**
 * What the treasure is worth: the écus of the treasury plus the gold and gems of the stock at
 * the counter's prices.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number}
 */
export function treasureValue(ctx, colony) {
  let value = colony.treasury;
  const goods = ctx.treasureGoods;
  for (let g = 1; g < goods.length; g++) {
    if (goods[g] === 1) value += colony.stock[g] * colony.price[g];
  }
  return value;
}

/**
 * Once a day: the danger felt at the camp fades, and a day with an attack near the camp adds 1.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {void}
 */
export function updateDanger(state, ctx, colony) {
  const day = state.balance.time.ticksPerDay;
  const attacked = state.tick - colony.lastThreat < day ? 1 : 0;
  colony.danger = colony.danger * ctx.balance.fortress.dangerDecay + attacked;
}

/**
 * True if the colony has reason to wall itself in: its danger, or the worth of its treasure.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {boolean}
 */
export function wantsEnclosure(ctx, colony) {
  const cfg = ctx.balance.fortress;
  if (!colony.hasTreasure || colony.encState !== Enclosure.NONE) return false;
  return colony.danger >= cfg.dangerLevel || treasureValue(ctx, colony) >= cfg.treasureValue;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True if nothing can walk on this tile (water).
 */
function impassable(state, ctx, x, y) {
  return ctx.biomeSpeed[state.world.packedAt(x, y) & PACK.MASK] <= 0;
}

/**
 * True if a structure on this tile is in the way of a wall (any but a plot, which is given up, or
 * a part of the wall itself).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} code
 * @returns {boolean}
 */
function inTheWay(ctx, code) {
  if (code === 0 || code === ctx.plotCode || code === ctx.canalCode) return false;
  return code !== ctx.wallCode && code !== ctx.gateCode && code !== ctx.towerCode;
}

/**
 * Number of tiles of the ring (x0, y0)–(x1, y1).
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {number}
 */
function ringLength(x0, y0, x1, y1) {
  return 2 * (x1 - x0) + 2 * (y1 - y0);
}

/**
 * Tile k of a ring, clockwise from the north-west corner. Writes x, y in `out`.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} k
 * @param {Int32Array} out
 * @returns {void}
 */
function ringTile(x0, y0, x1, y1, k, out) {
  const w = x1 - x0;
  const h = y1 - y0;
  if (k < w) {
    out[0] = x0 + k;
    out[1] = y0;
  } else if (k < w + h) {
    out[0] = x1;
    out[1] = y0 + (k - w);
  } else if (k < 2 * w + h) {
    out[0] = x1 - (k - w - h);
    out[1] = y1;
  } else {
    out[0] = x0;
    out[1] = y1 - (k - 2 * w - h);
  }
}

/**
 * The middle tile of a side of the colony's ring. Writes x, y in `out`.
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} side - {@link Side}.
 * @param {Int32Array} out
 * @returns {void}
 */
function sideMiddle(colony, side, out) {
  const mx = (colony.encX0 + colony.encX1) >> 1;
  const my = (colony.encY0 + colony.encY1) >> 1;
  out[0] = side === Side.WEST ? colony.encX0 : side === Side.EAST ? colony.encX1 : mx;
  out[1] = side === Side.NORTH ? colony.encY0 : side === Side.SOUTH ? colony.encY1 : my;
}

/**
 * The colony draws its enclosure (docs/design/16-guerre-et-forteresses.md, « Tracé »): around its
 * treasure room, all its houses, and the stations and libraries within `radius` of the treasure,
 * then grown, a side at a time, until there is room inside for the houses of `homesFor` members
 * (no side beyond `maxSide`); widened by the margin (1 to 3 tiles) whose ring crosses the fewest
 * buildings. A gate in the middle of each side where one can stand, a tower beside each gate.
 * False if even the buildings alone would not fit.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {boolean}
 */
export function planEnclosure(state, ctx, colony) {
  const cfg = ctx.balance.fortress;
  const tx = colony.treasureX;
  const ty = colony.treasureY;
  const box = ctx.encBox;
  box[0] = box[2] = tx;
  box[1] = box[3] = ty;
  const kinds = ctx.catalog.structures;
  for (let dy = -cfg.radius; dy <= cfg.radius; dy++) {
    for (let dx = -cfg.radius; dx <= cfg.radius; dx++) {
      const code = state.world.packedAt(tx + dx, ty + dy) >>> PACK.STRUCTURE_SHIFT;
      if (code === 0) continue;
      const kind = kinds[code - 1].kind;
      if (kind !== 'station' && kind !== 'library') continue;
      cover(box, tx + dx, ty + dy, 0);
    }
  }
  // Every house of the colony, walls included (a bed and the tiles around it).
  for (let k = 0; k < colony.bedCount; k++) cover(box, colony.bedX[k], colony.bedY[k], 1);
  const limit = cfg.maxSide - 2 * cfg.margin[1];
  if (box[2] - box[0] + 1 > limit || box[3] - box[1] + 1 > limit) return false;
  // Room for the houses still to come: each takes its footprint and a lane.
  const perHouse = (ctx.houseSize[0] + 1) * (ctx.houseSize[1] + 1);
  const houses = Math.ceil(cfg.homesFor / ctx.bedsPerHouse) - colony.shelterCount;
  const target = (box[2] - box[0] + 1) * (box[3] - box[1] + 1) + Math.max(0, houses) * perHouse;
  for (
    let side = 0;
    (box[2] - box[0] + 1) * (box[3] - box[1] + 1) < target;
    side = (side + 1) % 4
  ) {
    const wide = box[2] - box[0] + 1 >= limit;
    const tall = box[3] - box[1] + 1 >= limit;
    if (wide && tall) break;
    if (side === 0 && !wide) box[0]--;
    else if (side === 1 && !tall) box[1]--;
    else if (side === 2 && !wide) box[2]++;
    else if (side === 3 && !tall) box[3]++;
  }
  const minX = box[0];
  const minY = box[1];
  const maxX = box[2];
  const maxY = box[3];
  let best = -1;
  let bestBlocked = Infinity;
  const out = ctx.recallTarget;
  for (let m = cfg.margin[0]; m <= cfg.margin[1]; m++) {
    const x0 = minX - m;
    const y0 = minY - m;
    const x1 = maxX + m;
    const y1 = maxY + m;
    if (x1 - x0 + 1 > cfg.maxSide || y1 - y0 + 1 > cfg.maxSide) break;
    let blocked = 0;
    const n = ringLength(x0, y0, x1, y1);
    for (let k = 0; k < n; k++) {
      ringTile(x0, y0, x1, y1, k, out);
      if (inTheWay(ctx, state.world.packedAt(out[0], out[1]) >>> PACK.STRUCTURE_SHIFT)) blocked++;
    }
    if (blocked < bestBlocked) {
      bestBlocked = blocked;
      best = m;
    }
  }
  if (best < 0) return false;
  colony.encX0 = minX - best;
  colony.encY0 = minY - best;
  colony.encX1 = maxX + best;
  colony.encY1 = maxY + best;
  colony.encState = Enclosure.BUILDING;
  colony.encTick = state.tick;
  colony.gateCount = 0;
  colony.gatesBuilt = 0;
  colony.gateBuilt = false;
  colony.towerCount = 0;
  colony.towersBuilt = 0;
  colony.breaches = 0;
  // A gate in the middle of each side where one can stand, so that no trip goes far round.
  for (let side = 0; side < 4; side++) {
    sideMiddle(colony, side, out);
    if (!standable(state, ctx, out[0], out[1])) continue;
    colony.gateX[colony.gateCount] = out[0];
    colony.gateY[colony.gateCount] = out[1];
    colony.gateCount++;
  }
  if (colony.gateCount === 0) {
    sideMiddle(colony, Side.SOUTH, out);
    colony.gateX[0] = out[0];
    colony.gateY[0] = out[1];
    colony.gateCount = 1;
  }
  // A tower beside each gate, on the wall: climbed from inside, it watches the way in.
  // (A corner could not be climbed: both its neighbours on the ring are walls.)
  for (let i = 0; i < colony.gateCount; i++) {
    const gx = colony.gateX[i];
    const gy = colony.gateY[i];
    const along = gx === colony.encX0 || gx === colony.encX1;
    let x = along ? gx : gx + 1;
    let y = along ? gy + 1 : gy;
    if (!standable(state, ctx, x, y)) {
      x = along ? gx : gx - 1;
      y = along ? gy - 1 : gy;
      if (!standable(state, ctx, x, y)) continue;
    }
    colony.towerX[colony.towerCount] = x;
    colony.towerY[colony.towerCount] = y;
    colony.towerCount++;
  }
  colony.encTotal = ringLength(colony.encX0, colony.encY0, colony.encX1, colony.encY1);
  colony.encOpen = countOpen(state, ctx, colony);
  state.events.push(
    state.tick,
    EventType.ENCLOSURE_PLANNED,
    -1,
    colony.gateX[0],
    colony.gateY[0],
    colony.id,
    colony.danger >= cfg.dangerLevel ? 0 : 1,
  );
  return true;
}

/**
 * Grows the box x0, y0, x1, y1 to cover (x, y) and the tiles within `r` of it.
 * @param {Int32Array} box
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @returns {void}
 */
function cover(box, x, y, r) {
  if (x - r < box[0]) box[0] = x - r;
  if (y - r < box[1]) box[1] = y - r;
  if (x + r > box[2]) box[2] = x + r;
  if (y + r > box[3]) box[3] = y + r;
}

/**
 * True if a gate or a tower can stand on (x, y): walkable ground, no building in the way.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function standable(state, ctx, x, y) {
  if (impassable(state, ctx, x, y)) return false;
  return !inTheWay(ctx, state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT);
}

/**
 * True if a tile of the ring still has to be built: walkable, and neither wall, gate nor tower.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function openTile(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  if (ctx.biomeSpeed[p & PACK.MASK] <= 0) return false;
  const code = p >>> PACK.STRUCTURE_SHIFT;
  // A canal through the ring is a water gate: closed to predators.
  if (code !== 0 && code === ctx.canalCode) return false;
  return code !== ctx.wallCode && code !== ctx.gateCode && code !== ctx.towerCode;
}

/**
 * Tiles of the colony's ring still open.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number}
 */
export function countOpen(state, ctx, colony) {
  const out = ctx.recallTarget;
  let n = 0;
  for (let k = 0; k < colony.encTotal; k++) {
    ringTile(colony.encX0, colony.encY0, colony.encX1, colony.encY1, k, out);
    if (openTile(state, ctx, out[0], out[1])) n++;
  }
  return n;
}

/**
 * Next tile the builder works on: the gate first, then the open tile of the ring nearest to it
 * (ring order on a tie), and for a tower project the tower. Writes x, y in `out`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} project
 * @param {number} id
 * @param {Int32Array} out
 * @returns {boolean} False if nothing is left to build.
 */
export function nextSegment(state, ctx, colony, project, id, out) {
  const a = ctx.agents;
  const x = a.x[id];
  const y = a.y[id];
  let bestD = Infinity;
  if (project.kind === ProjectKind.TOWER) {
    // The nearest tower still to raise (its wall segment stands).
    for (let i = 0; i < colony.towerCount; i++) {
      if ((colony.towersBuilt & (1 << i)) !== 0) continue;
      const tx = colony.towerX[i];
      const ty = colony.towerY[i];
      if (state.world.packedAt(tx, ty) >>> PACK.STRUCTURE_SHIFT !== ctx.wallCode) continue;
      const d = Math.max(Math.abs(tx - x), Math.abs(ty - y));
      if (d < bestD) {
        bestD = d;
        out[0] = tx;
        out[1] = ty;
      }
    }
    return bestD !== Infinity;
  }
  if (!colony.gateBuilt) {
    // The gates first, the nearest one.
    for (let i = 0; i < colony.gateCount; i++) {
      if ((colony.gatesBuilt & (1 << i)) !== 0) continue;
      const d = Math.max(Math.abs(colony.gateX[i] - x), Math.abs(colony.gateY[i] - y));
      if (d < bestD) {
        bestD = d;
        out[0] = colony.gateX[i];
        out[1] = colony.gateY[i];
      }
    }
    return bestD !== Infinity;
  }
  let bx = 0;
  let by = 0;
  for (let k = 0; k < colony.encTotal; k++) {
    ringTile(colony.encX0, colony.encY0, colony.encX1, colony.encY1, k, out);
    if (!openTile(state, ctx, out[0], out[1])) continue;
    const d = Math.max(Math.abs(out[0] - x), Math.abs(out[1] - y));
    if (d < bestD) {
      bestD = d;
      bx = out[0];
      by = out[1];
    }
  }
  out[0] = bx;
  out[1] = by;
  return bestD !== Infinity;
}

/**
 * True if an agent or a predator stands on (x, y).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function occupied(state, ctx, x, y) {
  const a = ctx.agents;
  for (let i = 0; i < a.highWater; i++) {
    if (a.alive[i] === 1 && a.x[i] === x && a.y[i] === y) return true;
  }
  const t = state.threats;
  for (let p = 0; p < t.highWater; p++) {
    if (t.alive[p] === 1 && t.x[p] === x && t.y[p] === y) return true;
  }
  return false;
}

/**
 * True if a predator is inside the colony's ring.
 * @param {import('../simulation.js').SimState} state
 * @param {import('./colony-store.js').Colony} colony
 * @returns {boolean}
 */
function predatorInside(state, colony) {
  const t = state.threats;
  for (let p = 0; p < t.highWater; p++) {
    if (t.alive[p] === 1 && colony.inside(t.x[p], t.y[p])) return true;
  }
  return false;
}

/**
 * The builder puts up its segment (wall, gate or tower) on the tile next to it it was working on
 * (`siteX`, `siteY`). A plot in the way is given up, a resource cleared. The last segment is not
 * laid while a predator is inside (it would be shut in with the colony).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if it was built.
 */
export function buildSegment(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return false;
  const colony = state.colonies[c];
  const r = a.craftRecipe[id];
  const recipe = ctx.catalog.recipes[r];
  const x = a.siteX[id];
  const y = a.siteY[id];
  const gap = Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y));
  if (gap !== 1 || !a.recipes[id].knows(r)) return false;
  for (const input of recipe.inputs) if (a.carried(id, input.good) < input.count) return false;
  const code = recipe.output;
  const here = state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT;
  if (code === ctx.towerCode) {
    const t = colony.towerAt(x, y);
    if (t < 0 || (colony.towersBuilt & (1 << t)) !== 0 || here !== ctx.wallCode) return false;
  } else {
    if (!colony.onRing(x, y) || !openTile(state, ctx, x, y)) return false;
    const gate = colony.gateAt(x, y);
    if (code === ctx.gateCode && (gate < 0 || (colony.gatesBuilt & (1 << gate)) !== 0)) {
      return false;
    }
    if (code === ctx.wallCode && gate >= 0) return false;
    if (occupied(state, ctx, x, y)) return false;
    if (colony.encOpen <= 1 && code === ctx.wallCode && predatorInside(state, colony)) return false;
  }
  for (const input of recipe.inputs) a.addCarried(id, input.good, -input.count);
  a.recipes[id].use(r, state.tick, ctx.balance.memory.consolidation, ctx.maxTau);
  a.recordMade(id, r, state.tick);
  a.builds[id]++;
  if (here === ctx.plotCode) {
    const plot = state.crops.at(x, y);
    if (plot >= 0) state.crops.retire(plot);
  }
  if (((state.world.packedAt(x, y) >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) {
    state.world.setResource(x, y, 0, 0);
  }
  state.world.setStructure(x, y, code);
  // Still at work: the reservation is renewed.
  a.taskTick[id] = state.tick;
  const slot = a.taskProject[id];
  const project = slot >= 0 ? colony.projects[slot] : null;
  if (code === ctx.towerCode) {
    colony.towersBuilt |= 1 << colony.towerAt(x, y);
    state.events.push(state.tick, EventType.BUILT, id, x, y, r);
    if (project) completeProject(state, ctx, colony, project, id, x, y);
    return true;
  }
  if (code === ctx.gateCode) {
    colony.gatesBuilt |= 1 << colony.gateAt(x, y);
    colony.gateBuilt = colony.gatesBuilt === (1 << colony.gateCount) - 1;
    state.events.push(state.tick, EventType.BUILT, id, x, y, r);
  }
  if (project) project.addContributor(id);
  colony.encOpen = countOpen(state, ctx, colony);
  if (colony.encOpen === 0) {
    colony.encState = Enclosure.CLOSED;
    colony.encClosedTick = state.tick;
    state.events.push(state.tick, EventType.ENCLOSURE_CLOSED, id, x, y, colony.id);
    if (project) completeProject(state, ctx, colony, project, id, x, y);
  }
  return true;
}

/**
 * A wall project is finished: reported with its contributors, the builder freed.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} project
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
function completeProject(state, ctx, colony, project, id, x, y) {
  project.addContributor(id);
  let helpers = 0;
  for (const other of project.contributors) if (other >= 0) helpers++;
  state.events.push(state.tick, EventType.COLONY_PROJECT, id, x, y, helpers * 16 + project.kind);
  colony.lastProject.set(project.contributors);
  const a = ctx.agents;
  a.taskProject[id] = -1;
  a.taskAmount[id] = 0;
  a.taskBuild[id] = 0;
  project.clear();
}

/**
 * Materials the colony's wall project needs next: the gate, then a batch of segments.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} project
 * @returns {void}
 */
export function wallNeeds(ctx, colony, project) {
  const catalog = ctx.catalog;
  const r = catalog.recipeForStructure[colony.gateBuilt ? ctx.wallCode : ctx.gateCode];
  project.recipe = r;
  project.needs.fill(0);
  const units = colony.gateBuilt ? Math.min(ctx.balance.fortress.batch, colony.encOpen) : 1;
  for (const input of catalog.recipes[r].inputs) project.needs[input.good] = input.count * units;
}

/**
 * True if a building may not stand on (x, y): a tile of an enclosure's ring.
 * @param {import('./colony-store.js').Colony[]} colonies
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function onAnyRing(colonies, x, y) {
  for (const colony of colonies) if (colony.onRing(x, y)) return true;
  return false;
}

/**
 * A predator moved from (px, py) to (x, y): it counts as a breach if it entered a closed
 * enclosure (it never should).
 * @param {import('../simulation.js').SimState} state
 * @param {number} px
 * @param {number} py
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function noteBreach(state, px, py, x, y) {
  for (const colony of state.colonies) {
    if (colony.encState !== Enclosure.CLOSED) continue;
    if (colony.inside(x, y) && !colony.inside(px, py)) colony.breaches++;
  }
}

/**
 * True if (x, y) is inside an enclosure, planned or closed.
 * @param {import('./colony-store.js').Colony[]} colonies
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function insideAny(colonies, x, y) {
  for (const colony of colonies) if (colony.inside(x, y)) return true;
  return false;
}

/**
 * True if (x, y) is inside a closed enclosure: no predator appears there.
 * @param {import('./colony-store.js').Colony[]} colonies
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function insideClosed(colonies, x, y) {
  for (const colony of colonies) {
    if (colony.encState === Enclosure.CLOSED && colony.inside(x, y)) return true;
  }
  return false;
}
