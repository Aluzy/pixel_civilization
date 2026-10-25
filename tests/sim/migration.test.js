import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Action } from '../../src/sim/agents/action-types.js';
import { tradeBehaviour } from '../../src/sim/agents/trade-work.js';
import { Expedition } from '../../src/sim/colony/colony-store.js';
import {
  foundColony,
  migrationPressure,
  openExpedition,
  postExpedition,
  senseMigration,
  updateExpedition,
} from '../../src/sim/colony/migration.js';
import { EventType } from '../../src/sim/core/events.js';
import { createRng } from '../../src/sim/core/rng.js';
import { bestCaravan } from '../../src/sim/economy/jobs.js';
import { CATALOG, JOBS, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { socialSystem } from '../../src/sim/systems/social-system.js';

const DAY = balance.time.ticksPerDay;
const MIG = balance.migration;
const good = (id) => {
  const item = CATALOG.items.find((i) => i.id === id);
  return item ? item.good : WORLD_TABLES.resources.findIndex((r) => r.id === id) + 1;
};

/**
 * A simulation whose first agent stands at the camp of a crowded colony.
 * @param {number} [members]
 * @returns {Simulation}
 */
function crowded(members = MIG.fullMembers) {
  const sim = new Simulation({ seed: 5, balance });
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  colony.hasCamp = true;
  colony.campX = a.x[0];
  colony.campY = a.y[0];
  colony.members = members;
  a.crowdSeen[0] = members;
  sim.state.tick = 30 * DAY;
  return sim;
}

/**
 * Another member, standing at (x, y).
 * @param {Simulation} sim
 * @param {number} x
 * @param {number} y
 * @param {number} [colony=0]
 * @returns {number}
 */
function member(sim, x, y, colony = 0) {
  return sim.agents.create({
    x,
    y,
    tick: sim.state.tick,
    attributes: balance.agent.start,
    needs: 0,
    rng: createRng(`m${x},${y}`),
    colony,
  });
}

describe('migration', () => {
  it('feels the crowd from a hundred members, more when curious', () => {
    const sim = crowded();
    const a = sim.agents;
    a.crowdSeen[0] = MIG.minMembers;
    expect(migrationPressure(sim.ctx, 0)).toBe(0);
    a.crowdSeen[0] = (MIG.minMembers + MIG.fullMembers) / 2;
    const mid = migrationPressure(sim.ctx, 0);
    expect(mid).toBeGreaterThan(0);
    const k = sim.ctx.genes.index.curiosity;
    a.genes[k] = sim.ctx.genes.genes[k].max;
    expect(migrationPressure(sim.ctx, 0)).toBeGreaterThan(mid);
  });

  it('one member at a time scouts, once the colony may send an expedition', () => {
    const sim = crowded();
    const colony = sim.state.colonies[0];
    expect(senseMigration(sim.state, sim.ctx, 0, colony, true)).toBe(1);
    expect(colony.scout).toBe(0);
    const other = member(sim, sim.agents.x[0], sim.agents.y[0]);
    sim.agents.crowdSeen[other] = MIG.fullMembers;
    expect(senseMigration(sim.state, sim.ctx, other, colony, true)).toBe(0);
    // Too soon after the last expedition: nobody scouts.
    colony.scout = -1;
    colony.lastExpedition = sim.state.tick;
    expect(senseMigration(sim.state, sim.ctx, other, colony, true)).toBe(0);
  });

  it('posts the expedition back at the camp, recruits, then leaves with enough members', () => {
    const sim = crowded();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    openExpedition(sim.state, sim.ctx, colony, 0, a.x[0] + 70, a.y[0]);
    expect(colony.expState).toBe(Expedition.RECRUITING);
    const joiner = member(sim, a.x[0], a.y[0]);
    a.crowdSeen[joiner] = MIG.fullMembers;
    // Not posted yet: nobody can join.
    expect(senseMigration(sim.state, sim.ctx, joiner, colony, true)).toBe(0);
    postExpedition(sim.state, sim.ctx, colony, 0);
    expect(sim.events.events.at(-1).type).toBe(EventType.EXPEDITION);
    expect(senseMigration(sim.state, sim.ctx, joiner, colony, true)).toBe(1);
    expect(colony.inExpedition(joiner)).toBe(true);
    // It knows where the water of the site is.
    const memory = a.memory[joiner];
    expect(memory.nearest(sim.ctx.waterSubjects, colony.expX, colony.expY)).toBeGreaterThanOrEqual(
      0,
    );
    for (let i = 2; i < MIG.minSize; i++) {
      const m = member(sim, a.x[0], a.y[0]);
      a.crowdSeen[m] = MIG.fullMembers;
      senseMigration(sim.state, sim.ctx, m, colony, true);
    }
    sim.state.tick += MIG.recruitTicks;
    updateExpedition(sim.state, sim.ctx, colony);
    expect(colony.expState).toBe(Expedition.TRAVELLING);
  });

  it('gives up an expedition that finds too few members', () => {
    const sim = crowded();
    const colony = sim.state.colonies[0];
    openExpedition(sim.state, sim.ctx, colony, 0, sim.agents.x[0] + 70, sim.agents.y[0]);
    postExpedition(sim.state, sim.ctx, colony, 0);
    sim.state.tick += 2 * MIG.recruitTicks;
    updateExpedition(sim.state, sim.ctx, colony);
    expect(colony.expState).toBe(Expedition.NONE);
  });

  it('the first shelter on the site founds a daughter colony, kin to its mother', () => {
    const sim = crowded();
    const a = sim.agents;
    const mother = sim.state.colonies[0];
    const [x, y] = [a.x[0] + 70, a.y[0]];
    openExpedition(sim.state, sim.ctx, mother, 0, x, y);
    const other = member(sim, a.x[0], a.y[0]);
    mother.expMembers[1] = other;
    mother.expState = Expedition.TRAVELLING;
    // Too far from the site: an ordinary shelter.
    expect(foundColony(sim.state, sim.ctx, 0, a.x[0], a.y[0])).toBe(false);
    expect(foundColony(sim.state, sim.ctx, 0, x + 1, y)).toBe(true);
    const daughter = sim.state.colonies[1];
    expect([a.colony[0], a.colony[other], daughter.parent, daughter.members]).toEqual([1, 1, 0, 2]);
    expect([daughter.campX, daughter.campY, daughter.shelterCount]).toEqual([x + 1, y, 1]);
    expect([mother.relKin[1], daughter.relKin[0], mother.relCampX[1]]).toEqual([1, 1, x + 1]);
    expect(daughter.relPrice[0 * CATALOG.goodCount + good('wheat')]).toBe(
      mother.price[good('wheat')],
    );
    expect(mother.expState).toBe(Expedition.NONE);
    const e = sim.events.events.at(-1);
    expect([e.type, e.subject, e.other]).toEqual([EventType.COLONY_FOUNDED, 1, 0]);
  });
});

describe('caravans', () => {
  /**
   * A mother colony and a daughter 40 tiles east, the first agent a merchant at the mother's camp.
   * @returns {Simulation}
   */
  function twoColonies() {
    const sim = crowded();
    const a = sim.agents;
    const mother = sim.state.colonies[0];
    const founder = member(sim, a.x[0] + 40, a.y[0]);
    openExpedition(sim.state, sim.ctx, mother, founder, a.x[0] + 40, a.y[0]);
    mother.expState = Expedition.TRAVELLING;
    foundColony(sim.state, sim.ctx, founder, a.x[0] + 40, a.y[0]);
    a.job[0] = JOBS.index.merchant;
    a.priceSeen.set(mother.price, 0);
    return sim;
  }

  it('a merchant sees what pays to carry to the other colony', () => {
    const sim = twoColonies();
    const mother = sim.state.colonies[0];
    const G = CATALOG.goodCount;
    const out = new Int32Array(2);
    expect(bestCaravan(sim.ctx, 0, out)).toBe(0);
    // Bread is dear over there.
    mother.relPrice[1 * G + good('bread')] = 500;
    expect(bestCaravan(sim.ctx, 0, out)).toBeGreaterThan(0);
    expect([out[0], out[1]]).toEqual([1, good('bread')]);
  });

  it('buys a load at home, sells it over there, and brings the prices back', () => {
    const sim = twoColonies();
    const a = sim.agents;
    const [mother, daughter] = sim.state.colonies;
    const G = CATALOG.goodCount;
    const bread = good('bread');
    mother.relPrice[1 * G + bread] = 500;
    mother.stock[bread] = 50;
    daughter.treasury = 10000;
    a.coins[0] = 10000;
    const plan = sim.ctx.plan;
    tradeBehaviour(sim.state, sim.ctx, 0, plan);
    expect([a.caravanTo[0], a.caravanLeg[0]]).toEqual([1, 1]);
    const carried = a.carried(0, bread);
    expect(carried).toBeGreaterThan(0);
    // At the daughter's camp.
    a.x[0] = daughter.campX;
    a.y[0] = daughter.campY;
    tradeBehaviour(sim.state, sim.ctx, 0, plan);
    expect(daughter.stock[bread]).toBe(carried);
    expect([mother.relTrades[1], daughter.relTrades[0], a.caravanLeg[0]]).toEqual([1, 1, 2]);
    expect(sim.events.events.some((e) => e.type === EventType.FIRST_TRADE)).toBe(true);
    // Home again: the prices it saw are posted.
    a.x[0] = mother.campX;
    a.y[0] = mother.campY;
    tradeBehaviour(sim.state, sim.ctx, 0, plan);
    expect(a.caravanTo[0]).toBe(-1);
    expect(mother.relPrice[1 * G + bread]).toBe(daughter.price[bread]);
    expect(mother.relPriceTick[1]).toBe(sim.state.tick);
  });

  it('members of two colonies who talk count a meeting', () => {
    const sim = twoColonies();
    const a = sim.agents;
    const stranger = member(sim, a.x[0] + 1, a.y[0], 1);
    a.action[0] = Action.IDLE;
    a.action[stranger] = Action.IDLE;
    // The tick the first agent talks.
    while (sim.state.tick % balance.social.talkInterval !== 0) sim.state.tick++;
    socialSystem(sim.state, sim.ctx);
    expect(sim.state.colonies[0].relMeetings[1]).toBe(1);
    expect(sim.state.colonies[1].relMeetings[0]).toBe(1);
  });
});
