import { BARE_HANDS } from './catalog.js';

/**
 * @typedef {object} TrialWeights
 * @property {number} recentTicks - An ingredient acquired this recently counts as new.
 * @property {number} recentBonus - Per new ingredient.
 * @property {number} costPerType - Malus per ingredient consumed by a failure.
 * @property {number} stationBonus - Stations are made to transform: trying one is promising.
 * @property {number} similarBonus - Times the likeness to the closest known recipe of the kind
 *   sought (shared ingredients / all ingredients).
 * @property {number} familiarBonus - Times the summed likeness to all known recipes.
 * @property {number} kindStationBonus - Station where things of the kind sought were made.
 * @property {number} kindElsewhere - Malus on a station where no structure was ever made, when
 *   looking for a structure and knowing where structures are made.
 * @property {number} craftedBonus - Per crafted material in the set, when looking for something to
 *   write on (writing is made of crafted materials).
 * @property {number} materialStationBonus - Raw materials at a station where a crafted material was
 *   made, when looking for something to write on (another material may be made there).
 * @property {number} jitter - Random part, so that equal candidates are tried in varied order.
 */

/**
 * @param {number} m
 * @returns {number}
 */
function popcount(m) {
  let n = 0;
  for (let v = m; v !== 0; v &= v - 1) n++;
  return n;
}

/**
 * Chooses the next trial (docs/design/04-fabrication.md, « Découverte par l'essai »): every set
 * of 1 to 3 materials the agent carries or knows where to find, on each station it can use,
 * minus the known recipes and the remembered failures, scored by the curiosity heuristic minus
 * the cost of fetching what it lacks and of walking to the station. Allocation-free.
 * @param {import('./catalog.js').Catalog} catalog
 * @param {import('./recipe-book.js').RecipeBook} book
 * @param {Float64Array} fetchCost - Per good: 0 if carried, the cost of fetching it if its place
 *   is known, Infinity if out of reach.
 * @param {(good: number) => number} acquired - Tick the good was last picked up for the first
 *   time (or a very old tick).
 * @param {Uint8Array} stations - 1 for each station code the agent can use; index 0 is bare hands.
 * @param {Float64Array} stationCost - Score malus of each station (the walk to get there).
 * @param {number} tick
 * @param {TrialWeights} weights
 * @param {import('../core/rng.js').Rng} rng
 * @param {Int32Array} types - Scratch, length ≥ goods count.
 * @param {string | null} wanted - Family sought ("structure", "item:weapon"…), or null.
 * @param {Int32Array} out - Receives station, mask, and the number of candidates.
 * @returns {boolean} False when there is nothing left to try.
 */
export function chooseTrial(
  catalog,
  book,
  fetchCost,
  acquired,
  stations,
  stationCost,
  tick,
  weights,
  rng,
  types,
  wanted,
  out,
) {
  let n = 0;
  for (let g = 1; g < catalog.goodCount; g++) {
    if (catalog.material[g] === 1 && fetchCost[g] !== Infinity) types[n++] = g;
  }
  let best = -Infinity;
  let candidates = 0;
  for (let s = 0; s < stations.length; s++) {
    if (s !== BARE_HANDS && stations[s] !== 1) continue;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        for (let k = j; k < n; k++) {
          if (!isCanonical(i, j, k)) continue;
          const a = types[i];
          const b = types[j];
          const c = types[k];
          const mask = (1 << a) | (1 << b) | (1 << c);
          const score = scoreTrial(catalog, book, acquired, s, mask, tick, weights, wanted);
          if (score === -Infinity) continue;
          candidates++;
          let fetch = fetchCost[a];
          if (b !== a) fetch += fetchCost[b];
          if (c !== b) fetch += fetchCost[c];
          const total = score - fetch - stationCost[s] + rng.next() * weights.jitter;
          if (total > best) {
            best = total;
            out[0] = s;
            out[1] = mask;
          }
        }
      }
    }
  }
  out[2] = candidates;
  return best > -Infinity;
}

/**
 * Each set of 1 to 3 distinct indices is visited once as (i, j, k) with i ≤ j ≤ k: singles as
 * (i, i, i), pairs as (i, j, j), triples as (i, j, k) with i < j < k.
 * @param {number} i
 * @param {number} j
 * @param {number} k
 * @returns {boolean}
 */
function isCanonical(i, j, k) {
  if (i === j) return j === k;
  if (j === k) return true;
  return i < j && j < k;
}

/**
 * Curiosity score of one trial, or −Infinity if it is excluded. What the agent already knows
 * guides it: a combination like a known recipe of the kind it wants (an item, a structure) is
 * promising, so is one made of materials that worked before, and so is the station where things
 * of that kind were made. Without such knowledge, stations are a good bet: they exist to transform.
 * @param {import('./catalog.js').Catalog} catalog
 * @param {import('./recipe-book.js').RecipeBook} book
 * @param {(good: number) => number} acquired
 * @param {number} station
 * @param {number} mask
 * @param {number} tick
 * @param {TrialWeights} weights
 * @param {string | null} wanted - Family sought ("structure", "item:weapon"…), or null.
 * @returns {number}
 */
export function scoreTrial(catalog, book, acquired, station, mask, tick, weights, wanted) {
  if (book.hasFailed(station, mask)) return -Infinity;
  let similar = 0;
  let familiar = 0;
  let kindKnown = false;
  let kindHere = false;
  let materialsHere = false;
  for (let r = 0; r < catalog.recipes.length; r++) {
    if (!book.knows(r)) continue;
    const recipe = catalog.recipes[r];
    if (recipe.station === station && recipe.mask === mask) return -Infinity;
    const likeness = popcount(recipe.mask & mask) / popcount(recipe.mask | mask);
    familiar += likeness;
    if (recipe.family === 'item:material' && recipe.station === station) materialsHere = true;
    const sameKind = wanted === null || recipe.family === wanted;
    if (!sameKind) continue;
    kindKnown = true;
    if (recipe.station === station) kindHere = true;
    if (likeness > similar) similar = likeness;
  }
  let score = similar * weights.similarBonus + familiar * weights.familiarBonus;
  const writing = wanted === 'item:book' || wanted === 'item:map';
  let count = 0;
  let crafted = 0;
  for (let m = mask; m !== 0; m &= m - 1) {
    const g = 31 - Math.clz32(m & -m);
    count++;
    if (tick - acquired(g) < weights.recentTicks) score += weights.recentBonus;
    if (g > catalog.resourceCount) crafted++;
  }
  // Writing needs writing materials: a book or a map is guessed to be made of crafted ones, and
  // more of them are made where one already was.
  if (writing) {
    score += crafted * weights.craftedBonus;
    if (crafted === 0 && materialsHere) score += weights.materialStationBonus;
  }
  score -= count * weights.costPerType;
  if (kindHere) score += weights.kindStationBonus;
  // Things of this kind were made elsewhere: this station is a poor bet.
  else if (kindKnown && wanted === 'structure') score -= weights.kindElsewhere;
  else if (!kindKnown && station !== BARE_HANDS) score += weights.stationBonus;
  return score;
}
