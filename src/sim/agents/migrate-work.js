import { andNot, popcount } from '../core/bits.js';
import { atCamp, campOf } from '../colony/colony-logic.js';
import { Expedition } from '../colony/colony-store.js';
import { findSite, openExpedition, postExpedition } from '../colony/migration.js';
import { take } from '../economy/market.js';
import { DocKind } from '../knowledge/document-store.js';
import { Action } from './action-types.js';
import { goToCamp } from './colony-work.js';
import { PlanNote } from './journal.js';
import { explore, moveTo, startHere } from './movement.js';
import { gather, useRecipe } from './work.js';

// Behaviour of the goal Migrer (docs/design/15-colonies-et-migration.md): the scout looks for a
// site beyond the colony's usual range; the members of the expedition wait at the camp while it
// recruits, take their provisions, then walk to the site, where one who knows how builds the
// first shelter.

/**
 * At the camp, before leaving: food for the journey (portions of the most nourishing food first),
 * for the leader the materials of a shelter, and a copy of a book of the library if the stock has
 * the paper and ink for it. Taken from the colony's stock, unpaid: it is the colony's venture.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {void}
 */
function provision(state, ctx, colony, id) {
  const a = ctx.agents;
  if (a.provisioned[id] === 1) return;
  a.provisioned[id] = 1;
  const room = () => Math.floor(ctx.capacity(id) - a.carriedTotal(id));
  const t = ctx.foodTables;
  let want = ctx.balance.migration.provisionPortions * ctx.balance.cooking.portion;
  for (let k = 0; k < t.order.length && want > 0; k++) {
    const g = t.order[k];
    const n = Math.min(Math.ceil(want / t.nutrition[g]), colony.stock[g], room());
    if (n <= 0) continue;
    take(colony, g, n);
    a.addCarried(id, g, n, state.tick);
    want -= n * t.nutrition[g];
  }
  if (colony.expLeader !== id || !colony.inExpedition(id)) return;
  const shelter = ctx.catalog.recipes[ctx.catalog.recipeForStructure[ctx.shelterCode]];
  for (const input of shelter.inputs) {
    const n = Math.min(input.count - a.carried(id, input.good), colony.stock[input.good], room());
    if (n <= 0) continue;
    take(colony, input.good, n);
    a.addCarried(id, input.good, n, state.tick);
  }
  copyBook(state, ctx, colony, id);
}

/**
 * The richest book kept in the colony's libraries is copied for the leader, on paper and ink of
 * the stock (as a book is made): knowledge travels with the migrants.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {void}
 */
function copyBook(state, ctx, colony, id) {
  const docs = state.documents;
  const recipe = ctx.catalog.recipes[ctx.catalog.recipeForGood[ctx.docGood[DocKind.BOOK]]];
  if (!recipe) return;
  for (const input of recipe.inputs) if (colony.stock[input.good] < input.count) return;
  let best = -1;
  let bestCount = 0;
  for (let d = 0; d < docs.max; d++) {
    if (docs.kind[d] !== DocKind.BOOK || docs.colony[d] !== colony.id || docs.library[d] < 0) {
      continue;
    }
    const n = popcount(andNot(docs.recipes[d], docs.wrong[d]));
    if (n > bestCount) {
      bestCount = n;
      best = d;
    }
  }
  if (best < 0) return;
  const copy = docs.create(DocKind.BOOK, id, state.tick);
  if (copy < 0) return;
  for (const input of recipe.inputs) take(colony, input.good, input.count);
  ctx.agents.addCarried(id, ctx.docGood[DocKind.BOOK], 1, state.tick);
  docs.recipes[copy] = docs.recipes[best];
  docs.wrong[copy] = docs.wrong[best];
  docs.author[copy] = docs.author[best];
}

/**
 * Migrating: the scout explores far from the camp until it remembers a site, then posts the
 * expedition; a member waits at the camp while the expedition recruits, then walks to the site and
 * founds the colony there (the first shelter).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function migrateBehaviour(state, ctx, id, plan) {
  const a = ctx.agents;
  plan.note = PlanNote.MIGRATING;
  const colony = campOf(state, ctx, id);
  if (!colony) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  if (!colony.inExpedition(id)) {
    const site = ctx.recallTarget;
    if (findSite(state, ctx, colony, id, site)) {
      openExpedition(state, ctx, colony, id, site[0], site[1]);
    } else {
      scout(state, ctx, colony, id, plan);
      return;
    }
  }
  if (colony.expState === Expedition.RECRUITING || a.provisioned[id] === 0) {
    if (!atCamp(ctx, colony, id)) {
      if (!goToCamp(ctx, colony, id, Action.IDLE, plan)) explore(state, ctx, id, plan);
    } else {
      if (colony.expLeader === id) postExpedition(state, ctx, colony, id);
      provision(state, ctx, colony, id);
      startHere(ctx, id, Action.IDLE);
    }
    plan.note = PlanNote.MIGRATING;
    return;
  }
  const x = colony.expX;
  const y = colony.expY;
  const far = Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y));
  if (far <= ctx.balance.migration.arriveRadius) {
    // On the site: who knows how builds the first shelter, with what it carries or gathers here.
    const r = ctx.catalog.recipeForStructure[ctx.shelterCode];
    if (r < 0 || !a.recipes[id].knows(r)) {
      startHere(ctx, id, Action.IDLE);
    } else {
      pool(ctx, colony, id, r);
      const missing = ctx.catalog.recipes[r].inputs.find((i) => a.carried(id, i.good) < i.count);
      if (missing) gather(state, ctx, id, missing.good, missing.count, plan);
      else useRecipe(state, ctx, id, r, plan);
    }
    plan.note = PlanNote.MIGRATING;
    return;
  }
  const cell = ctx.nav.toward(x, y);
  if (cell >= 0 && moveTo(ctx, id, cell, Action.NONE)) {
    plan.action = Action.MOVE;
    plan.x = x;
    plan.y = y;
    return;
  }
  explore(state, ctx, id, plan);
  plan.note = PlanNote.MIGRATING;
}

/**
 * The scout takes food at the camp, then goes from point to point of the ring between
 * `minDistance` and `maxDistance` around the camp (beyond the colony's usual range), sleeping
 * where it is.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function scout(state, ctx, colony, id, plan) {
  const a = ctx.agents;
  const cfg = ctx.balance.migration;
  // Food for the way first: it sleeps and eats where it goes.
  if (a.provisioned[id] === 0) {
    if (atCamp(ctx, colony, id)) provision(state, ctx, colony, id);
    else if (goToCamp(ctx, colony, id, Action.IDLE, plan)) {
      plan.note = PlanNote.MIGRATING;
      return;
    }
  }
  // A point on the ring where a colony could be, then another: the ring is searched in turn.
  const reached =
    Math.max(Math.abs(a.exploreX[id] - a.x[id]), Math.abs(a.exploreY[id] - a.y[id])) <= 2;
  const ring = Math.max(
    Math.abs(a.exploreX[id] - colony.campX),
    Math.abs(a.exploreY[id] - colony.campY),
  );
  if (a.exploring[id] !== 1 || reached || ring < cfg.minDistance || ring > cfg.maxDistance) {
    const rng = a.rng[id];
    const d = rng.int(cfg.minDistance, cfg.maxDistance);
    const along = rng.int(-d, d);
    const side = rng.int(0, 3);
    a.exploreX[id] = colony.campX + (side === 0 ? d : side === 1 ? -d : along);
    a.exploreY[id] = colony.campY + (side === 2 ? d : side === 3 ? -d : along);
    a.exploring[id] = 1;
  }
  explore(state, ctx, id, plan);
  plan.note = PlanNote.MIGRATING;
}

/**
 * On the site, the builder of the first shelter takes what it lacks from the members of its
 * expedition close by (decision 0030): one carries the wood, another the stone.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} r - The shelter's recipe.
 * @returns {void}
 */
function pool(ctx, colony, id, r) {
  const a = ctx.agents;
  const reach = ctx.balance.migration.poolRadius;
  for (const input of ctx.catalog.recipes[r].inputs) {
    for (let k = 0; k < colony.expMembers.length; k++) {
      const m = colony.expMembers[k];
      const short = input.count - a.carried(id, input.good);
      if (short <= 0) break;
      if (m < 0 || m === id) continue;
      if (Math.max(Math.abs(a.x[m] - a.x[id]), Math.abs(a.y[m] - a.y[id])) > reach) continue;
      const n = Math.min(short, a.carried(m, input.good));
      if (n <= 0) continue;
      a.addCarried(m, input.good, -n);
      a.addCarried(id, input.good, n);
    }
  }
}
