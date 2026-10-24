import { describe, expect, it } from 'vitest';
import recipeData from '../../data/recipes.json' with { type: 'json' };
import { PlanStatus, Planner, Step } from '../../src/sim/ai/planner.js';
import { buildCatalog } from '../../src/sim/crafting/catalog.js';
import { RecipeBook } from '../../src/sim/crafting/recipe-book.js';
import { WORLD_TABLES } from '../../src/sim/simulation.js';

const catalog = buildCatalog(recipeData, WORLD_TABLES);
const good = (id) => {
  const r = WORLD_TABLES.resources.findIndex((x) => x.id === id);
  return r >= 0 ? r + 1 : catalog.items.find((i) => i.id === id).good;
};
const code = (id) => catalog.structures.find((s) => s.id === id).code;
const recipe = (id) => catalog.recipes.findIndex((r) => r.id === id);
const harvestTicks = Float64Array.from({ length: catalog.resourceCount + 1 }, () => 20);

/**
 * @param {object} beliefs
 * @returns {Planner}
 */
function planner({ known = [], inventory = {}, stations = [], places = [], budget = 300 } = {}) {
  const p = new Planner(catalog, {
    nodeBudget: budget,
    maxSteps: 12,
    travelCost: 60,
    exploreCost: 600,
    harvestTicks,
  });
  p.recipeMask = known.reduce((m, id) => m | (1 << recipe(id)), 0);
  for (const [id, n] of Object.entries(inventory)) p.inventory[good(id)] = n;
  for (const id of stations) p.stations[code(id)] = 1;
  for (const id of places) p.places[good(id)] = 1;
  return p;
}

/**
 * @param {string[]} goods
 * @param {string[]} [structures]
 * @param {number} [id]
 * @returns {import('../../src/sim/ai/planner.js').PlanTarget}
 */
function target(goods, structures = [], id = 1) {
  const g = new Uint8Array(catalog.goodCount);
  for (const x of goods) g[good(x)] = 1;
  const s = new Uint8Array(catalog.structures.length + 1);
  for (const x of structures) s[code(x)] = 1;
  return { id, goods: g, structures: s };
}

const describeSteps = (steps) =>
  steps.map((s) => {
    const name =
      s.kind === Step.GATHER || s.kind === Step.EXPLORE
        ? WORLD_TABLES.resources[s.arg - 1].id
        : catalog.recipes[s.arg].id;
    return `${['none', 'explore', 'gather', 'craft', 'build'][s.kind]} ${name} ${s.count}`;
  });

describe('GOAP planner', () => {
  it('chains gathering, building the station and crafting', () => {
    const p = planner({ known: ['spear', 'workbench'], places: ['wood', 'fiber'] });
    const result = p.plan(target(['spear']));
    expect(result.status).toBe(PlanStatus.OK);
    const steps = describeSteps(result.steps);
    expect(steps.at(-1)).toBe('craft spear 1');
    expect(steps).toContain('build workbench 1');
    expect(steps.indexOf('build workbench 1')).toBeLessThan(steps.indexOf('craft spear 1'));
    // Enough wood for the workbench and the spear is gathered before building.
    const firstWood = result.steps.find((s) => s.kind === Step.GATHER && s.arg === good('wood'));
    expect(firstWood.count).toBe(6);
  });

  it('uses what the agent carries and the stations it knows', () => {
    const p = planner({
      known: ['spear'],
      inventory: { wood: 2, fiber: 1 },
      stations: ['workbench'],
    });
    expect(describeSteps(p.plan(target(['spear'])).steps)).toEqual(['craft spear 1']);
  });

  it('explores for a resource whose place is unknown, before gathering it', () => {
    const p = planner({ known: ['stone_axe'], stations: ['workbench'], places: ['wood'] });
    const steps = describeSteps(p.plan(target(['stone_axe'])).steps);
    expect(steps.indexOf('explore stone 1')).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf('explore stone 1')).toBeLessThan(steps.indexOf('gather stone 2'));
  });

  it('picks the cheapest of several acceptable targets', () => {
    const p = planner({
      known: ['stone_axe', 'stone_pickaxe'],
      stations: ['workbench'],
      places: ['wood', 'fiber', 'stone'],
    });
    const steps = describeSteps(p.plan(target(['stone_axe', 'stone_pickaxe'])).steps);
    expect(steps.at(-1)).toBe('craft stone_axe 1');
  });

  it('plans a structure target and reports a target already met', () => {
    const p = planner({ known: ['shelter'], places: ['wood', 'fiber', 'stone'] });
    const result = p.plan(target([], ['shelter']));
    expect(describeSteps(result.steps).at(-1)).toBe('build shelter 1');
    p.stations[code('shelter')] = 1;
    expect(p.plan(target([], ['shelter'])).status).toBe(PlanStatus.DONE);
  });

  it('finds no plan without the recipe, and stops at its work budget', () => {
    expect(planner({ places: ['wood'] }).plan(target(['spear'])).status).toBe(PlanStatus.NO_PLAN);
    const p = planner({ known: ['spear', 'workbench'], places: ['wood', 'fiber'], budget: 1 });
    const result = p.plan(target(['spear']));
    expect(result.status).toBe(PlanStatus.BUDGET);
    expect(result.nodes).toBe(1);
  });

  it('memoises plans by beliefs', () => {
    const p = planner({ known: ['spear', 'workbench'], places: ['wood', 'fiber'] });
    const a = p.plan(target(['spear']));
    const b = p.plan(target(['spear']));
    expect(b).toBe(a);
    expect(p.hits).toBe(1);
    p.inventory[good('wood')] = 3;
    expect(p.plan(target(['spear']))).not.toBe(a);
  });
});

describe('recipe book', () => {
  it('learns, consolidates and forgets recipes', () => {
    const book = new RecipeBook(catalog.recipes.length, 4);
    expect(book.learn(2, 0, 100)).toBe(true);
    expect(book.learn(2, 10, 100)).toBe(false);
    expect(book.knownMask()).toBe(1 << 2);
    book.use(2, 50, 1.5, 1000);
    expect(book.tau[2]).toBe(150);
    expect(book.sweep(50 + 150, 0.1)).toBe(-1);
    expect(book.sweep(50 + 1000, 0.1)).toBe(2);
    expect(book.knows(2)).toBe(false);
  });

  it('remembers failures in a ring and lets them fade', () => {
    const book = new RecipeBook(3, 2);
    book.recordFailure(0, 6, 0, 100);
    book.recordFailure(1, 6, 0, 100);
    expect(book.hasFailed(0, 6)).toBe(true);
    book.recordFailure(1, 12, 0, 100);
    expect(book.hasFailed(0, 6)).toBe(false);
    expect(book.failureCount()).toBe(2);
    book.sweep(1000, 0.1);
    expect(book.failureCount()).toBe(0);
  });
});
