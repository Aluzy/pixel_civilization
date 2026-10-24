import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import recipeData from '../../data/recipes.json' with { type: 'json' };
import { createRng } from '../../src/sim/core/rng.js';
import { BARE_HANDS, buildCatalog, matchRecipe } from '../../src/sim/crafting/catalog.js';
import { chooseTrial } from '../../src/sim/crafting/experiment.js';
import { RecipeBook } from '../../src/sim/crafting/recipe-book.js';
import { WORLD_TABLES } from '../../src/sim/simulation.js';

const catalog = buildCatalog(recipeData, WORLD_TABLES);
const good = (id) => WORLD_TABLES.resources.findIndex((x) => x.id === id) + 1;
const WEIGHTS = balance.crafting.trial;
const FREE = new Float64Array(catalog.structures.length + 1);
const OLD = () => -1e9;

/**
 * Fetch costs: as given per material, Infinity for the others (out of reach).
 * @param {Record<string, number>} costs
 * @returns {Float64Array}
 */
function fetchCosts(costs) {
  const f = new Float64Array(catalog.goodCount).fill(Infinity);
  for (const [id, c] of Object.entries(costs)) f[good(id)] = c;
  return f;
}

/**
 * Chooses one trial; returns [station, mask, candidates] or null.
 * @param {RecipeBook} book
 * @param {Float64Array} fetch
 * @param {Uint8Array} stations
 * @param {string | null} [wanted]
 * @param {number} [seed]
 * @returns {number[] | null}
 */
function choose(book, fetch, stations, wanted = null, seed = 7) {
  const out = new Int32Array(3);
  const types = new Int32Array(catalog.goodCount);
  const rng = createRng(seed);
  const args = [stations, FREE, 0, WEIGHTS, rng, types, wanted, out];
  return chooseTrial(catalog, book, fetch, OLD, ...args) ? [...out] : null;
}

/**
 * Runs trials until nothing is left, like an agent that keeps experimenting.
 * @param {string[]} materials
 * @param {Uint8Array} stations
 * @param {RecipeBook} book
 * @returns {string[]} Recipes discovered, in order.
 */
function experimentAll(materials, stations, book) {
  const fetch = fetchCosts(Object.fromEntries(materials.map((m) => [m, 0])));
  const found = [];
  for (let trials = 0; trials < 64; trials++) {
    const trial = choose(book, fetch, stations, null, trials);
    if (!trial) break;
    const r = matchRecipe(catalog, trial[0], trial[1]);
    if (r >= 0) {
      book.learn(r, 0, 1000);
      found.push(catalog.recipes[r].id);
    } else {
      book.recordFailure(trial[0], trial[1], 0, 1000);
    }
  }
  return found;
}

describe('experiments', () => {
  it('tries each set of materials once per station, and finds the recipes', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    const hands = new Uint8Array(catalog.structures.length + 1);
    expect(experimentAll(['wood', 'fiber', 'stone'], hands, book).sort()).toEqual([
      'shelter',
      'workbench',
    ]);
    // 7 sets of 3 materials, 2 were recipes.
    expect(book.failureCount()).toBe(5);
    const withBench = hands.slice();
    withBench[1] = 1;
    const more = experimentAll(['wood', 'fiber', 'stone'], withBench, book);
    expect(more.sort()).toEqual(['spear', 'stone_axe', 'stone_pickaxe']);
  });

  it('tries at a new station a set that resembles a known recipe', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    book.learn(0, 0, 1000); // workbench: wood + fiber, bare hands.
    const stations = new Uint8Array(catalog.structures.length + 1);
    stations[1] = 1;
    const [station, mask] = choose(book, fetchCosts({ wood: 0, fiber: 0 }), stations, 'item');
    expect(station).toBe(1);
    expect(mask).toBe((1 << good('wood')) | (1 << good('fiber')));
  });

  it('looks for a structure where structures were made, with familiar materials', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    for (const id of ['workbench', 'spear', 'stone_axe']) {
      book.learn(
        catalog.recipes.findIndex((r) => r.id === id),
        0,
        1000,
      );
    }
    const stations = new Uint8Array(catalog.structures.length + 1);
    stations[1] = 1;
    const fetch = fetchCosts({ wood: 0, fiber: 0, stone: 0, clay: 0 });
    const [station, mask] = choose(book, fetch, stations, 'structure');
    expect(station).toBe(BARE_HANDS);
    expect(mask).toBe((1 << good('wood')) | (1 << good('fiber')) | (1 << good('stone')));
  });

  it('weighs the walk to fetch a missing material', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    const hands = new Uint8Array(catalog.structures.length + 1);
    const [, mask] = choose(book, fetchCosts({ wood: 0, fiber: 0.2, stone: 5 }), hands);
    expect(mask & (1 << good('stone'))).toBe(0);
  });

  it('has nothing to try without materials', () => {
    const book = new RecipeBook(catalog.recipes.length, 4);
    const stations = new Uint8Array(catalog.structures.length + 1);
    expect(choose(book, fetchCosts({}), stations)).toBe(null);
  });
});
