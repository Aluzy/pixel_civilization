// Prices of the colony's counter (docs/design/14-economie.md, « Le marché »). Every good has a
// base price, its worth when the counter opens: food by what it nourishes (and the pleasure of a
// dish), materials by the work they take, crafted goods by their inputs and the work of making
// them. Each day the counter moves its reference price towards the base price times the scarcity
// of the good: the stock against what is taken from it per day. All values are plain numbers made
// with +, ×, / and sqrt only (decision 0005).

/**
 * Base price of every good (index = good id), in écus.
 * @param {import('../crafting/catalog.js').Catalog} catalog
 * @param {import('../world/world-data.js').WorldTables} tables
 * @param {import('../farming/food.js').FoodTables} food
 * @param {Int16Array} sourceOf - Per good: resource that yields it as a by-product, 0 if none.
 * @param {object} cfg - balance.economy.
 * @returns {Float64Array}
 */
export function basePrices(catalog, tables, food, sourceOf, cfg) {
  const n = catalog.goodCount;
  const base = new Float64Array(n);
  const done = new Uint8Array(n);
  /**
   * @param {number} g
   * @returns {number}
   */
  const priceOf = (g) => {
    if (done[g] === 1) return base[g];
    done[g] = 1;
    const eaten = food.value[g] * cfg.coinsPerNutrition + food.pleasure[g] * cfg.pleasureCoins;
    let work = 0;
    if (g <= catalog.resourceCount) {
      const r = tables.resources[g - 1];
      // Gold and gems are worth more than the work of mining them.
      work = Math.max((r.harvestTicks ?? 1) * cfg.coinsPerTick, r.value ?? 0);
    } else if (catalog.recipeForGood[g] >= 0) {
      const recipe = catalog.recipes[catalog.recipeForGood[g]];
      work = recipe.duration * cfg.coinsPerTick;
      for (const input of recipe.inputs) work += priceOf(input.good) * input.count;
    } else if (sourceOf[g] > 0) {
      // A by-product (a seed, a hide) is worth what gathering its source is.
      work = priceOf(sourceOf[g]);
    }
    base[g] = Math.max(eaten, work, cfg.priceMin);
    return base[g];
  };
  for (let g = 1; g < n; g++) priceOf(g);
  return base;
}

/**
 * What the counter pays for one unit (whole écus).
 * @param {number} price - Reference price.
 * @returns {number}
 */
export function bidOf(price) {
  return Math.floor(price);
}

/**
 * What the counter asks for one unit (whole écus, at least 1).
 * @param {number} price - Reference price.
 * @param {number} spread - balance.economy.spread.
 * @returns {number}
 */
export function askOf(price, spread) {
  const ask = Math.ceil(price * spread);
  return ask < 1 ? 1 : ask;
}

/**
 * Scarcity of a good: how far its stock is from `stockDays` days of what is taken from it plus
 * what the colony's projects still wait for, as a factor on its base price (square root, so that
 * prices move but stay sensible), within [scarcityMin, scarcityMax].
 * @param {number} stock
 * @param {number} usePerDay
 * @param {number} wanted - Units the projects still need.
 * @param {object} cfg - balance.economy.
 * @returns {number}
 */
export function scarcity(stock, usePerDay, wanted, cfg) {
  const f = Math.sqrt((cfg.stockDays * usePerDay + wanted + 1) / (stock + 1));
  return f < cfg.scarcityMin ? cfg.scarcityMin : f > cfg.scarcityMax ? cfg.scarcityMax : f;
}

/**
 * The counter's day: what was taken from the stock today revises the daily use of each good, and
 * the reference price moves a step towards base × scarcity.
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {Float64Array} base
 * @param {Int32Array} wanted - Per good: units the colony's projects still need.
 * @param {object} cfg - balance.economy.
 * @returns {void}
 */
export function updatePrices(colony, base, wanted, cfg) {
  const step = cfg.priceStep;
  for (let g = 1; g < base.length; g++) {
    colony.useAvg[g] += (colony.outToday[g] - colony.useAvg[g]) * cfg.useStep;
    const target = base[g] * scarcity(colony.stock[g], colony.useAvg[g], wanted[g], cfg);
    const p = colony.price[g] + (target - colony.price[g]) * step;
    colony.price[g] = p < cfg.priceMin ? cfg.priceMin : p;
    colony.outToday[g] = 0;
    colony.inToday[g] = 0;
  }
}
