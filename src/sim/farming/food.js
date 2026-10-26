import { EventType } from '../core/events.js';

// Food tables (docs/design/13-agriculture-cuisine.md): what each good is worth as food, what can be
// eaten, and how much of that worth comes from crops. Built once from the data.

/**
 * @typedef {object} FoodTables
 * @property {Float64Array} value - Per good: food worth (nutrition of a food, or what an
 *   ingredient such as wheat or flour will be worth once cooked), 0 if none.
 * @property {Uint8Array} food - 1 per good that can be eaten (edible resources and dishes).
 * @property {Float64Array} nutrition - Per good: hunger removed by one unit, 0 if not a food.
 * @property {Float64Array} cropShare - Per good: share of its worth that comes from crops.
 * @property {Float64Array} pleasure - Per good: pleasure of eating it.
 * @property {Int16Array} order - Food goods, most nourishing first (ties by good id).
 */

/**
 * @param {import('../crafting/catalog.js').Catalog} catalog
 * @param {import('../world/world-data.js').WorldTables} tables
 * @param {Uint8Array} cropResource - 1 per resource id grown on plots.
 * @param {number} dishFactor - A dish nourishes this many times its ingredients.
 * @returns {FoodTables}
 */
export function buildFood(catalog, tables, cropResource, dishFactor) {
  const n = catalog.goodCount;
  const value = new Float64Array(n);
  const share = new Float64Array(n);
  const food = new Uint8Array(n);
  const nutrition = new Float64Array(n);
  const pleasure = new Float64Array(n);
  const done = new Uint8Array(n);
  tables.resources.forEach((r, i) => {
    const g = i + 1;
    value[g] = r.nutrition > 0 ? r.nutrition : (r.foodValue ?? 0);
    share[g] = cropResource[g] === 1 ? 1 : 0;
    if (r.nutrition > 0) {
      food[g] = 1;
      nutrition[g] = r.nutrition;
    }
    done[g] = 1;
  });
  const itemOf = (g) => catalog.items[g - catalog.resourceCount - 1];
  /**
   * Worth of a crafted good: the worth of its ingredients, times `dishFactor` for a dish.
   * @param {number} g
   * @returns {number}
   */
  const worth = (g) => {
    if (done[g] === 1) return value[g];
    done[g] = 1;
    const r = catalog.recipeForGood[g];
    if (r < 0) return 0;
    let sum = 0;
    let crop = 0;
    for (const input of catalog.recipes[r].inputs) {
      const v = worth(input.good) * input.count;
      sum += v;
      crop += v * share[input.good];
    }
    const item = itemOf(g);
    const dish = item.kind === 'food';
    value[g] = dish ? Math.round(sum * dishFactor) : sum;
    share[g] = sum > 0 ? crop / sum : 0;
    if (dish) {
      food[g] = 1;
      nutrition[g] = value[g];
      pleasure[g] = item.pleasure;
    }
    return value[g];
  };
  for (let g = catalog.resourceCount + 1; g < n; g++) worth(g);
  const goods = [];
  for (let g = 1; g < n; g++) if (food[g] === 1) goods.push(g);
  goods.sort((a, b) => nutrition[b] - nutrition[a] || a - b);
  return { value, food, nutrition, cropShare: share, pleasure, order: Int16Array.from(goods) };
}

/**
 * Food in a stock, in portions (units of `portion` nutrition).
 * @param {FoodTables} tables
 * @param {ArrayLike<number>} stock - Units per good.
 * @param {number} portion
 * @returns {number}
 */
export function stockPortions(tables, stock, portion) {
  let sum = 0;
  for (let k = 0; k < tables.order.length; k++) {
    const g = tables.order[k];
    sum += stock[g] * tables.nutrition[g];
  }
  return Math.floor(sum / portion);
}

/**
 * Someone ate a unit of `good`: its colony counts the meal (nutrition, the part from crops, a
 * dish), and a dish is a pleasure that soothes curiosity.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} good
 * @returns {void}
 */
export function noteMeal(state, ctx, id, good) {
  const t = ctx.foodTables;
  const a = ctx.agents;
  a.mealTick[id] = state.tick;
  const pleasure = t.pleasure[good];
  if (pleasure > 0) {
    const relief = pleasure * ctx.balance.cooking.pleasureRelief;
    a.curiosity[id] = a.curiosity[id] > relief ? a.curiosity[id] - relief : 0;
  }
  const c = a.colony[id];
  if (c < 0) return;
  const colony = state.colonies[c];
  const n = t.nutrition[good];
  colony.eaten += n;
  colony.eatenToday += n;
  colony.eatenCrop += n * t.cropShare[good];
  colony.cropToday += n * t.cropShare[good];
  if (pleasure <= 0) return;
  if (colony.dishes === 0) {
    state.events.push(state.tick, EventType.FIRST_DISH, id, a.x[id], a.y[id], good);
  }
  colony.dishes++;
  colony.dishesToday++;
}
