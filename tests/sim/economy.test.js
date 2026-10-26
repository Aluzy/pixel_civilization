import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { stepAction } from '../../src/sim/agents/actions.js';
import { Action } from '../../src/sim/agents/action-types.js';
import { replicate } from '../../src/sim/colony/replication.js';
import { EventType } from '../../src/sim/core/events.js';
import { createRng } from '../../src/sim/core/rng.js';
import { BARE_HANDS } from '../../src/sim/crafting/catalog.js';
import { chooseTrial } from '../../src/sim/crafting/experiment.js';
import { TrialNotebook } from '../../src/sim/crafting/notebook.js';
import { RecipeBook } from '../../src/sim/crafting/recipe-book.js';
import {
  canDo,
  considerJob,
  estimatedIncome,
  expectedIncome,
  kitchenMargin,
} from '../../src/sim/economy/jobs.js';
import { bequeath, buy, buyFood, mint, sell } from '../../src/sim/economy/market.js';
import { askOf, bidOf, scarcity, updatePrices } from '../../src/sim/economy/prices.js';
import { CATALOG, JOBS, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { economySystem } from '../../src/sim/systems/economy-system.js';

const DAY = balance.time.ticksPerDay;
const ECO = balance.economy;
const good = (id) => {
  const item = CATALOG.items.find((i) => i.id === id);
  return item ? item.good : WORLD_TABLES.resources.findIndex((r) => r.id === id) + 1;
};
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
const job = (id) => JOBS.index[id];
const WHEAT = good('wheat');
const BREAD = good('bread');
const FLOUR = good('flour');

/**
 * A simulation whose first agent stands at the camp of a colony of `members` members.
 * @param {number} [members]
 * @returns {Simulation}
 */
function market(members = 20) {
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
 * A second member of the colony, beside the first.
 * @param {Simulation} sim
 * @param {number} [parent=-1]
 * @returns {number}
 */
function member(sim, parent = -1) {
  const a = sim.agents;
  return a.create({
    x: a.x[0],
    y: a.y[0],
    tick: sim.state.tick,
    attributes: balance.agent.start,
    needs: 0,
    rng: createRng('member'),
    colony: 0,
    parent,
  });
}

describe('prices', () => {
  const prices = new Simulation({ seed: 1, balance }).ctx.basePrices;

  it('values food by what it nourishes, materials by their work, made goods by their inputs', () => {
    expect(prices[WHEAT]).toBeCloseTo(6 * ECO.coinsPerNutrition);
    expect(prices[good('stone')]).toBeCloseTo(40 * ECO.coinsPerTick);
    // Flour: three grains and the work of grinding them; bread: two flours and the baking.
    expect(prices[FLOUR]).toBeCloseTo(3 * prices[WHEAT] + 30 * ECO.coinsPerTick);
    expect(prices[BREAD]).toBeGreaterThan(2 * prices[FLOUR]);
    // A seed is worth what gathering grain is.
    expect(prices[good('seed')]).toBeCloseTo(prices[WHEAT]);
  });

  it('pays whole écus and asks a little more', () => {
    expect(bidOf(7.9)).toBe(7);
    expect(askOf(7.9, 1.2)).toBe(10);
    expect(askOf(0.2, 1.2)).toBe(1);
  });

  it('rises when the stock is short of what is used, falls when it abounds, within bounds', () => {
    expect(scarcity(10, 10, 0, ECO)).toBeGreaterThan(1);
    expect(scarcity(1000, 10, 0, ECO)).toBeLessThan(1);
    expect(scarcity(0, 1e6, 0, ECO)).toBe(ECO.scarcityMax);
    expect(scarcity(1e9, 0, 0, ECO)).toBe(ECO.scarcityMin);
    // What the projects wait for counts as scarcity too.
    expect(scarcity(5, 0, 50, ECO)).toBeGreaterThan(scarcity(5, 0, 0, ECO));
  });

  it('moves the reference price a step a day towards the scarce or abundant price', () => {
    const sim = market();
    const colony = sim.state.colonies[0];
    const wanted = new Int32Array(CATALOG.goodCount);
    colony.stock[WHEAT] = 0;
    colony.outToday[WHEAT] = 400;
    colony.stock[BREAD] = 5000;
    const before = [colony.price[WHEAT], colony.price[BREAD]];
    updatePrices(colony, sim.ctx.basePrices, wanted, ECO);
    expect(colony.price[WHEAT]).toBeGreaterThan(before[0]);
    expect(colony.price[BREAD]).toBeLessThan(before[1]);
    expect(colony.outToday[WHEAT]).toBe(0);
    expect(colony.useAvg[WHEAT]).toBeCloseTo(400 * ECO.useStep);
  });
});

describe('counter', () => {
  it('buys what is brought to the stock, with the écus it has, and tells the first sale', () => {
    const sim = market();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.treasury = 1000;
    a.job[0] = job('farmer');
    a.addCarried(0, WHEAT, 10);
    const pay = sell(sim.state, sim.ctx, colony, 0, WHEAT, 10);
    expect(pay).toBe(bidOf(colony.price[WHEAT]) * 10);
    expect([a.coins[0] - ECO.startCoins, colony.treasury, colony.stock[WHEAT]]).toEqual([
      pay,
      1000 - pay,
      10,
    ]);
    expect(colony.sold[(job('farmer') + 1) * CATALOG.goodCount + WHEAT]).toBe(10);
    const e = sim.events.events.at(-1);
    expect([e.type, e.subject, e.other]).toEqual([EventType.FIRST_SALE, WHEAT, job('farmer')]);
    // An empty counter still takes the goods, unpaid.
    colony.treasury = 0;
    a.addCarried(0, WHEAT, 5);
    expect(sell(sim.state, sim.ctx, colony, 0, WHEAT, 5)).toBe(0);
    expect(colony.stock[WHEAT]).toBe(15);
  });

  it('sells what one can pay for, and the first purchase names who brought it', () => {
    const sim = market();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const baker = member(sim);
    colony.stock[BREAD] = 10;
    colony.lastSeller[BREAD] = baker;
    const ask = askOf(colony.price[BREAD], ECO.spread);
    a.coins[0] = ask * 3 + 1;
    expect(buy(sim.state, sim.ctx, colony, 0, BREAD, 5)).toBe(3);
    expect([a.carried(0, BREAD), a.coins[0], colony.stock[BREAD]]).toEqual([3, 1, 7]);
    expect(colony.outToday[BREAD]).toBe(3);
    const e = sim.events.events.at(-1);
    expect([e.type, e.subject, e.other]).toEqual([EventType.FIRST_PURCHASE, BREAD, baker]);
  });

  it('a hungry member buys the food worth most for its écus; what it cannot pay, it is given', () => {
    const sim = market();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.stock[WHEAT] = 100;
    colony.stock[BREAD] = 100;
    // Bread is dear: a rich member buys the grain that gives more for its écus.
    colony.price[BREAD] = 1000;
    a.coins[0] = 10000;
    buyFood(sim.state, sim.ctx, colony, 0, 24);
    expect([a.carried(0, WHEAT), a.carried(0, BREAD)]).toEqual([4, 0]);
    // Bread is cheap: it buys bread.
    colony.price[BREAD] = 1;
    buyFood(sim.state, sim.ctx, colony, 0, 47);
    expect(a.carried(0, BREAD)).toBe(1);
    // Without écus, the colony gives the cheapest food for what it nourishes.
    a.coins[0] = 0;
    const given = colony.rations;
    buyFood(sim.state, sim.ctx, colony, 0, 47);
    expect(colony.rations).toBeGreaterThan(given);
  });

  it('mints what the money of the colony lacks, never more', () => {
    const sim = market(10);
    const colony = sim.state.colonies[0];
    colony.treasury = 0;
    mint(sim.ctx, colony, 0);
    const target = ECO.coinsPerMember * 10;
    expect(colony.treasury + sim.agents.coins[0]).toBe(target);
    mint(sim.ctx, colony, 0);
    expect(colony.minted).toBe(target - ECO.startCoins);
  });

  it('pays the posts their wage at dawn', () => {
    const sim = market();
    const colony = sim.state.colonies[0];
    colony.inventor = 0;
    sim.state.tick = 4 * DAY;
    const before = sim.agents.coins[0];
    economySystem(sim.state, sim.ctx);
    expect(sim.agents.coins[0]).toBe(before + ECO.wage);
  });

  it('leaves the écus of the dead to its children, else to the counter', () => {
    const sim = market();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    sim.state.tick += 10;
    const c1 = member(sim, 0);
    const c2 = member(sim, 0);
    a.coins[0] = 101;
    bequeath(sim.state, sim.ctx, 0);
    expect([a.coins[c1], a.coins[c2], a.coins[0]]).toEqual([51, 50, 0]);
    a.coins[c1] = 30;
    const before = colony.treasury;
    bequeath(sim.state, sim.ctx, c1);
    expect(colony.treasury).toBe(before + 30);
  });

  it('a replica receives part of its parent’s écus and learns its job', () => {
    const sim = market(1);
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.addShelter(a.x[0], a.y[0]);
    colony.addBed(a.x[0] + 5, a.y[0]);
    colony.addBed(a.x[0] + 6, a.y[0]);
    a.pantrySeen[0] = 1000;
    a.addCarried(0, good('fiber'), 3);
    a.addCarried(0, good('berries'), 10);
    a.coins[0] = 100;
    a.job[0] = job('gatherer');
    const child = replicate(sim.state, sim.ctx, 0);
    expect(child).toBeGreaterThan(0);
    expect([a.coins[child], a.coins[0], a.job[child]]).toEqual([30, 70, job('gatherer')]);
  });
});

describe('jobs', () => {
  it('a job needs its recipes: sowing for a farmer, a dish for a baker', () => {
    const sim = market();
    const book = sim.agents.recipes[0];
    const jobs = JOBS.jobs;
    expect(canDo(sim.ctx, jobs[job('farmer')], 0)).toBe(false);
    expect(canDo(sim.ctx, jobs[job('baker')], 0)).toBe(false);
    expect(canDo(sim.ctx, jobs[job('gatherer')], 0)).toBe(true);
    book.learn(recipe('plot'), 0, 1e6);
    book.learn(recipe('bread'), 0, 1e6);
    expect(canDo(sim.ctx, jobs[job('farmer')], 0)).toBe(true);
    expect(canDo(sim.ctx, jobs[job('baker')], 0)).toBe(true);
    // Posts are given by the colony, never chosen.
    expect(canDo(sim.ctx, jobs[job('guard')], 0)).toBe(false);
  });

  it('expects from a job what it earned there, else what the prices it saw promise', () => {
    const sim = market();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    a.priceSeen.set(colony.price, 0);
    const j = job('gatherer');
    const estimate = estimatedIncome(sim.ctx, JOBS.jobs[j], 0);
    expect(estimate).toBeGreaterThan(0);
    expect(expectedIncome(sim.ctx, j, 0)).toBe(estimate);
    a.jobDays[j] = 3;
    a.jobIncome[j] = 42;
    expect(expectedIncome(sim.ctx, j, 0)).toBe(42);
  });

  it('a kitchen recipe pays the output less its inputs at the counter', () => {
    const sim = market();
    const prices = sim.state.colonies[0].price;
    const bread = recipe('bread');
    const m = bidOf(prices[BREAD]) - 2 * askOf(prices[FLOUR], ECO.spread);
    expect(kitchenMargin(sim.ctx, prices, 0, bread)).toBe(m);
  });

  it('chooses the best paid job, keeps it for days, and leaves it only for clearly more', () => {
    const sim = market();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const J = a.jobCount;
    const gatherer = job('gatherer');
    const woodcutter = job('woodcutter');
    const miner = job('miner');
    for (const j of [gatherer, woodcutter, miner]) a.jobDays[j] = 1;
    a.jobIncome[gatherer] = 100;
    a.jobIncome[woodcutter] = 50;
    a.jobIncome[miner] = 10;
    expect(considerJob(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect(a.job[0]).toBe(gatherer);
    // Too soon to change.
    a.jobIncome[woodcutter] = 500;
    expect(considerJob(sim.state, sim.ctx, colony, 0)).toBe(false);
    // Later: a little more is not enough, clearly more is.
    sim.state.tick += ECO.jobDays * DAY;
    a.jobIncome[woodcutter] = 100 * (1 + ECO.inertia) - 1;
    expect(considerJob(sim.state, sim.ctx, colony, 0)).toBe(false);
    a.jobIncome[woodcutter] = 200;
    expect(considerJob(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect(a.job[0]).toBe(woodcutter);
    expect(J).toBe(JOBS.jobs.length);
    // A small colony has no jobs yet.
    colony.members = ECO.jobMembers - 1;
    sim.state.tick += ECO.jobDays * DAY;
    a.jobIncome[miner] = 1000;
    expect(considerJob(sim.state, sim.ctx, colony, 0)).toBe(false);
  });

  it('learns its income from what it earned, net of the inputs it bought', () => {
    const sim = market();
    const a = sim.agents;
    a.job[0] = job('baker');
    a.earnedToday[0] = 300;
    a.spentToday[0] = 200;
    sim.state.tick = 4 * DAY;
    economySystem(sim.state, sim.ctx);
    const i = job('baker');
    expect([a.jobIncome[i], a.jobDays[i], a.earnedToday[0], a.spentToday[0]]).toEqual([
      100, 1, 0, 0,
    ]);
    const first = sim.events.events.find((e) => e.type === EventType.FIRST_JOB);
    expect(first.subject).toBe(job('baker'));
  });

  it('a gatherer without a task gathers what the counter pays and sells it', () => {
    const sim = market();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.treasury = 1000;
    a.job[0] = job('woodcutter');
    a.priceSeen.set(colony.price, 0);
    const wood = good('wood');
    a.saleGood[0] = wood;
    a.saleTick[0] = sim.state.tick - 100;
    a.addCarried(0, wood, 6);
    a.action[0] = Action.DEPOSIT;
    stepAction(sim.state, sim.ctx, 0);
    expect([colony.stock[wood], a.carried(0, wood), a.saleGood[0]]).toEqual([6, 0, 0]);
    expect(a.costPerUnit[wood]).toBeGreaterThan(0);
  });
});

describe('inventor', () => {
  const catalog = CATALOG;
  const fetch = new Float64Array(catalog.goodCount);
  const stations = new Uint8Array(catalog.structures.length + 1);
  const cost = new Float64Array(catalog.structures.length + 1);
  const out = new Int32Array(3);
  const types = new Int32Array(catalog.goodCount);
  const weights = balance.crafting.trial;
  const code = (id) => catalog.structures.find((s) => s.id === id).code;
  const bit = (id) => 1 << catalog.ingredientBit[good(id)];
  const choose = (book, notebook, focusStation = 0, idea = [-1, 0]) => {
    const found = chooseTrial(
      catalog,
      book,
      fetch,
      () => -1e9,
      stations,
      cost,
      0,
      weights,
      createRng(3),
      types,
      null,
      out,
      0,
      0,
      focusStation,
      notebook,
      idea[0],
      idea[1],
    );
    return found ? [out[0], out[1]] : null;
  };

  it('keeps a notebook of failed trials, without repeats, the oldest pushed out', () => {
    const nb = new TrialNotebook(2);
    nb.record(0, 3);
    nb.record(0, 3);
    nb.record(1, 5);
    expect([nb.count, nb.hasFailed(0, 3), nb.hasFailed(1, 5)]).toEqual([2, true, true]);
    nb.record(2, 7);
    expect([nb.count, nb.hasFailed(0, 3), nb.hasFailed(2, 7)]).toEqual([2, false, true]);
  });

  it('does not try again what the notebook says failed', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    fetch.fill(Infinity);
    for (const id of ['clay', 'stone']) fetch[good(id)] = 0;
    stations.fill(0);
    const first = choose(book, null);
    const nb = new TrialNotebook(64);
    nb.record(first[0], first[1]);
    expect(choose(book, nb)).not.toEqual(first);
  });

  it('at a station it never saw used, tries each material alone', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    fetch.fill(Infinity);
    for (const id of ['clay', 'stone', 'wood']) fetch[good(id)] = 0;
    stations.fill(0);
    stations[code('oven')] = 1;
    const [s, mask] = choose(book, null, code('oven'));
    expect(s).toBe(code('oven'));
    expect(mask & (mask - 1)).toBe(0);
  });

  it('tries first the use it had an idea of', () => {
    const book = new RecipeBook(catalog.recipes.length, 32);
    fetch.fill(Infinity);
    for (const id of ['brick', 'coal', 'clay', 'stone', 'wood']) fetch[good(id)] = 0;
    stations.fill(0);
    const foundry = catalog.recipes[recipe('foundry')];
    expect(choose(book, null, 0, [BARE_HANDS, foundry.mask])).toEqual([BARE_HANDS, foundry.mask]);
    expect(foundry.mask).toBe(bit('brick') | bit('coal'));
  });

  it('an inventor who makes a brick may guess what bricks are for', () => {
    const tuned = structuredClone(balance);
    tuned.crafting.inspiration = 1;
    const sim = new Simulation({ seed: 5, balance: tuned });
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.hasCamp = true;
    colony.inventor = 0;
    const book = a.recipes[0];
    book.learn(recipe('brick'), 0, 1e6);
    book.learn(recipe('stone_pickaxe'), 0, 1e6);
    a.addCarried(0, good('clay'), 2);
    a.craftRecipe[0] = recipe('brick');
    const oven = code('oven');
    sim.world.setResource(a.x[0] + 1, a.y[0], 0, 0);
    sim.world.setStructure(a.x[0] + 1, a.y[0], oven);
    a.action[0] = Action.CRAFT;
    a.actionProgress[0] = 1e6;
    stepAction(sim.state, sim.ctx, 0);
    expect(a.carried(0, good('brick'))).toBe(1);
    const foundry = catalog.recipes[recipe('foundry')];
    expect([a.ideaStation[0], a.ideaMask[0]]).toEqual([foundry.station, foundry.mask]);
  });
});
