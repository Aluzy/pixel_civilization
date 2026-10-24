import { Place } from './action-types.js';
import { forgetPlace, placeCount, placeX, placeY, rememberPlace } from './places.js';

/**
 * Perception radius of an agent right now (reduced at night, never below the minimum).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {boolean} dark
 * @returns {number}
 */
export function perceptionRadius(ctx, id, dark) {
  const a = ctx.balance.actions;
  const base = ctx.agents.perception[id];
  const r = Math.floor(dark ? base * a.nightPerceptionFactor : base);
  return r < a.minPerception ? a.minPerception : r;
}

/**
 * Looks around: prepares the navigation window and updates the agent's beliefs. Places seen are
 * remembered; remembered places that are visible but no longer valid are forgotten.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function perceive(state, ctx, id) {
  const agents = ctx.agents;
  const nav = ctx.nav;
  nav.prepare(state.world, agents.x[id], agents.y[id], perceptionRadius(ctx, id, ctx.dark));
  const tick = state.tick;

  const water = nav.nearestWaterSide();
  if (water >= 0) rememberPlace(agents, id, Place.WATER, nav.cellX(water), nav.cellY(water), tick);
  const food = nav.nearestResource(ctx.edible);
  if (food >= 0) rememberPlace(agents, id, Place.FOOD, nav.cellX(food), nav.cellY(food), tick);

  // Correct beliefs against what is visible now.
  for (let s = placeCount(agents, id, Place.WATER) - 1; s >= 0; s--) {
    const x = placeX(agents, id, Place.WATER, s);
    const cell = nav.innerCellAt(x, placeY(agents, id, Place.WATER, s));
    if (cell >= 0 && !nav.besideWater(cell)) forgetPlace(agents, id, Place.WATER, s);
  }
  for (let s = placeCount(agents, id, Place.FOOD) - 1; s >= 0; s--) {
    const x = placeX(agents, id, Place.FOOD, s);
    const cell = nav.cellAt(x, placeY(agents, id, Place.FOOD, s));
    if (cell >= 0 && (ctx.edible[nav.resource[cell]] !== 1 || nav.quantity[cell] === 0)) {
      forgetPlace(agents, id, Place.FOOD, s);
    }
  }
}
