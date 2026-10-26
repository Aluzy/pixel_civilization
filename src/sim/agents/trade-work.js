import { campOf } from '../colony/colony-logic.js';
import { EventType } from '../core/events.js';
import { bestCaravan } from '../economy/jobs.js';
import { buy, roleOf, sell } from '../economy/market.js';
import { askOf, bidOf } from '../economy/prices.js';
import { Action } from './action-types.js';
import { goToCamp } from './colony-work.js';
import { PlanNote } from './journal.js';
import { explore, moveTo, startHere } from './movement.js';

// Caravans (docs/design/15-colonies-et-migration.md, « Commerce »): a merchant buys at its
// colony's counter a load of what another colony's counter pays more for, walks there, sells it,
// buys there what its own counter pays more for, comes back, sells it, and posts the prices it
// saw on its colony's relation sheet.

/**
 * True if the agent is a merchant with a caravan under way or one worth starting.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('../colony/colony-store.js').Colony | null} home
 * @returns {boolean}
 */
export function senseTrade(ctx, id, home) {
  if (home === null) return false;
  const role = roleOf(ctx, home, id);
  if (role < 0 || !ctx.jobs.jobs[role].trade) return false;
  return ctx.agents.caravanTo[id] >= 0 || bestCaravan(ctx, id, null) > 0;
}

/**
 * True if the agent stands at the camp of `colony` (within `campRadius`).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function atPlace(ctx, id, x, y) {
  const r = ctx.balance.colony.campRadius;
  const a = ctx.agents;
  return Math.abs(a.x[id] - x) <= r && Math.abs(a.y[id] - y) <= r;
}

/**
 * Walks towards (x, y): a step in sight, else exploring (beyond the colony's range).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function walkTo(state, ctx, id, x, y, plan) {
  const cell = ctx.nav.toward(x, y);
  if (cell >= 0 && moveTo(ctx, id, cell, Action.NONE)) {
    plan.action = Action.MOVE;
    plan.x = x;
    plan.y = y;
    return;
  }
  explore(state, ctx, id, plan);
}

/**
 * A load of `good` bought at `colony`'s counter, as much as it can carry and pay for.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} good
 * @returns {number}
 */
function load(state, ctx, colony, id, good) {
  const room = Math.floor(ctx.capacity(id) - ctx.agents.carriedTotal(id));
  return room > 0 ? buy(state, ctx, colony, id, good, room, true) : 0;
}

/**
 * At the other colony: sells the load, notes the trade and the prices, and buys what its own
 * counter pays more for (as it last saw its prices).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} home
 * @param {number} id
 * @returns {void}
 */
function trade(state, ctx, home, id) {
  const a = ctx.agents;
  const k = a.caravanTo[id];
  const other = state.colonies[k];
  const G = a.goodSlots;
  const g = a.caravanGood[id];
  if (g > 0 && a.carried(id, g) > 0) sell(state, ctx, other, id, g, a.carried(id, g));
  if (home.relTrades[k] === 0) {
    state.events.push(state.tick, EventType.FIRST_TRADE, id, a.x[id], a.y[id], k, home.id);
  }
  home.relTrades[k]++;
  other.relTrades[home.id]++;
  // The other colony learns where it comes from.
  if (other.relKnown[home.id] !== 1) {
    other.relKnown[home.id] = 1;
    other.relCampX[home.id] = home.campX;
    other.relCampY[home.id] = home.campY;
  }
  a.caravanPrice.set(other.price, id * G);
  let best = 0;
  let bestMargin = 0;
  const spread = ctx.balance.economy.spread;
  for (let h = 1; h < G; h++) {
    if (other.stock[h] === 0) continue;
    const margin = bidOf(a.priceSeen[id * G + h]) - askOf(other.price[h], spread);
    if (margin > bestMargin) {
      bestMargin = margin;
      best = h;
    }
  }
  a.caravanGood[id] = best > 0 && load(state, ctx, other, id, best) > 0 ? best : 0;
  a.caravanLeg[id] = 2;
}

/**
 * A halt on the way (decision 0029): passing near the camp of a third colony its own colony knows,
 * the merchant trades there once: it sells part of its load if that counter pays more than it
 * paid, and the two colonies count a trade (a trade route, later paved). Relays live on it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} home
 * @param {number} id
 * @returns {void}
 */
function halt(state, ctx, home, id) {
  const a = ctx.agents;
  const to = a.caravanTo[id];
  const r = ctx.balance.economy.haltRadius;
  for (let c = 0; c < state.colonies.length; c++) {
    if (c === home.id || c === to || c === a.caravanHalt[id] || home.relKnown[c] !== 1) continue;
    const stop = state.colonies[c];
    if (stop.members === 0 || !stop.hasCamp) continue;
    if (Math.abs(a.x[id] - stop.campX) > r || Math.abs(a.y[id] - stop.campY) > r) continue;
    a.caravanHalt[id] = c;
    const g = a.caravanGood[id];
    const G = a.goodSlots;
    const spread = ctx.balance.economy.spread;
    const held = g > 0 ? a.carried(id, g) : 0;
    // It sells there only at a profit over what its own counter asked.
    if (held > 0 && bidOf(stop.price[g]) > askOf(a.priceSeen[id * G + g], spread)) {
      sell(state, ctx, stop, id, g, Math.ceil(held * ctx.balance.economy.haltShare));
    }
    if (home.relTrades[c] === 0) {
      state.events.push(state.tick, EventType.FIRST_TRADE, id, a.x[id], a.y[id], c, home.id);
    }
    home.relTrades[c]++;
    stop.relTrades[home.id]++;
    if (stop.relKnown[home.id] !== 1) {
      stop.relKnown[home.id] = 1;
      stop.relCampX[home.id] = home.campX;
      stop.relCampY[home.id] = home.campY;
    }
    return;
  }
}

/**
 * The merchant's caravan: buy a load at home, walk to the other colony, trade there, come back,
 * sell the return load and post the prices seen.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function tradeBehaviour(state, ctx, id, plan) {
  const a = ctx.agents;
  plan.note = PlanNote.TRADING;
  const home = campOf(state, ctx, id);
  if (!home) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  const k = a.caravanTo[id];
  const atHome = atPlace(ctx, id, home.campX, home.campY);
  if (k < 0) {
    if (!atHome) {
      if (!goToCamp(ctx, home, id, Action.IDLE, plan)) explore(state, ctx, id, plan);
      plan.note = PlanNote.TRADING;
      return;
    }
    const out = ctx.costOut;
    if (bestCaravan(ctx, id, out) <= 0 || load(state, ctx, home, id, out[1]) === 0) {
      startHere(ctx, id, Action.IDLE);
      return;
    }
    a.caravanTo[id] = out[0];
    a.caravanLeg[id] = 1;
    a.caravanGood[id] = out[1];
  }
  const to = a.caravanTo[id];
  halt(state, ctx, home, id);
  if (a.caravanLeg[id] === 1) {
    const other = state.colonies[to];
    if (atPlace(ctx, id, other.campX, other.campY)) {
      trade(state, ctx, home, id);
      startHere(ctx, id, Action.IDLE);
    } else walkTo(state, ctx, id, home.relCampX[to], home.relCampY[to], plan);
    plan.note = PlanNote.TRADING;
    return;
  }
  if (!atHome) {
    walkTo(state, ctx, id, home.campX, home.campY, plan);
    plan.note = PlanNote.TRADING;
    return;
  }
  // Back home: the return load is sold, the prices seen over there are posted.
  const g = a.caravanGood[id];
  if (g > 0 && a.carried(id, g) > 0) sell(state, ctx, home, id, g, a.carried(id, g));
  const G = a.goodSlots;
  home.relPrice.set(a.caravanPrice.subarray(id * G, (id + 1) * G), to * G);
  home.relPriceTick[to] = state.tick;
  a.caravanTo[id] = -1;
  a.caravanLeg[id] = 0;
  a.caravanGood[id] = 0;
  a.caravanHalt[id] = -1;
  startHere(ctx, id, Action.IDLE);
}
