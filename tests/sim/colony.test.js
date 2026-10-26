import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Action } from '../../src/sim/agents/action-types.js';
import { stepAction } from '../../src/sim/agents/actions.js';
import { imagineFight } from '../../src/sim/ai/imagination.js';
import {
  chooseTask,
  deposit,
  onBuilt,
  readyToBuild,
  shareBoard,
} from '../../src/sim/colony/colony-logic.js';
import { ProjectKind } from '../../src/sim/colony/colony-store.js';
import { replicate, roomToReplicate } from '../../src/sim/colony/replication.js';
import { EventType } from '../../src/sim/core/events.js';
import { createRng } from '../../src/sim/core/rng.js';
import { CATALOG, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { colonySystem } from '../../src/sim/systems/colony-system.js';
import { tell } from '../../src/sim/systems/social-system.js';

const DAY = balance.time.ticksPerDay;
const good = (id) => {
  const item = CATALOG.items.find((i) => i.id === id);
  return item ? item.good : WORLD_TABLES.resources.findIndex((r) => r.id === id) + 1;
};
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
const shelterCode = CATALOG.structures.find((s) => s.kind === 'shelter').code;

/**
 * A simulation whose first agent has a camp with one shelter at its feet, the pantry stocked and
 * the replication cost in hand.
 * @param {number} seed
 * @returns {Simulation}
 */
function settled(seed = 5) {
  const sim = new Simulation({ seed, balance });
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  // A house of two beds, so that two members fill it.
  colony.addShelter(a.x[0], a.y[0]);
  colony.addBed(a.x[0] + 5, a.y[0]);
  colony.addBed(a.x[0] + 6, a.y[0]);
  colony.stock[good('berries')] = 20;
  a.pantrySeen[0] = 20;
  for (const [id, n] of Object.entries(balance.replication.cost)) a.addCarried(0, good(id), n);
  // Food for the newborn: berries, as many portions as it costs.
  const berries = WORLD_TABLES.resources.find((r) => r.id === 'berries').nutrition;
  const units = Math.ceil((balance.replication.costFood * balance.cooking.portion) / berries);
  a.addCarried(0, good('berries'), units);
  sim.state.tick = 3 * DAY;
  return sim;
}

describe('replication', () => {
  it('needs a free bed and food to spare in the pantry', () => {
    const sim = settled();
    expect(roomToReplicate(sim.state, sim.ctx, 0)).toBe(true);
    sim.agents.pantrySeen[0] = 0;
    expect(roomToReplicate(sim.state, sim.ctx, 0)).toBe(false);
    sim.agents.pantrySeen[0] = 20;
    sim.state.colonies[0].members = 2;
    expect(roomToReplicate(sim.state, sim.ctx, 0)).toBe(false);
  });

  it('gives birth to a replica with mutated attributes and no memory', () => {
    const sim = settled();
    const a = sim.agents;
    a.memory[0].remember(0, 3, 3, 0, sim.tick, 1, 1000, 4);
    a.recipes[0].learn(recipe('spear'), sim.tick, 1000);
    const child = replicate(sim.state, sim.ctx, 0);
    expect(child).toBe(1);
    expect(a.colony[child]).toBe(0);
    expect(a.generation[child]).toBe(1);
    expect(a.parent[child]).toBe(0);
    expect(a.memory[child].count).toBe(0);
    expect(a.recipes[child].knownMask()).toBe(0);
    expect(a.hunger[child]).toBe(balance.agent.startNeeds);
    const m = balance.replication.mutation;
    expect(Math.abs(a.force[child] / a.force[0] - 1)).toBeLessThanOrEqual(m);
    expect(Math.abs(a.speed[child] / a.speed[0] - 1)).toBeLessThanOrEqual(m);
    expect(a.carried(0, good('berries'))).toBe(0);
    expect(sim.state.colonies[0].births).toBe(1);
    expect(sim.events.events.at(-1)).toMatchObject({ type: EventType.BIRTH, agent: 1, subject: 0 });
  });
});

describe('colony work', () => {
  it('opens a shelter project when every bed is taken, and shares it out', () => {
    const sim = settled();
    const a = sim.agents;
    replicate(sim.state, sim.ctx, 0);
    sim.state.tick = 4 * DAY;
    colonySystem(sim.state, sim.ctx);
    const colony = sim.state.colonies[0];
    const slot = colony.findProject(ProjectKind.SHELTER);
    expect(slot).toBeGreaterThanOrEqual(0);
    const project = colony.projects[slot];
    // Both know where wood is; each reserves a part.
    for (const id of [0, 1]) {
      a.memory[id].remember(good('wood'), a.x[0] + 2, a.y[0], 9, sim.tick, 1, 1000, 4);
      a.x[id] = colony.campX;
      a.y[id] = colony.campY;
    }
    project.needs.fill(0);
    project.needs[good('wood')] = 10;
    expect(chooseTask(sim.state, sim.ctx, colony, 0)).toBe(true);
    expect(chooseTask(sim.state, sim.ctx, colony, 1)).toBe(true);
    expect(a.taskGood[0]).toBe(good('wood'));
    expect(project.reserved[good('wood')]).toBe(10);
    for (const id of [0, 1]) {
      a.addCarried(id, good('wood'), a.taskAmount[id]);
      deposit(sim.state, sim.ctx, colony, id);
    }
    expect(colony.stock[good('wood')]).toBe(10);
    expect([...project.contributors].filter((id) => id >= 0)).toEqual([0, 1]);
    expect(readyToBuild(colony, project)).toBe(true);
  });

  it('reports a shelter built together, and the builders remember working together', () => {
    const sim = settled();
    const a = sim.agents;
    replicate(sim.state, sim.ctx, 0);
    sim.state.tick = 4 * DAY;
    colonySystem(sim.state, sim.ctx);
    const colony = sim.state.colonies[0];
    const slot = colony.findProject(ProjectKind.SHELTER);
    const project = colony.projects[slot];
    project.addContributor(1);
    a.taskProject[0] = slot;
    a.taskBuild[0] = 1;
    project.builder = 0;
    onBuilt(sim.state, sim.ctx, 0, shelterCode, a.x[0] + 3, a.y[0]);
    expect(colony.shelterCount).toBe(2);
    expect(sim.events.events.at(-1)).toMatchObject({
      type: EventType.COLONY_PROJECT,
      subject: 2 * 16 + ProjectKind.SHELTER,
    });
    expect(a.social[0].shared[a.social[0].find(1)]).toBe(1);
    expect(project.kind).toBe(ProjectKind.NONE);
  });

  it('shares places on the blackboard at the camp', () => {
    const sim = settled();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    replicate(sim.state, sim.ctx, 0);
    a.memory[0].remember(good('stone'), 30, 30, 9, sim.tick, 1, 1000, 4);
    shareBoard(sim.state, sim.ctx, colony, 0);
    expect(shareBoard(sim.state, sim.ctx, colony, 1)).toBeGreaterThan(0);
    const i = a.memory[1].find(good('stone'), 30, 30, 0);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(a.memory[1].strength(i, sim.tick)).toBeCloseTo(balance.social.heardStrength, 5);
  });
});

describe('transmission', () => {
  it('passes a recipe by word of mouth, at the strength of hearsay', () => {
    const sim = settled();
    const a = sim.agents;
    replicate(sim.state, sim.ctx, 0);
    a.recipes[0].learn(recipe('spear'), sim.tick, 10000);
    tell(sim.state, sim.ctx, 0, 1);
    expect(a.recipes[1].knows(recipe('spear'))).toBe(true);
    expect(a.recipes[1].strength(recipe('spear'), sim.tick)).toBeCloseTo(0.5, 5);
  });

  it('a misheard recipe fails when used and becomes a failure', () => {
    const sim = settled();
    const a = sim.agents;
    const r = recipe('workbench');
    a.recipes[0].learn(r, sim.tick, 10000, 0.5, true);
    a.addCarried(0, good('wood'), 4);
    a.addCarried(0, good('fiber'), 2);
    a.x[0] += 1;
    a.craftRecipe[0] = r;
    a.action[0] = Action.CRAFT;
    for (let t = 0; t < 100 && a.action[0] === Action.CRAFT; t++) stepAction(sim.state, sim.ctx, 0);
    expect(a.recipes[0].knows(r)).toBe(false);
    expect(a.recipes[0].hasFailed(CATALOG.recipes[r].station, CATALOG.recipes[r].mask)).toBe(true);
    expect(a.carried(0, good('wood'))).toBe(2);
    expect(sim.events.events.at(-1).type).toBe(EventType.MISTAKEN);
  });

  it('those who watch a recipe made may learn it', () => {
    const sim = settled();
    const a = sim.agents;
    replicate(sim.state, sim.ctx, 0);
    sim.ctx.balance = { ...sim.ctx.balance, social: { ...balance.social, imitationChance: 1 } };
    const r = recipe('workbench');
    a.recipes[0].learn(r, sim.tick, 10000);
    a.addCarried(0, good('wood'), 4);
    a.addCarried(0, good('fiber'), 2);
    a.x[0] += 1;
    a.craftRecipe[0] = r;
    a.action[0] = Action.CRAFT;
    for (let t = 0; t < 100 && a.action[0] === Action.CRAFT; t++) stepAction(sim.state, sim.ctx, 0);
    expect(a.recipes[1].knows(r)).toBe(true);
    expect(a.social[1].skills[a.social[1].find(0)] & (1 << r)).not.toBe(0);
  });
});

describe('mental simulation', () => {
  it('imagines a fight as riskier without a weapon or when wounded', () => {
    const cfg = balance.imagination;
    const predator = balance.threats;
    const risk = (hp, attack) =>
      imagineFight({ hp, maxHp: 100, attack, defense: 2 }, predator, cfg, createRng(3));
    expect(risk(45, 10)).toBeLessThan(risk(45, 5));
    expect(risk(40, 5)).toBeGreaterThan(risk(100, 5));
    expect(risk(45, 5)).toBe(risk(45, 5));
  });
});

// J5 exit: a colony of at least 20 individuals, stable (no extinction, no explosion) over 30
// days on at least 8 seeds out of 10, with shelters built together from a stock gathered ahead.
describe('colony (J5 exit)', () => {
  it('grows to at least 20 and stays stable for 30 days', async () => {
    let ok = 0;
    let cooperative = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = new Simulation({ seed, balance });
      let extinct = false;
      let together = false;
      let seen = 0;
      for (let d = 0; d < 30 && !extinct; d++) {
        sim.step(DAY);
        extinct = sim.agents.aliveCount === 0;
        // The log keeps only the latest events: look at them day by day.
        for (const e of sim.events.since(seen)) {
          if (e.type === EventType.COLONY_PROJECT && e.subject >> 4 >= 2) together = true;
        }
        seen = sim.events.count;
        // Let Vitest's worker messages through during this long test.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const n = sim.agents.aliveCount;
      if (!extinct && n >= 20 && n <= balance.colony.maxPopulation) ok++;
      if (together) cooperative++;
    }
    expect(ok).toBeGreaterThanOrEqual(8);
    expect(cooperative).toBeGreaterThanOrEqual(8);
  }, 120000);
});
