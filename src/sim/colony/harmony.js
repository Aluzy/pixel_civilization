import { popcount } from '../knowledge/document-store.js';
import { PACK } from '../world/chunk-store.js';

// Harmony (docs/design/07-harmonie.md): a score from 0 to 100 per colony, from five components
// each between 0 and 1. It is a measure: the colony reads only its weakest component (the
// focus, posted on the blackboard), which steers the tasks it opens.

/** Harmony components, in the order of `Colony#harmony` (after the score). */
export const Component = Object.freeze({
  STABILITY: 0,
  DURABILITY: 1,
  SPATIAL: 2,
  KNOWLEDGE: 3,
  WELLBEING: 4,
});

export const COMPONENT_IDS = Object.freeze([
  'stability',
  'durability',
  'spatial',
  'knowledge',
  'wellbeing',
]);

/** Structure categories for the specialisation of zones. */
const CATEGORY = Object.freeze({ shelter: 1, station: 2, library: 3, storage: 4 });
const CATEGORIES = 4;

/**
 * Notes a harvest by a member, for the durability of the colony's territory.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id - Harvesting agent.
 * @param {number} x
 * @param {number} y
 * @param {number} resource
 * @returns {void}
 */
export function noteHarvest(state, ctx, id, x, y, resource) {
  const c = ctx.agents.colony[id];
  if (c < 0 || ctx.regrowTicks[resource] <= 0) return;
  const colony = state.colonies[c];
  if (!inTerritory(ctx, colony, x, y)) return;
  colony.harvested[bucketIndex(state, ctx, colony, resource)]++;
}

/**
 * Notes a regrowth, for every colony whose territory holds the tile.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} resource
 * @param {number} quantity
 * @returns {void}
 */
export function noteRegrowth(state, ctx, x, y, resource, quantity) {
  for (const colony of state.colonies) {
    if (!colony.hasCamp || !inTerritory(ctx, colony, x, y)) continue;
    colony.regrown[bucketIndex(state, ctx, colony, resource)] += quantity;
  }
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function inTerritory(ctx, colony, x, y) {
  const r = ctx.balance.harmony.territoryRadius;
  return colony.hasCamp && Math.abs(x - colony.campX) <= r && Math.abs(y - colony.campY) <= r;
}

/**
 * Slot of today's counter of a resource in the rolling window of `durabilityDays` days.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} resource
 * @returns {number}
 */
function bucketIndex(state, ctx, colony, resource) {
  const days = ctx.balance.harmony.durabilityDays;
  const day = Math.floor(state.tick / ctx.balance.time.ticksPerDay) % days;
  return day * colony.resourceSlots + resource;
}

/**
 * Computes the colony's harmony and its components, and records today's population. Called
 * once a day.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {void}
 */
export function computeHarmony(state, ctx, colony) {
  const h = ctx.balance.harmony;
  const day = ctx.balance.time.ticksPerDay;
  colony.popHistory[colony.popDays % colony.popHistory.length] = colony.members;
  colony.popDays++;
  const s = colony.harmony;
  s[1 + Component.STABILITY] = stability(
    colony,
    state.tick - colony.lastStarvation < h.famineDays * day,
  );
  s[1 + Component.DURABILITY] = durability(ctx, colony);
  s[1 + Component.SPATIAL] = spatial(state, ctx, colony);
  s[1 + Component.KNOWLEDGE] = knowledge(state);
  s[1 + Component.WELLBEING] = wellbeing(ctx, colony);
  let total = 0;
  let weakest = 0;
  for (let k = 0; k < COMPONENT_IDS.length; k++) {
    total += h.weights[COMPONENT_IDS[k]] * s[1 + k];
    if (s[1 + k] < s[1 + weakest]) weakest = k;
  }
  s[0] = 100 * total;
  colony.focus = weakest;
  const hungry = weakest === Component.STABILITY || weakest === Component.WELLBEING;
  colony.pantryBoost = hungry ? 1 + h.focusPantry : 1;
  // Start a new day in the durability window.
  const days = h.durabilityDays;
  const next = (Math.floor(state.tick / day) % days) * colony.resourceSlots;
  colony.harvested.fill(0, next, next + colony.resourceSlots);
  colony.regrown.fill(0, next, next + colony.resourceSlots);
}

/**
 * 1 − relative standard deviation of the population over the recorded days; 0 in a famine.
 * @param {import('./colony-store.js').Colony} colony
 * @param {boolean} famine
 * @returns {number}
 */
function stability(colony, famine) {
  if (famine) return 0;
  const n = Math.min(colony.popDays, colony.popHistory.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += colony.popHistory[i];
  const mean = sum / n;
  if (mean <= 0) return 0;
  let v = 0;
  for (let i = 0; i < n; i++) v += (colony.popHistory[i] - mean) * (colony.popHistory[i] - mean);
  return Math.max(0, 1 - Math.sqrt(v / n) / mean);
}

/**
 * Share of the renewable resources harvested in the territory whose regrowth kept up with the
 * harvest over the window (1 when nothing was harvested).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number}
 */
function durability(ctx, colony) {
  let used = 0;
  let kept = 0;
  const slots = colony.resourceSlots;
  const days = colony.harvested.length / slots;
  for (let r = 1; r < slots; r++) {
    if (ctx.regrowTicks[r] <= 0) continue;
    let taken = 0;
    let grown = 0;
    for (let d = 0; d < days; d++) {
      taken += colony.harvested[d * slots + r];
      grown += colony.regrown[d * slots + r];
    }
    if (taken === 0) continue;
    used++;
    if (grown >= taken) kept++;
  }
  return used === 0 ? 1 : kept / used;
}

/**
 * Mean of compactness of the buildings, nearness of homes to water and food, and specialisation
 * of zones (docs/design/07-harmonie.md, « Détails de l'ordre spatial »).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number}
 */
function spatial(state, ctx, colony) {
  if (!colony.hasCamp) return 0;
  const h = ctx.balance.harmony;
  const r = h.territoryRadius;
  const px = ctx.hullX;
  const py = ctx.hullY;
  const cell = h.zoneCell;
  const side = Math.ceil((2 * r + 1) / cell);
  const zones = ctx.zoneCounts;
  zones.fill(0, 0, side * side * CATEGORIES);
  let n = 0;
  for (let y = colony.campY - r; y <= colony.campY + r; y++) {
    for (let x = colony.campX - r; x <= colony.campX + r; x++) {
      const code = state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT;
      if (code === 0) continue;
      if (n < px.length) {
        px[n] = x;
        py[n] = y;
        n++;
      }
      const category = CATEGORY[ctx.catalog.structures[code - 1].kind] ?? CATEGORY.storage;
      const zx = Math.floor((x - colony.campX + r) / cell);
      const zy = Math.floor((y - colony.campY + r) / cell);
      zones[(zy * side + zx) * CATEGORIES + category - 1]++;
    }
  }
  if (n === 0) return 0;
  const compact = compactness(px, py, n, ctx.hullOrder);
  const near = nearness(ctx, colony);
  const special = specialisation(zones, side);
  return (compact + near + special) / 3;
}

/**
 * Buildings / area of their convex hull (counted in tiles by Pick's theorem), at most 1.
 * @param {Int32Array} px
 * @param {Int32Array} py
 * @param {number} n
 * @param {Int32Array} order - Scratch, length ≥ 2n.
 * @returns {number}
 */
export function compactness(px, py, n, order) {
  if (n < 3) return 1;
  // Andrew's monotone chain on points sorted by x, then y (insertion sort: n is small).
  const idx = order;
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = 1; i < n; i++) {
    const v = idx[i];
    let j = i - 1;
    while (j >= 0 && (px[idx[j]] > px[v] || (px[idx[j]] === px[v] && py[idx[j]] > py[v]))) {
      idx[j + 1] = idx[j];
      j--;
    }
    idx[j + 1] = v;
  }
  const hull = order.subarray(n);
  let k = 0;
  const cross = (o, a, b) => (px[a] - px[o]) * (py[b] - py[o]) - (py[a] - py[o]) * (px[b] - px[o]);
  for (let i = 0; i < n; i++) {
    while (k >= 2 && cross(hull[k - 2], hull[k - 1], idx[i]) <= 0) k--;
    hull[k++] = idx[i];
  }
  for (let i = n - 2, lower = k + 1; i >= 0; i--) {
    while (k >= lower && cross(hull[k - 2], hull[k - 1], idx[i]) <= 0) k--;
    hull[k++] = idx[i];
  }
  k--;
  let area2 = 0;
  let boundary = 0;
  for (let i = 0; i < k; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % k];
    area2 += px[a] * py[b] - px[b] * py[a];
    boundary += gcd(Math.abs(px[b] - px[a]), Math.abs(py[b] - py[a]));
  }
  // Tiles covered by the hull: interior points + boundary points (Pick: A = I + B/2 − 1).
  const tiles = Math.abs(area2) / 2 + boundary / 2 + 1;
  return Math.min(1, n / tiles);
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gcd(a, b) {
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * Nearness of the shelters to the closest water and food on the colony's blackboard:
 * 1 / (1 + mean distance / nearScale).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number}
 */
function nearness(ctx, colony) {
  if (colony.shelterCount === 0) return 0;
  let total = 0;
  for (let i = 0; i < colony.shelterCount; i++) {
    const x = colony.shelterX[i];
    const y = colony.shelterY[i];
    let water = Infinity;
    let food = Infinity;
    for (let b = 0; b < colony.boardCount; b++) {
      const s = colony.boardSubject[b];
      const d = Math.max(Math.abs(colony.boardX[b] - x), Math.abs(colony.boardY[b] - y));
      if (s === 0 && d < water) water = d;
      else if (ctx.edible[s] === 1 && d < food) food = d;
    }
    const far = ctx.balance.harmony.nearScale * 4;
    total += (Math.min(water, far) + Math.min(food, far)) / 2;
  }
  return 1 / (1 + total / colony.shelterCount / ctx.balance.harmony.nearScale);
}

/**
 * 1 − mean normalised Gini–Simpson diversity of building categories over 3 × 3 windows of zones
 * centred on built zones (homogeneous neighbourhoods score high). Gini–Simpson replaces the
 * entropy of the design: it needs no logarithm (decision 0005).
 * @param {Int32Array} zones - Counts per zone and category.
 * @param {number} side
 * @returns {number}
 */
function specialisation(zones, side) {
  let windows = 0;
  let diversity = 0;
  const counts = [0, 0, 0, 0];
  for (let zy = 0; zy < side; zy++) {
    for (let zx = 0; zx < side; zx++) {
      let built = 0;
      for (let c = 0; c < CATEGORIES; c++) built += zones[(zy * side + zx) * CATEGORIES + c];
      if (built === 0) continue;
      counts.fill(0);
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = zx + dx;
          const y = zy + dy;
          if (x < 0 || y < 0 || x >= side || y >= side) continue;
          for (let c = 0; c < CATEGORIES; c++) {
            const v = zones[(y * side + x) * CATEGORIES + c];
            counts[c] += v;
            total += v;
          }
        }
      }
      let sq = 0;
      for (let c = 0; c < CATEGORIES; c++) sq += (counts[c] / total) * (counts[c] / total);
      diversity += (1 - sq) / (1 - 1 / CATEGORIES);
      windows++;
    }
  }
  return windows === 0 ? 0 : 1 - diversity / windows;
}

/**
 * Recipes written within reach / recipes ever discovered (lost ones count as not written).
 * @param {import('../simulation.js').SimState} state
 * @returns {number}
 */
function knowledge(state) {
  const k = state.knowledge;
  let discovered = 0;
  for (let r = 0; r < k.recipes; r++) if (k.discovered[r] >= 0) discovered |= 1 << r;
  const total = popcount(discovered);
  return total === 0 ? 0 : popcount(k.written & discovered) / total;
}

/**
 * 1 − mean of the members' needs (hunger, thirst, fatigue, curiosity) / 100.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number}
 */
function wellbeing(ctx, colony) {
  const a = ctx.agents;
  let sum = 0;
  let n = 0;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1 || a.colony[id] !== colony.id) continue;
    sum += (a.hunger[id] + a.thirst[id] + a.fatigue[id] + a.curiosity[id]) / 4;
    n++;
  }
  return n === 0 ? 0 : Math.max(0, 1 - sum / n / 100);
}
