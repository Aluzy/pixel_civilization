import { has, withBit } from '../core/bits.js';
import { BARE_HANDS, lowestIngredient } from './catalog.js';

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
 * @property {number} noveltyBonus - For a set with a material no known recipe uses, when trying
 *   freely (no kind sought).
 * @property {number} hintBonus - The good it guessed can be used alone, tried alone bare-handed;
 *   or the combination it had an idea of.
 * @property {number} focusExtra - Malus per other ingredient when looking for a use of one good:
 *   it is tried alone first, then with one more, and so on.
 * @property {number} unknownStationBonus - Looking for a use of one good: a station none of its
 *   known recipes uses (what it is for is still to find out).
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
 * @param {number} [hint=0] - Good it guessed can be used alone, bare-handed, or 0.
 * @param {number} [focus=0] - If set, only combinations that contain this good.
 * @param {number} [focusStation=0] - If set, only single materials at this station.
 * @param {{ hasFailed: (station: number, mask: number) => boolean } | null} [notebook=null] -
 *   Failures noted by the colony's inventors, excluded too.
 * @param {number} [ideaStation=-1] - Station of a combination it had an idea of, -1 if none.
 * @param {number} [ideaMask=0] - Its mask.
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
  hint = 0,
  focus = 0,
  focusStation = 0,
  notebook = null,
  ideaStation = -1,
  ideaMask = 0,
) {
  let n = 0;
  const hinted = hint > 0 ? 1 << catalog.ingredientBit[hint] : -1;
  const focused = focus > 0 ? 1 << catalog.ingredientBit[focus] : 0;
  // Looking for a use of one good: a station none of its known recipes uses is worth a try.
  let usedStations = 0;
  for (let r = 0; r < catalog.recipes.length && focused !== 0; r++) {
    if (book.knows(r)) usedStations = withBit(usedStations, catalog.recipes[r].station);
  }
  // A material is tried with other materials; a food or produce with any ingredient.
  const anyIngredient = focus > 0 && catalog.material[focus] !== 1;
  for (let g = 1; g < catalog.goodCount; g++) {
    const usable = catalog.material[g] === 1 || (anyIngredient && catalog.ingredientBit[g] >= 0);
    if (usable && fetchCost[g] !== Infinity) types[n++] = g;
  }
  let best = -Infinity;
  let candidates = 0;
  for (let s = 0; s < stations.length; s++) {
    if (s !== BARE_HANDS && stations[s] !== 1) continue;
    if (focusStation > 0 && s !== focusStation) continue;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        for (let k = j; k < n; k++) {
          if (!isCanonical(i, j, k)) continue;
          const a = types[i];
          const b = types[j];
          const c = types[k];
          const bit = catalog.ingredientBit;
          const mask = (1 << bit[a]) | (1 << bit[b]) | (1 << bit[c]);
          if ((mask & focused) !== focused) continue;
          let score = scoreTrial(catalog, book, acquired, s, mask, tick, weights, wanted, !focus);
          if (score === -Infinity || (notebook !== null && notebook.hasFailed(s, mask))) continue;
          if (mask === hinted && s === BARE_HANDS) score += weights.hintBonus;
          if (mask === ideaMask && s === ideaStation) score += weights.hintBonus;
          // A station of unknown use: each material alone first, then trying freely.
          if (focusStation > 0 && popcount(mask) > 1) continue;
          if (focused !== 0) {
            score -= (popcount(mask) - 1) * weights.focusExtra;
            if (s !== BARE_HANDS && !has(usedStations, s)) {
              score += weights.unknownStationBonus;
            }
          }
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
 * @param {boolean} [novelty=true] - Free invention values unused materials (not when looking for
 *   a use of one given good).
 * @returns {number}
 */
export function scoreTrial(
  catalog,
  book,
  acquired,
  station,
  mask,
  tick,
  weights,
  wanted,
  novelty = true,
) {
  if (book.hasFailed(station, mask)) return -Infinity;
  let similar = 0;
  let familiar = 0;
  let kindKnown = false;
  let kindHere = false;
  let materialsHere = false;
  let used = 0;
  for (let r = 0; r < catalog.recipes.length; r++) {
    if (!book.knows(r)) continue;
    const recipe = catalog.recipes[r];
    if (recipe.station === station && recipe.mask === mask) return -Infinity;
    const likeness = popcount(recipe.mask & mask) / popcount(recipe.mask | mask);
    familiar += likeness;
    used |= recipe.mask;
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
    const g = lowestIngredient(catalog, m);
    count++;
    if (tick - acquired(g) < weights.recentTicks) score += weights.recentBonus;
    if (catalog.recipeForGood[g] >= 0) crafted++;
  }
  // Writing needs writing materials: a book or a map is guessed to be made of crafted ones, and
  // more of them are made where one already was.
  if (writing) {
    // Raw materials in the set count against it (a book is not made of wood).
    score += (crafted - (crafted > 0 ? count - crafted : 0)) * weights.craftedBonus;
    if (crafted === 0 && materialsHere) score += weights.materialStationBonus;
  }
  // Free invention: a set with a material no known recipe uses is the most promising (once: a set
  // of new materials is no better than one new material with familiar ones).
  if (wanted === null && novelty && (mask & ~used) !== 0) score += weights.noveltyBonus;
  score -= count * weights.costPerType;
  if (kindHere) score += weights.kindStationBonus;
  // Things of this kind were made elsewhere: this station is a poor bet.
  else if (kindKnown && wanted === 'structure') score -= weights.kindElsewhere;
  else if (!kindKnown && station !== BARE_HANDS) score += weights.stationBonus;
  return score;
}
