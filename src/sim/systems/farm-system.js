import { EventType } from '../core/events.js';
import { FALLOW } from '../farming/crop-store.js';
import { stockPortions } from '../farming/food.js';
import { PACK } from '../world/chunk-store.js';

/**
 * Once a day, at dawn of the new day, every plant grows (docs/design/13-agriculture-cuisine.md,
 * « Cultiver »): a plant watered the day before gains a stage; one left dry for `dryDays` days in
 * a row withers; a ripe plant puts its crop on the plot (harvested like any resource); a ripe crop
 * left `overripeDays` days falls and sows itself. Each colony's food in stock is also noted.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function farmSystem(state, ctx) {
  const perDay = ctx.balance.time.ticksPerDay;
  if (state.tick === 0 || state.tick % perDay !== 0) return;
  const day = state.tick / perDay;
  const cfg = ctx.balance.agriculture;
  // The pantry's trend, day after day (births wait while food runs down), and yesterday's meals.
  for (const colony of state.colonies) {
    colony.eatenYesterday = colony.eatenToday;
    colony.cropYesterday = colony.cropToday;
    colony.dishesYesterday = colony.dishesToday;
    colony.eatenToday = 0;
    colony.cropToday = 0;
    colony.dishesToday = 0;
    const d = colony.pantryDays;
    d.copyWithin(0, 1);
    d[d.length - 1] = stockPortions(ctx.foodTables, colony.stock, ctx.balance.cooking.portion);
  }
  const crops = state.crops;
  for (let p = 0; p < crops.count; p++) {
    const stage = crops.stage[p];
    if (stage === FALLOW) continue;
    const crop = ctx.crops[crops.crop[p]];
    const x = crops.x[p];
    const y = crops.y[p];
    if (stage >= crop.stages) {
      if (day - crops.ripeDay[p] < cfg.overripeDays) continue;
      // Left too long: the grain falls and the plot sows itself.
      const resource = (state.world.packedAt(x, y) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
      if (resource === crop.resource) state.world.setResource(x, y, 0, 0);
      crops.sow(p, crops.crop[p]);
      continue;
    }
    if (crops.watered[p] === day - 1) {
      crops.dry[p] = 0;
      crops.stage[p] = stage + 1;
      if (stage + 1 >= crop.stages) {
        crops.ripeDay[p] = day;
        state.world.setResource(x, y, crop.resource, crop.yield);
      }
    } else if (++crops.dry[p] >= cfg.dryDays) {
      crops.stage[p] = FALLOW;
      const colony = state.colonies[crops.colony[p]];
      if (colony) colony.withered++;
    }
  }
}

/**
 * A crop was harvested to the last unit: its plot is bare again.
 * @param {import('../simulation.js').SimState} state
 * @param {number} x
 * @param {number} y
 * @param {number} agent - Who took the last unit.
 * @returns {boolean} True if (x, y) is a plot.
 */
export function harvestedPlot(state, x, y, agent) {
  const p = state.crops.at(x, y);
  if (p < 0) return false;
  state.crops.stage[p] = FALLOW;
  const colony = state.colonies[state.crops.colony[p]];
  if (!colony) return true;
  if (colony.cropHarvests === 0) state.events.push(state.tick, EventType.HARVEST, agent, x, y);
  colony.cropHarvests++;
  return true;
}
