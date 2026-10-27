import { PACK } from '../world/chunk-store.js';
import { onAnyRing } from './fortress.js';

// Houses (docs/design/03-individu.md, « Abri »): a shelter is a ring of walls with one door, and
// each tile inside is a bed for one sleeper. The smallest ring (3 × 3) is 8 tiles, 7 walls and the
// door, around one bed; two beds take a 4 × 3 ring. The builder stands on the door tile and the
// house rises around it in one of four directions, the first that fits.

/**
 * The house a colony of `members` builds: the largest of `houseSteps` it is large enough for,
 * else a shelter.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} members
 * @returns {number} Structure code.
 */
export function houseFor(ctx, members) {
  let code = ctx.shelterCode;
  for (const step of ctx.houseSteps) if (step.code > 0 && members >= step.from) code = step.code;
  return code;
}

/** Directions of a house from its door: the door is on the south, north, east or west side. */
export const HouseDir = Object.freeze({ SOUTH: 0, NORTH: 1, EAST: 2, WEST: 3 });

/**
 * Box of a house whose door is (x, y), facing `dir`: x0, y0, x1, y1 written in `out`. The
 * footprint is width × height with the door on a long side (second tile from the corner); turned
 * for an east or west door.
 * @param {number} w - Footprint width.
 * @param {number} h - Footprint height.
 * @param {number} x
 * @param {number} y
 * @param {number} dir - {@link HouseDir}.
 * @param {Int32Array} out
 * @returns {void}
 */
export function houseBox(w, h, x, y, dir, out) {
  if (dir === HouseDir.SOUTH || dir === HouseDir.NORTH) {
    out[0] = x - 1;
    out[2] = x - 1 + w - 1;
    out[1] = dir === HouseDir.SOUTH ? y - h + 1 : y;
    out[3] = dir === HouseDir.SOUTH ? y : y + h - 1;
  } else {
    out[1] = y - 1;
    out[3] = y - 1 + w - 1;
    out[0] = dir === HouseDir.EAST ? x - h + 1 : x;
    out[2] = dir === HouseDir.EAST ? x : x + h - 1;
  }
}

/**
 * Tile just outside the door, written in `out` (x, y).
 * @param {number} x - Door.
 * @param {number} y
 * @param {number} dir
 * @param {Int32Array} out
 * @returns {void}
 */
export function doorStep(x, y, dir, out) {
  out[0] = x + (dir === HouseDir.EAST ? 1 : dir === HouseDir.WEST ? -1 : 0);
  out[1] = y + (dir === HouseDir.SOUTH ? 1 : dir === HouseDir.NORTH ? -1 : 0);
}

/**
 * True if a house of `def` with its door on (x, y), facing `dir`, can be built: every tile of it
 * on walkable ground with no building (a plot gives way) and nobody on its walls, off any
 * enclosure's ring; nothing
 * that blocks the way in the one-tile lane around it, and the step before the door walkable.
 * Inside an enclosure, only within its walls. Leaves the box in `ctx.houseBox`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {import('./colony-store.js').Colony | null} within - Colony whose enclosure, if any,
 *   must hold the house (and whose streets it keeps clear of).
 * @param {boolean} [walled=true] - False for a house of the suburbs: within the walls or not.
 * @param {number} [code] - Kind of house (structure code), a shelter by default.
 * @returns {boolean}
 */
export function houseFits(state, ctx, x, y, dir, within, walled = true, code = ctx.shelterCode) {
  const box = ctx.houseBox;
  houseBox(ctx.houseW[code], ctx.houseH[code], x, y, dir, box);
  const x0 = box[0];
  const y0 = box[1];
  const x1 = box[2];
  const y1 = box[3];
  const world = state.world;
  if (walled && within !== null && within.encState !== 0) {
    if (!within.inside(x0 - 1, y0 - 1) || !within.inside(x1 + 1, y1 + 1)) return false;
  }
  for (let ty = y0 - 1; ty <= y1 + 1; ty++) {
    for (let tx = x0 - 1; tx <= x1 + 1; tx++) {
      const p = world.packedAt(tx, ty);
      const code = p >>> PACK.STRUCTURE_SHIFT;
      const lane = tx < x0 || tx > x1 || ty < y0 || ty > y1;
      if (lane) {
        if (ctx.blocksAgent[code] === 1 || ctx.passage[code] === 1) return false;
        continue;
      }
      // A plot gives way to a house (the town grows over its fields).
      if (ctx.biomeSpeed[p & PACK.MASK] <= 0 || (code !== 0 && code !== ctx.plotCode)) {
        return false;
      }
      const wall = tx === x0 || tx === x1 || ty === y0 || ty === y1;
      if (wall && !(tx === x && ty === y) && world.lastOccupant() >= 0) return false;
      if (onAnyRing(ctx.colonies, tx, ty)) return false;
      // The axes through the camp are kept for the streets.
      if (within !== null && (tx === within.campX || ty === within.campY)) return false;
    }
  }
  const step = ctx.houseStep;
  doorStep(x, y, dir, step);
  return ctx.biomeSpeed[world.packedAt(step[0], step[1]) & PACK.MASK] > 0;
}

/**
 * First direction in which a house fits with its door on (x, y), or -1. Within the walls or in
 * the suburbs alike: the plan chose the site.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {import('./colony-store.js').Colony | null} within
 * @param {number} [code] - Kind of house, a shelter by default.
 * @returns {number}
 */
export function houseDir(state, ctx, x, y, within, code = ctx.shelterCode) {
  for (let dir = 0; dir < 4; dir++) {
    if (houseFits(state, ctx, x, y, dir, within, false, code)) return dir;
  }
  return -1;
}

/**
 * Raises the house: walls, the door on (x, y), beds inside. Whatever grew there is cleared for
 * good (built land does not grow back). The beds are left in `ctx.newBeds` (x, y pairs, count in
 * `ctx.newBedCount`), the step before the door in `ctx.houseStep`, for {@link registerHouse}.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} dir
 * @param {number} [code] - Kind of house, a shelter by default: its beds bear its code.
 * @returns {void}
 */
export function raiseHouse(state, ctx, x, y, dir, code = ctx.shelterCode) {
  const box = ctx.houseBox;
  houseBox(ctx.houseW[code], ctx.houseH[code], x, y, dir, box);
  const x0 = box[0];
  const y0 = box[1];
  const x1 = box[2];
  const y1 = box[3];
  const world = state.world;
  ctx.newBedCount = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const p = world.packedAt(tx, ty);
      if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) world.setResource(tx, ty, 0, 0);
      if (p >>> PACK.STRUCTURE_SHIFT === ctx.plotCode) {
        const plot = state.crops.at(tx, ty);
        if (plot >= 0) state.crops.retire(plot);
      }
      const wall = tx === x0 || tx === x1 || ty === y0 || ty === y1;
      if (tx === x && ty === y) world.setStructure(tx, ty, ctx.houseDoorCode);
      else if (wall) world.setStructure(tx, ty, ctx.houseWallCode);
      else {
        world.setStructure(tx, ty, code);
        ctx.newBeds[ctx.newBedCount * 2] = tx;
        ctx.newBeds[ctx.newBedCount * 2 + 1] = ty;
        ctx.newBedCount++;
      }
    }
  }
  doorStep(x, y, dir, ctx.houseStep);
}

/**
 * The colony takes the house just raised (by its door on x, y): its beds become the colony's.
 * The first house sets the camp, before its door.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function registerHouse(ctx, colony, x, y) {
  const step = ctx.houseStep;
  const raised = Math.abs(step[0] - x) + Math.abs(step[1] - y) === 1;
  colony.addShelter(x, y, raised ? step[0] : x, raised ? step[1] : y);
  const first = colony.bedCount;
  for (let k = 0; k < ctx.newBedCount; k++) {
    colony.addBed(ctx.newBeds[k * 2], ctx.newBeds[k * 2 + 1]);
  }
  colony.closeHouse(first);
  ctx.newBedCount = 0;
}

/**
 * A site for a new house of the colony, the town plan kept on its blackboard: houses in rows, a
 * lane between them (one house and its lane every `(width + 1) × (height + 1)` tiles), the free
 * spot nearest to the camp first, outside the camp's core, inside its enclosure if it has one;
 * once the walls are full, in rows outside them (the suburbs, decision 0030, up to
 * `suburbRange`), a slot in `squareEvery` × `squareEvery` left free as a square for a well;
 * anywhere it fits if the rows are full. Writes the door x, y and the direction
 * in `out`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {Int32Array} out - Receives x, y, dir.
 * @param {number} [code] - Kind of house, a shelter by default.
 * @returns {boolean}
 */
export function planHouse(state, ctx, colony, out, code = ctx.shelterCode) {
  const cx = colony.campX;
  const cy = colony.campY;
  const cfg = ctx.balance.colony;
  const core = cfg.houseCore;
  const pitchX = ctx.houseW[code] + 1;
  const pitchY = ctx.houseH[code] + 1;
  const walls = colony.encState !== 0;
  for (let pass = 0; pass < (walls ? 2 : 1); pass++) {
    const walled = pass === 0;
    const max = walled ? cfg.houseRange : cfg.suburbRange;
    // The rows: a door facing south on the lattice, the lane under it.
    const rings = Math.ceil(max / Math.min(pitchX, pitchY));
    for (let r = 0; r <= rings; r++) {
      for (let k = 0; k < Math.max(1, 8 * r); k++) {
        const i = ringX(r, k);
        const j = ringY(r, k);
        // One slot in `squareEvery` × `squareEvery` is left as a little square, for a well.
        const q = cfg.squareEvery;
        if (q > 0 && (((i % q) + q) % q) * 2 === q && (((j % q) + q) % q) * 2 === q) continue;
        // The lanes fall on the axes through the camp: the streets (decision 0028).
        const x = cx + i * pitchX + 2;
        const y = cy + j * pitchY - 1;
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > max) continue;
        if (!houseFits(state, ctx, x, y, HouseDir.SOUTH, colony, walled, code)) continue;
        if (!clearOfCore(ctx, cx, cy, core)) continue;
        out[0] = x;
        out[1] = y;
        out[2] = HouseDir.SOUTH;
        return true;
      }
    }
  }
  const max = walls ? cfg.suburbRange : cfg.houseRange;
  for (let r = core + 1; r <= max; r++) {
    for (let k = 0; k < 8 * r; k++) {
      const x = cx + ringX(r, k);
      const y = cy + ringY(r, k);
      const dir = houseDir(state, ctx, x, y, colony, code);
      if (dir < 0 || !clearOfCore(ctx, cx, cy, core)) continue;
      out[0] = x;
      out[1] = y;
      out[2] = dir;
      return true;
    }
  }
  return false;
}

/**
 * Offset x of step k on the square ring of radius r, clockwise from the north-west corner.
 * @param {number} r
 * @param {number} k - In [0, 8r).
 * @returns {number}
 */
function ringX(r, k) {
  if (r === 0) return 0;
  const side = (k / (2 * r)) | 0;
  const t = k - side * 2 * r;
  return side === 0 ? -r + t : side === 1 ? r : side === 2 ? r - t : -r;
}

/**
 * Offset y of step k on the square ring of radius r.
 * @param {number} r
 * @param {number} k
 * @returns {number}
 */
function ringY(r, k) {
  if (r === 0) return 0;
  const side = (k / (2 * r)) | 0;
  const t = k - side * 2 * r;
  return side === 0 ? -r : side === 1 ? -r + t : side === 2 ? r : r - t;
}

/**
 * True if the house box last checked (`ctx.houseBox`) keeps out of the camp's core.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} core
 * @returns {boolean}
 */
function clearOfCore(ctx, cx, cy, core) {
  const b = ctx.houseBox;
  return b[2] < cx - core || b[0] > cx + core || b[3] < cy - core || b[1] > cy + core;
}
