import { tauOf } from '../agents/beliefs.js';
import { perceptionRadius } from '../agents/perception.js';
import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';
import { releaseTask } from './colony-logic.js';
import { ProjectKind } from './colony-store.js';

// Fields (docs/design/07-harmonie.md, « Usage »): when durability or spatial order is the
// colony's weakest point, it gathers units of the renewable resource it over-harvests most and
// plants them as new sources grouped near the camp — a cultivated zone.

/**
 * Renewable resource whose harvest outran its regrowth the most in the colony's territory over
 * the last days (berries if none did).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {boolean} [foodOnly=false] - Only edible resources.
 * @returns {number} Resource id, 0 if nothing renewable is known.
 */
export function fieldResource(ctx, colony, foodOnly = false) {
  const slots = colony.resourceSlots;
  const days = colony.harvested.length / slots;
  let best = 0;
  let bestDeficit = 0;
  for (let r = 1; r < ctx.regrowTicks.length; r++) {
    if (ctx.regrowTicks[r] <= 0 || (foodOnly && ctx.edible[r] !== 1)) continue;
    if (best === 0 && ctx.edible[r] === 1) best = r;
    let deficit = 0;
    for (let d = 0; d < days; d++) {
      deficit += colony.harvested[d * slots + r] - colony.regrown[d * slots + r];
    }
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      best = r;
    }
  }
  return best;
}

/**
 * Opens a field project for the given resource.
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} slot
 * @param {number} resource
 * @param {number} units - Units to gather (then planted `plantCost` at a time).
 * @param {number} tick
 * @returns {void}
 */
export function openField(colony, slot, resource, units, tick) {
  const p = colony.projects[slot];
  p.clear();
  p.kind = ProjectKind.FIELD;
  p.number = colony.fields + 1;
  p.startTick = tick;
  p.needs[resource] = units;
}

/**
 * True if a resource can be planted on this tile: passable plantable biome, no resource, no
 * construction.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function plantable(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  if (p >>> PACK.STRUCTURE_SHIFT !== 0) return false;
  if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) return false;
  return ctx.plantBiome[p & PACK.MASK] === 1;
}

/**
 * Where to plant, among the tiles near the camp that the agent sees: the one with the most free
 * plantable tiles around it (a field rather than scattered bushes), the closest to the camp on a
 * tie, and reachable. Writes x, y in `ctx.recallTarget`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} id
 * @returns {number} Navigation cell, -1 if none.
 */
export function chooseFieldSite(state, ctx, colony, id) {
  const a = ctx.agents;
  const r = ctx.balance.harmony.fieldRadius;
  const sight = perceptionRadius(ctx, id, ctx.dark);
  const nav = ctx.nav;
  let best = -1;
  let bestFree = 0;
  let bestD = Infinity;
  for (let y = colony.campY - r; y <= colony.campY + r; y++) {
    for (let x = colony.campX - r; x <= colony.campX + r; x++) {
      if (Math.abs(x - a.x[id]) > sight || Math.abs(y - a.y[id]) > sight) continue;
      // Keep the camp itself clear.
      const d = Math.max(Math.abs(x - colony.campX), Math.abs(y - colony.campY));
      if (d < 2 || !plantable(state, ctx, x, y)) continue;
      // Orchards in rows: every other row from the camp, an empty one between (decision 0028).
      if ((y - colony.campY) % 2 !== 0) continue;
      const cell = nav.cellAt(x, y);
      if (cell < 0 || !nav.reachable(cell)) continue;
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (plantable(state, ctx, x + dx, y + dy)) free++;
      }
      if (free > bestFree || (free === bestFree && d < bestD)) {
        best = cell;
        bestFree = free;
        bestD = d;
        ctx.recallTarget[0] = x;
        ctx.recallTarget[1] = y;
      }
    }
  }
  return best;
}

/**
 * The planter plants what it carries for its field on its tile and the free tiles beside it in
 * its row,
 * `plantCost` units per new source, then the project is complete.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number} Sources planted.
 */
export function plant(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  const slot = a.taskProject[id];
  if (c < 0 || slot < 0) return 0;
  const colony = state.colonies[c];
  const p = colony.projects[slot];
  if (p.kind !== ProjectKind.FIELD) return 0;
  const h = ctx.balance.harmony;
  let resource = 0;
  for (let g = 1; g < p.needs.length; g++) if (p.needs[g] > 0) resource = g;
  if (resource === 0) return 0;
  const m = ctx.balance.memory;
  let planted = 0;
  // Along its row: its tile and the two beside it.
  for (let k = 3; k < 6 && a.carried(id, resource) >= h.plantCost; k++) {
    const x = a.x[id] + (k % 3) - 1;
    const y = a.y[id] + Math.floor(k / 3) - 1;
    if (!plantable(state, ctx, x, y)) continue;
    state.world.setResource(x, y, resource, h.plantQuantity);
    a.addCarried(id, resource, -h.plantCost);
    a.memory[id].remember(
      resource,
      x,
      y,
      h.plantQuantity,
      state.tick,
      1,
      tauOf(ctx, resource),
      m.sameRadius,
    );
    planted++;
  }
  if (planted === 0) {
    releaseTask(state, ctx, id);
    return 0;
  }
  colony.planted += planted;
  colony.fields++;
  colony.lastField = state.tick;
  p.addContributor(id);
  let helpers = 0;
  for (const other of p.contributors) if (other >= 0) helpers++;
  state.events.push(
    state.tick,
    EventType.COLONY_PROJECT,
    id,
    a.x[id],
    a.y[id],
    helpers * 16 + p.kind,
  );
  colony.lastProject.set(p.contributors);
  releaseTask(state, ctx, id);
  p.clear();
  return planted;
}
