import { Tier } from '../agents/agent-store.js';
import { has, or } from '../core/bits.js';
import { stockPortions } from '../farming/food.js';
import { take } from '../economy/market.js';
import { bear } from './replication.js';
import { TownMap } from './town-map.js';
import { ProjectKind } from './colony-store.js';
import { claimFreeStock } from './colony-logic.js';
import { freeLand } from './works.js';
import { PACK } from '../world/chunk-store.js';

/** Water-cost of a house without any water within reach: it gets the first well. */
const WELL_FIRST = 1e9;

// The people of a town (decision 0030, docs/design/19-grand-essor.md): a colony past
// `commonFrom` members keeps a few figures, who think with the whole AI, and its other members
// are commoners, who follow the routine of their trade with the town's map for knowledge. The
// town gives birth when it has a free bed and food to spare (a household's birth), and its
// commoners each have a bed of their own.

/**
 * Figures a colony keeps: all its members while it is small, then `figures` and a share of its
 * members.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number}
 */
export function figureQuota(ctx, colony) {
  const p = ctx.balance.people;
  if (colony.members < p.commonFrom) return colony.members;
  return Math.min(colony.members, p.figures + Math.floor(colony.members * p.figureShare));
}

/**
 * The town's map, drawn again when it is older than `mapTicks`, or a quarter of that when a
 * structure changed on it (null without a camp).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {TownMap | null}
 */
export function townMap(state, ctx, colony) {
  if (!colony.hasCamp) return null;
  const p = ctx.balance.people;
  if (colony.map === null) {
    colony.map = new TownMap(p.mapRadius, ctx.catalog.resourceCount + 1, p.mapSlots, p.drinkSlots);
  }
  const map = colony.map;
  const age = state.tick - map.builtTick;
  // Drawn again every `mapTicks`, sooner when something was built or dug on it.
  const stale =
    map.builtTick < 0 ||
    age >= p.mapTicks ||
    (age >= p.mapTicks / 4 &&
      state.world.changedSince(
        map.originX,
        map.originY,
        map.originX + map.side - 1,
        map.originY + map.side - 1,
        map.worldStamp,
      ));
  if (stale) map.build(state, ctx, colony.campX, colony.campY);
  return map;
}

/**
 * A bed of the colony nobody owns, for a commoner; -1 if every bed is owned.
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {number} id
 * @returns {number} Bed index.
 */
export function claimBed(colony, a, id) {
  if (a.bed[id] >= 0 && colony.bedOwner[a.bed[id]] === id) return a.bed[id];
  for (let k = colony.bedHint; k < colony.bedCount; k++) {
    if (colony.bedOwner[k] >= 0) continue;
    colony.bedOwner[k] = id;
    colony.bedHint = k + 1;
    a.bed[id] = k;
    return k;
  }
  colony.bedHint = colony.bedCount;
  a.bed[id] = -1;
  return -1;
}

/**
 * Gives the agent's bed back to its colony.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {number} id
 * @returns {void}
 */
export function releaseBed(state, a, id) {
  const k = a.bed[id];
  a.bed[id] = -1;
  const c = a.colony[id];
  if (k < 0 || c < 0) return;
  const colony = state.colonies[c];
  if (colony.bedOwner[k] !== id) return;
  colony.bedOwner[k] = -1;
  if (k < colony.bedHint) colony.bedHint = k;
}

/**
 * Per colony, at each pass of the colony system, once members are counted (`figures`, what the
 * figures know, a member at the camp to be a parent and a commoner to promote, by the caller):
 * the town's map is kept fresh, a commoner is promoted when figures are missing, and households
 * give birth.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} parent - A member at the camp (-1 none).
 * @param {number} commoner - A commoner of the colony (-1 none).
 * @returns {void}
 */
export function peoplePass(state, ctx, colony, parent, commoner) {
  const a = ctx.agents;
  if (colony.members >= ctx.balance.people.commonFrom) {
    const map = townMap(state, ctx, colony);
    // A freshly drawn map shows the houses far from water: a well for them.
    if (map !== null && map.builtTick === state.tick) wellProject(state, ctx, colony, map);
  }
  if (commoner >= 0 && colony.figures < figureQuota(ctx, colony)) {
    releaseBed(state, a, commoner);
    a.promote(commoner);
    colony.figures++;
  }
  if (parent >= 0) household(state, ctx, colony, parent);
}

/**
 * A household's birth (decision 0030): the colony gives birth at the rate of `birthShare` per
 * member and per day, when a bed is free and the pantry holds `birthFood` portions beyond
 * `birthPantry` per member; the newborn's food is taken from the stock. It is a figure while the
 * colony lacks figures, else a commoner.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} parent
 * @returns {void}
 */
function household(state, ctx, colony, parent) {
  const p = ctx.balance.people;
  const a = ctx.agents;
  const perPass = ctx.balance.colony.taskInterval / ctx.balance.time.ticksPerDay;
  colony.birthCredit = Math.min(2, colony.birthCredit + colony.members * p.birthShare * perPass);
  if (colony.birthCredit < 1) return;
  if (a.aliveCount >= ctx.balance.colony.maxPopulation) return;
  if (colony.beds() <= colony.members) return;
  const portion = ctx.balance.cooking.portion;
  const food = stockPortions(ctx.foodTables, colony.stock, portion);
  if (food < p.birthFood + colony.members * p.birthPantry) return;
  const tier = colony.figures < figureQuota(ctx, colony) ? Tier.FIGURE : Tier.COMMONER;
  const child = bear(state, ctx, parent, tier);
  if (child < 0) return;
  colony.birthCredit -= 1;
  if (tier === Tier.FIGURE) colony.figures++;
  // The newborn's food, the least nourishing first.
  const t = ctx.foodTables;
  let due = p.birthFood * portion;
  for (let k = t.order.length - 1; k >= 0 && due > 0; k--) {
    const g = t.order[k];
    const n = Math.min(colony.stock[g], Math.ceil(due / t.nutrition[g]));
    if (n <= 0) continue;
    take(colony, g, n);
    due -= n * t.nutrition[g];
  }
}

/**
 * Adds what a figure knows how to make to its colony's know-how.
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {number} id
 * @returns {void}
 */
export function addKnowhow(colony, a, id) {
  colony.knowhow = or(colony.knowhow, a.recipes[id].knownMask());
}

/**
 * Opens a well (decision 0030) when a house of the town lies farther than `wellRadius` from any
 * water: the town's commoners dig it on an open spot near that house.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {TownMap} map
 * @returns {void}
 */
function wellProject(state, ctx, colony, map) {
  if (ctx.wellCode === 0 || colony.findProject(ProjectKind.WELL) >= 0) return;
  const r = ctx.catalog.recipeForStructure[ctx.wellCode];
  if (r < 0 || !planWell(state, ctx, colony, map, ctx.siteOut)) return;
  const slot = colony.freeSlot();
  if (slot < 0) return;
  const p = colony.projects[slot];
  p.clear();
  p.kind = ProjectKind.WELL;
  p.recipe = r;
  p.number = 1;
  p.startTick = state.tick;
  for (const input of ctx.catalog.recipes[r].inputs) p.needs[input.good] = input.count;
  p.tileX[0] = ctx.siteOut[0];
  p.tileY[0] = ctx.siteOut[1];
  p.tileLen = 1;
  claimFreeStock(colony, p);
}

/**
 * Where to dig a well: near the house (by its first bed) farthest from water on the map, when it
 * lies farther than `wellRadius` from it, or when the town has fewer wells than one for
 * `membersPerWell` members and that house is not by the water already; an open spot (free
 * ground all around it, so that it blocks no way). Without one there, the next house farthest
 * from water, up to `wellTries` houses.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {TownMap} map
 * @param {Int32Array} out - Receives x, y.
 * @returns {boolean}
 */
export function planWell(state, ctx, colony, map, out) {
  const p = ctx.balance.people;
  const crowded = map.wells * p.membersPerWell < colony.members;
  // The houses from the farthest from water down, until one has an open spot near it.
  let below = Infinity;
  for (let tries = 0; tries < p.wellTries; tries++) {
    let far = -1;
    let farD = 0;
    for (let k = 0; k < colony.bedCount; k = colony.bedHouse[k] + colony.houseBeds[k]) {
      const c = map.cellAt(colony.bedX[k], colony.bedY[k]);
      if (c < 0) continue;
      // A house with no water within reach at all comes first.
      const d = map.dist[c] === Infinity ? 0 : Math.min(map.wetDist[c], WELL_FIRST);
      if (d >= below || d <= farD) continue;
      farD = d;
      far = k;
    }
    if (far < 0 || farD <= (crowded ? p.wellNear : p.wellRadius)) return false;
    below = farD;
    const bx = colony.bedX[far];
    const by = colony.bedY[far];
    for (let d = 2; d <= 6; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          if (!openSpot(state, ctx, map, bx + dx, by + dy)) continue;
          out[0] = bx + dx;
          out[1] = by + dy;
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {TownMap} map
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True if (x, y) is free ground the town reaches, in the open (six of the
 *   eight tiles around it free) and by no door: a well there blocks no way.
 */
function openSpot(state, ctx, map, x, y) {
  if (!map.reaches(x, y) || !freeLand(state, ctx, x, y)) return false;
  let free = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const code = state.world.packedAt(x + dx, y + dy) >>> PACK.STRUCTURE_SHIFT;
      if (ctx.passage[code] === 1) return false;
      if (freeLand(state, ctx, x + dx, y + dy)) free++;
    }
  }
  return free >= 6;
}

/**
 * Whether the agent can make recipe `r`: a figure if it knows it, one of the people if its town
 * does (decision 0030).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} r
 * @returns {boolean}
 */
export function makes(ctx, id, r) {
  const a = ctx.agents;
  if (a.tier[id] !== Tier.COMMONER) return a.recipes[id].knows(r);
  const c = a.colony[id];
  return c >= 0 && has(ctx.colonies[c].knowhow, ctx.catalog.knowFor[r]);
}

/**
 * Strengthens the memory of a recipe just used (figures only: the people keep no book).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} r
 * @returns {void}
 */
export function used(state, ctx, id, r) {
  const a = ctx.agents;
  if (a.tier[id] === Tier.COMMONER) return;
  a.recipes[id].use(r, state.tick, ctx.balance.memory.consolidation, ctx.maxTau);
}
