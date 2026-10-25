import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import cropData from '../../data/crops.json' with { type: 'json' };
import { Action } from '../../src/sim/agents/action-types.js';
import { stepAction } from '../../src/sim/agents/actions.js';
import { chooseBatch, researchGood } from '../../src/sim/agents/cook-work.js';
import { remaining } from '../../src/sim/colony/colony-logic.js';
import { ProjectKind } from '../../src/sim/colony/colony-store.js';
import {
  FOOD_COST,
  carriedPortions,
  missingCost,
  replicate,
} from '../../src/sim/colony/replication.js';
import { EventType } from '../../src/sim/core/events.js';
import { createRng } from '../../src/sim/core/rng.js';
import { BARE_HANDS } from '../../src/sim/crafting/catalog.js';
import { chooseTrial } from '../../src/sim/crafting/experiment.js';
import { RecipeBook } from '../../src/sim/crafting/recipe-book.js';
import { CropStore, FALLOW } from '../../src/sim/farming/crop-store.js';
import {
  FarmJob,
  chooseFarmJob,
  countFarmJobs,
  fetchInputs,
  stockProduce,
  tillDone,
  waterPlot,
} from '../../src/sim/farming/farm-jobs.js';
import { stockPortions } from '../../src/sim/farming/food.js';
import { CATALOG, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { farmSystem } from '../../src/sim/systems/farm-system.js';
import { PACK } from '../../src/sim/world/chunk-store.js';

const DAY = balance.time.ticksPerDay;
const good = (id) => {
  const item = CATALOG.items.find((i) => i.id === id);
  return item ? item.good : WORLD_TABLES.resources.findIndex((r) => r.id === id) + 1;
};
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
const WHEAT = good('wheat');
const SEED = good('seed');
const crop = cropData.crops[0];

/**
 * A simulation whose first agent has a camp of `members` members around it (it alone is real).
 * @param {number} [members]
 * @returns {Simulation}
 */
function farm(members = 10) {
  const sim = new Simulation({ seed: 5, balance });
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  colony.hasCamp = true;
  colony.campX = a.x[0];
  colony.campY = a.y[0];
  colony.members = members;
  sim.state.tick = 3 * DAY;
  return sim;
}

/**
 * Puts a plot of the colony next to the agent (on a cleared tile).
 * @param {Simulation} sim
 * @param {number} dx
 * @param {number} dy
 * @returns {number} Plot index.
 */
function plotAt(sim, dx, dy) {
  const x = sim.agents.x[0] + dx;
  const y = sim.agents.y[0] + dy;
  sim.world.setResource(x, y, 0, 0);
  sim.world.setStructure(x, y, sim.ctx.plotCode);
  return sim.state.crops.add(x, y, 0, 0);
}

/**
 * @param {Simulation} sim
 * @param {number} p
 * @returns {number} Resource on the plot's tile.
 */
function resourceOn(sim, p) {
  const c = sim.state.crops;
  return (sim.world.packedAt(c.x[p], c.y[p]) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
}

describe('food tables', () => {
  it('allows more than 30 goods, and gives dishes 1.3 times the worth of their ingredients', () => {
    expect(CATALOG.goodCount - 1).toBeGreaterThan(30);
    const t = new Simulation({ seed: 1, balance }).ctx.foodTables;
    const wheat = WORLD_TABLES.resources.find((r) => r.id === 'wheat').nutrition;
    const berries = WORLD_TABLES.resources.find((r) => r.id === 'berries').nutrition;
    expect(t.value[good('flour')]).toBe(3 * wheat);
    expect(t.nutrition[good('bread')]).toBe(Math.round(1.3 * 6 * wheat));
    expect(t.nutrition[good('berry_pie')]).toBe(Math.round(1.3 * (3 * wheat + 2 * berries)));
    expect(t.cropShare[good('bread')]).toBe(1);
    expect(t.cropShare[good('berry_pie')]).toBeCloseTo((3 * wheat) / (3 * wheat + 2 * berries));
    expect(t.food[good('flour')]).toBe(0);
    // The most nourishing first.
    expect(t.order[0]).toBe(good('berry_pie'));
  });
});

describe('plots', () => {
  it('finds a plot by its tile and hashes the same for the same plots', () => {
    const a = new CropStore();
    const b = new CropStore();
    for (const s of [a, b]) {
      s.add(3, -4, 0, 0);
      s.add(-7, 2, 0, -1);
    }
    expect(a.at(3, -4)).toBe(0);
    expect(a.at(0, 0)).toBe(-1);
    expect(a.stage[1]).toBe(FALLOW);
  });

  it('grows a stage a day when watered, ripens into grain, withers when dry', () => {
    const sim = farm();
    const crops = sim.state.crops;
    const p = plotAt(sim, 1, 0);
    const q = plotAt(sim, 3, 0);
    sim.state.tick = 10 * DAY;
    for (let d = 0; d < crop.stages; d++) {
      crops.watered[p] = sim.state.tick / DAY;
      sim.state.tick += DAY;
      farmSystem(sim.state, sim.ctx);
    }
    expect(crops.stage[p]).toBe(crop.stages);
    expect(resourceOn(sim, p)).toBe(WHEAT);
    expect(crops.stage[q]).toBe(FALLOW);
    expect(sim.state.colonies[0].withered).toBe(1);
    // Left ripe too long: it falls and sows itself.
    for (let d = 0; d < balance.agriculture.overripeDays; d++) {
      sim.state.tick += DAY;
      farmSystem(sim.state, sim.ctx);
    }
    expect(crops.stage[p]).toBe(0);
    expect(resourceOn(sim, p)).toBe(0);
  });

  it('is bare again once its grain is harvested, with seeds now and then and no regrowth', () => {
    const sim = farm();
    const a = sim.agents;
    const p = plotAt(sim, 0, 0);
    sim.state.crops.stage[p] = crop.stages;
    sim.world.setResource(a.x[0], a.y[0], WHEAT, 3);
    sim.ctx.crops[0].seedChance = 1;
    a.harvestGood[0] = WHEAT;
    a.harvestUntil[0] = 30;
    a.action[0] = Action.HARVEST;
    for (let t = 0; t < 200 && a.action[0] === Action.HARVEST; t++)
      stepAction(sim.state, sim.ctx, 0);
    expect(a.carried(0, WHEAT)).toBe(3);
    expect(a.carried(0, SEED)).toBe(3);
    expect(sim.state.crops.stage[p]).toBe(FALLOW);
    expect(sim.state.regrowth.length).toBe(0);
    expect(sim.events.events.some((e) => e.type === EventType.HARVEST)).toBe(true);
  });
});

describe('farm jobs', () => {
  it('takes the ripe crop first, then water, then a bare plot to sow', () => {
    const sim = farm();
    const crops = sim.state.crops;
    const colony = sim.state.colonies[0];
    const bare = plotAt(sim, 1, 1);
    crops.stage[bare] = FALLOW;
    const dry = plotAt(sim, 2, 2);
    const ripe = plotAt(sim, 4, 4);
    crops.stage[ripe] = crop.stages;
    sim.world.setResource(crops.x[ripe], crops.y[ripe], WHEAT, 5);
    colony.stock[SEED] = 2;
    const a = sim.agents;
    expect(chooseFarmJob(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect([a.farmJob[0], a.farmPlot[0]]).toEqual([FarmJob.HARVEST, ripe]);
    expect(crops.claim[ripe]).toBe(0);
    a.farmJob[0] = FarmJob.NONE;
    expect(chooseFarmJob(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect([a.farmJob[0], a.farmPlot[0]]).toEqual([FarmJob.WATER, dry]);
    a.farmJob[0] = FarmJob.NONE;
    expect(chooseFarmJob(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect([a.farmJob[0], a.farmPlot[0]]).toEqual([FarmJob.SOW, bare]);
    expect(a.carried(0, SEED)).toBe(1);
    expect(colony.stock[SEED]).toBe(1);
  });

  it('makes new plots when it has seeds, gleans wild grain when it has none', () => {
    const sim = farm();
    const colony = sim.state.colonies[0];
    const a = sim.agents;
    expect(chooseFarmJob(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect(a.farmJob[0]).toBe(FarmJob.GLEAN);
    a.farmJob[0] = FarmJob.NONE;
    colony.stock[SEED] = 1;
    expect(chooseFarmJob(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect(a.farmJob[0]).toBe(FarmJob.TILL);
    tillDone(sim.state, sim.ctx, 0, a.x[0] + 1, a.y[0]);
    expect(colony.plots).toBe(1);
    expect(sim.state.crops.stage[sim.state.crops.at(a.x[0] + 1, a.y[0])]).toBe(0);
    expect(sim.events.events.some((e) => e.type === EventType.FIRST_PLOT)).toBe(true);
    expect(a.farmJob[0]).toBe(FarmJob.NONE);
    // A small colony keeps gathering: no new plot (the one it has is watered today).
    sim.state.crops.watered[0] = Math.floor(sim.tick / DAY);
    colony.members = balance.agriculture.farmMembers - 1;
    countFarmJobs(sim.state, sim.ctx, colony);
    expect(colony.farmOpen).toBe(0);
  });

  it('waters the plots around the one it tends', () => {
    const sim = farm();
    const crops = sim.state.crops;
    const p = plotAt(sim, 1, 0);
    const near = plotAt(sim, 2, 1);
    const far = plotAt(sim, 4, 0);
    sim.agents.farmPlot[0] = p;
    sim.agents.farmJob[0] = FarmJob.WATER;
    waterPlot(sim.state, sim.ctx, 0);
    const day = Math.floor(sim.tick / DAY);
    expect([crops.watered[p], crops.watered[near], crops.watered[far]]).toEqual([day, day, -1]);
    expect(sim.agents.farmJob[0]).toBe(FarmJob.NONE);
  });

  it('brings grain and seeds to the stock', () => {
    const sim = farm();
    const a = sim.agents;
    a.addCarried(0, WHEAT, 7);
    a.addCarried(0, SEED, 2);
    a.addCarried(0, good('berries'), 3);
    expect(stockProduce(sim.state, sim.ctx, 0)).toBe(9);
    const stock = sim.state.colonies[0].stock;
    expect([stock[WHEAT], stock[SEED], a.carried(0, good('berries'))]).toEqual([7, 2, 3]);
  });
});

describe('discovery', () => {
  const catalog = CATALOG;
  const fetch = new Float64Array(catalog.goodCount).fill(Infinity);
  const stations = new Uint8Array(catalog.structures.length + 1);
  const cost = new Float64Array(catalog.structures.length + 1);
  const out = new Int32Array(3);
  const weights = balance.crafting.trial;
  const types = new Int32Array(catalog.goodCount);
  const bit = (id) => 1 << catalog.ingredientBit[good(id)];

  it('tries a seed alone, bare-handed, once it guessed seeds make plants', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    fetch.fill(Infinity);
    for (const id of ['seed', 'wood', 'fiber', 'stone']) fetch[good(id)] = 0;
    chooseTrial(
      catalog,
      book,
      fetch,
      () => -1e9,
      stations,
      cost,
      0,
      weights,
      createRng(1),
      types,
      null,
      out,
      SEED,
    );
    expect([out[0], out[1]]).toEqual([BARE_HANDS, bit('seed')]);
  });

  it('looking for a use of flour, tries it alone first, at a station it knows no use of', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    book.learn(recipe('workbench'), 0, 1e6);
    book.learn(recipe('spear'), 0, 1e6);
    fetch.fill(Infinity);
    for (const id of ['flour', 'wood', 'fiber', 'berries']) fetch[good(id)] = 0;
    stations.fill(0);
    const fire = catalog.structures.find((s) => s.id === 'campfire').code;
    const bench = catalog.structures.find((s) => s.id === 'workbench').code;
    stations[fire] = 1;
    stations[bench] = 1;
    const flour = good('flour');
    chooseTrial(
      catalog,
      book,
      fetch,
      () => -1e9,
      stations,
      cost,
      0,
      weights,
      createRng(1),
      types,
      null,
      out,
      0,
      flour,
    );
    expect([out[0], out[1]]).toEqual([fire, bit('flour')]);
  });
});

describe('kitchen', () => {
  it('cooks the batch that adds the most food worth, else prepares an ingredient', () => {
    const sim = farm();
    const colony = sim.state.colonies[0];
    const book = sim.agents.recipes[0];
    for (const id of ['flour', 'bread', 'berry_pie']) book.learn(recipe(id), sim.tick, 1e6);
    colony.stock[WHEAT] = 9;
    expect(chooseBatch(sim.ctx, colony, 0)).toBe(recipe('flour'));
    colony.stock[good('flour')] = 2;
    expect(chooseBatch(sim.ctx, colony, 0)).toBe(recipe('bread'));
    colony.stock[good('berries')] = 2;
    expect(chooseBatch(sim.ctx, colony, 0)).toBe(recipe('berry_pie'));
  });

  it('looks for a use of produce nobody here knows what to do with', () => {
    const sim = farm();
    const colony = sim.state.colonies[0];
    colony.stock[WHEAT] = 4;
    expect(researchGood(sim.ctx, colony, 0)).toBe(WHEAT);
    sim.agents.recipes[0].learn(recipe('flour'), sim.tick, 1e6);
    expect(researchGood(sim.ctx, colony, 0)).toBe(0);
  });

  it('takes the ingredients of several rounds from the stock', () => {
    const sim = farm();
    const colony = sim.state.colonies[0];
    colony.stock[good('flour')] = 7;
    sim.agents.cookRecipe[0] = recipe('bread');
    fetchInputs(sim.state, sim.ctx, 0);
    expect(sim.agents.carried(0, good('flour'))).toBe(6);
    expect(colony.stock[good('flour')]).toBe(1);
  });

  it('eats the dish first, counts what came from crops, and enjoys it', () => {
    const sim = farm();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    a.addCarried(0, good('berries'), 2);
    a.addCarried(0, good('bread'), 1);
    a.hunger[0] = 90;
    a.curiosity[0] = 50;
    a.action[0] = Action.EAT;
    for (let t = 0; t < balance.actions.eatTicksPerUnit; t++) stepAction(sim.state, sim.ctx, 0);
    expect(a.carried(0, good('bread'))).toBe(0);
    expect(a.carried(0, good('berries'))).toBe(2);
    const bread = sim.ctx.foodTables.nutrition[good('bread')];
    expect([colony.eaten, colony.eatenCrop, colony.dishes]).toEqual([bread, bread, 1]);
    expect(a.curiosity[0]).toBeLessThan(50);
    expect(sim.events.events.some((e) => e.type === EventType.FIRST_DISH)).toBe(true);
  });

  it('counts the pantry in portions of any food', () => {
    const sim = farm();
    const colony = sim.state.colonies[0];
    const ctx = sim.ctx;
    const pantry = colony.projects[0];
    pantry.kind = ProjectKind.PANTRY;
    pantry.needs[good('berries')] = 1;
    const portion = balance.cooking.portion;
    const berriesWanted = () =>
      remaining(colony, pantry, good('berries'), 10, balance.colony, ctx.foodTables, portion);
    const before = berriesWanted();
    colony.stock[good('bread')] = 4;
    expect(stockPortions(ctx.foodTables, colony.stock, portion)).toBe(
      Math.floor((4 * ctx.foodTables.nutrition[good('bread')]) / portion),
    );
    expect(berriesWanted()).toBeLessThan(before);
  });
});

describe('replication with farming', () => {
  it('pays any food for the newborn, the least nourishing first', () => {
    const sim = farm(1);
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.addShelter(a.x[0], a.y[0]);
    a.pantrySeen[0] = 20;
    for (const [id, n] of Object.entries(balance.replication.cost)) a.addCarried(0, good(id), n);
    const out = new Int32Array(2);
    expect(missingCost(sim.ctx, 0, out)).toBe(FOOD_COST);
    a.addCarried(0, good('bread'), 2);
    a.addCarried(0, WHEAT, 12);
    expect(carriedPortions(sim.ctx, 0)).toBeGreaterThanOrEqual(balance.replication.costFood);
    expect(missingCost(sim.ctx, 0, out)).toBe(0);
    expect(replicate(sim.state, sim.ctx, 0)).toBeGreaterThan(0);
    // Wheat went first: the bread is kept.
    expect(a.carried(0, good('bread'))).toBe(2);
    expect(a.carried(0, WHEAT)).toBe(0);
  });
});
