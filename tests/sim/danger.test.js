import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Action } from '../../src/sim/agents/action-types.js';
import { stepAction } from '../../src/sim/agents/actions.js';
import { agentDefense } from '../../src/sim/agents/combat.js';
import { defenseBonus } from '../../src/sim/agents/equipment.js';
import { imagineFight } from '../../src/sim/ai/imagination.js';
import { EventType } from '../../src/sim/core/events.js';
import { createRng } from '../../src/sim/core/rng.js';
import { CATALOG, GOAL_TABLE, Simulation } from '../../src/sim/simulation.js';
import { lifecycleSystem } from '../../src/sim/systems/lifecycle-system.js';
import { destroyDen, isolatedShelter, threatSystem } from '../../src/sim/systems/threat-system.js';
import { worldSystem } from '../../src/sim/systems/world-system.js';
import { PACK } from '../../src/sim/world/chunk-store.js';

const DAY = balance.time.ticksPerDay;
const cfg = balance.threats;
const item = (id) => CATALOG.items.find((i) => i.id === id).good;
const shelterCode = CATALOG.structures.find((s) => s.kind === 'shelter').code;
const denCode = CATALOG.structures.find((s) => s.kind === 'den').code;

/**
 * A simulation whose first agent has a camp of `members` members (it alone is real).
 * @param {number} [members]
 * @returns {Simulation}
 */
function camp(members = balance.threats.denMembers) {
  const sim = new Simulation({ seed: 5, balance });
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  colony.addShelter(a.x[0], a.y[0]);
  colony.members = members;
  return sim;
}

/**
 * @param {Simulation} sim
 * @returns {void}
 */
function toNight(sim) {
  sim.state.tick = 3 * DAY + Math.round(0.75 * DAY);
  sim.ctx.phase = sim.ctx.nightPhase;
}

/**
 * Runs only the threat system for `n` ticks.
 * @param {Simulation} sim
 * @param {number} n
 * @returns {void}
 */
function runThreats(sim, n) {
  for (let i = 0; i < n; i++) {
    sim.state.tick++;
    threatSystem(sim.state, sim.ctx);
  }
}

describe('dens and packs', () => {
  it('places a den out of sight around a colony large enough, and grows its pack at night', () => {
    const sim = camp();
    const colony = sim.state.colonies[0];
    const t = sim.state.threats;
    sim.state.tick = 3 * DAY - 1;
    runThreats(sim, 1);
    expect(t.denCount).toBe(1);
    const d = Math.max(Math.abs(t.denX[0] - colony.campX), Math.abs(t.denY[0] - colony.campY));
    expect(d).toBeGreaterThanOrEqual(Math.floor(cfg.denDistance[0] * 0.7));
    expect(sim.world.packedAt(t.denX[0], t.denY[0]) >>> PACK.STRUCTURE_SHIFT).toBe(denCode);
    toNight(sim);
    runThreats(sim, cfg.spawnInterval * 6);
    const size = Math.min(cfg.packMax, cfg.packMin + Math.floor(colony.members / cfg.packGrowth));
    expect(t.packSize(0)).toBe(size);
  });

  it('places no den around a small colony', () => {
    const sim = camp(cfg.denMembers - 1);
    sim.state.tick = 3 * DAY - 1;
    runThreats(sim, 1);
    expect(sim.state.threats.denCount).toBe(0);
  });

  it('scatters the pack and quiets the region when its den is destroyed', () => {
    const sim = camp();
    const t = sim.state.threats;
    const d = t.addDen(sim.agents.x[0] + 30, sim.agents.y[0], cfg.denHp, 0);
    const p = t.spawn(t.denX[d], t.denY[d], cfg.hp);
    t.den[p] = d;
    destroyDen(sim.state, sim.ctx, d, 0);
    expect(t.denAlive[d]).toBe(0);
    expect(t.den[p]).toBe(-1);
    expect(sim.state.colonies[0].denQuietUntil).toBeGreaterThan(sim.tick);
    expect(sim.events.events.at(-1).type).toBe(EventType.DEN_DESTROYED);
  });

  it('forces an isolated shelter, but not one among others', () => {
    const sim = camp();
    const a = sim.agents;
    const t = sim.state.threats;
    sim.world.setStructure(a.x[0], a.y[0], shelterCode);
    expect(isolatedShelter(sim.state, sim.ctx, a.x[0], a.y[0])).toBe(true);
    const d = t.addDen(a.x[0] + 30, a.y[0], cfg.denHp, 0);
    const p = t.spawn(a.x[0] + 1, a.y[0], cfg.hp);
    t.den[p] = d;
    toNight(sim);
    runThreats(sim, 2);
    expect(a.hp[0]).toBeLessThan(a.maxHp[0]);
    expect(sim.events.events.some((e) => e.type === EventType.SHELTER_FORCED)).toBe(true);
    sim.world.setStructure(a.x[0] + 2, a.y[0] + 2, shelterCode);
    expect(isolatedShelter(sim.state, sim.ctx, a.x[0], a.y[0])).toBe(false);
  });
});

describe('fear and wounds', () => {
  it('fears after an attack, fears less at the camp, and dies of a predator as such', () => {
    const sim = camp();
    const a = sim.agents;
    const t = sim.state.threats;
    toNight(sim);
    t.spawn(a.x[0] + 1, a.y[0], cfg.hp);
    runThreats(sim, 1);
    expect(a.fear[0]).toBeGreaterThanOrEqual(balance.safety.fearHit);
    // A killing blow: the death is told as one by a predator.
    a.hp[0] = 1;
    runThreats(sim, cfg.attackInterval + 1);
    lifecycleSystem(sim.state, sim.ctx);
    const death = sim.events.events.find((e) => e.type === EventType.DEATH);
    expect(death.subject).toBe(2);
  });
});

describe('fighters', () => {
  it('adds armour to defense', () => {
    const sim = camp();
    const a = sim.agents;
    const bare = agentDefense(sim.ctx, 0);
    a.addCarried(0, item('shield'), 1);
    a.addCarried(0, item('hide_armor'), 1);
    expect(defenseBonus(sim.ctx, 0)).toBe(5);
    expect(agentDefense(sim.ctx, 0)).toBe(bare + 5);
  });

  it('imagines fights as safer with allies and riskier against a pack', () => {
    const agent = { hp: 60, maxHp: 100, attack: 6, defense: 1 };
    const icfg = { ...balance.imagination, rollouts: 64 };
    const alone = imagineFight(agent, cfg, icfg, createRng(1));
    const together = imagineFight(agent, cfg, icfg, createRng(1), 3, 1);
    const pack = imagineFight(agent, cfg, icfg, createRng(1), 0, 3);
    expect(together).toBeLessThan(alone + 1e-9);
    expect(pack).toBeGreaterThan(alone - 1e-9);
    expect(pack).toBeGreaterThan(together);
  });

  it('strikes a predator and a den it is fighting', () => {
    const sim = camp();
    const a = sim.agents;
    const t = sim.state.threats;
    const p = t.spawn(a.x[0] + 1, a.y[0], cfg.hp);
    a.attackTarget[0] = p;
    a.action[0] = Action.ATTACK;
    stepAction(sim.state, sim.ctx, 0);
    expect(t.hp[p]).toBeLessThan(cfg.hp);
    expect(a.combatSkill[0]).toBeGreaterThan(0);
    const d = t.addDen(a.x[0], a.y[0] + 1, cfg.denHp, 0);
    a.attackTarget[0] = -2 - d;
    a.attackCooldown[0] = 0;
    a.action[0] = Action.ATTACK;
    stepAction(sim.state, sim.ctx, 0);
    expect(t.denHp[d]).toBeLessThan(cfg.denHp);
  });

  it('leaves a carcass that rots, and a hide from its last piece', () => {
    const sim = camp();
    const t = sim.state.threats;
    const a = sim.agents;
    const [x, y] = [a.x[0] + 1, a.y[0]];
    sim.world.setResource(x, y, 0, 0);
    const p = t.spawn(x, y, 1);
    a.attackTarget[0] = p;
    a.action[0] = Action.ATTACK;
    stepAction(sim.state, sim.ctx, 0);
    expect(sim.world.tileAt(x, y).resource).toBe(sim.ctx.carcass);
    sim.state.tick += balance.combat.carcassDays * DAY + 1;
    worldSystem(sim.state, sim.ctx);
    expect(sim.world.tileAt(x, y).resource).toBe(0);
  });
});

describe('guards', () => {
  it('takes a guard post when the colony is threatened, and watches at night', () => {
    const sim = camp(12);
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    a.addCarried(0, item('spear'), 1);
    toNight(sim);
    colony.lastThreat = sim.tick;
    colony.inventor = -1;
    colony.scribe = -1;
    a.needsDecision[0] = 1;
    sim.step(1);
    expect(colony.guards).toContain(0);
    expect(sim.events.events.some((e) => e.type === EventType.GUARD)).toBe(true);
    const guard = GOAL_TABLE.goals.findIndex((g) => g.id === 'guard');
    sim.step(20);
    expect([guard, GOAL_TABLE.goals.findIndex((g) => g.id === 'sleep')]).toContain(a.goal[0]);
  });
});

// J8 exit: over 10 seeds and 60 days, predators kill pixels (at least 1 per game on average)
// and pixels kill at least 3 times as many predators as at J7 (4.4 per game then); a guard role
// appears; safety decisions take a real share of the pixels' time (at least 1 %, against
// 0.004 % at J7), and no colony dies out.
describe('danger (J8 exit)', () => {
  it('makes predators deadly and pixels fight back', async () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let killedByPredators = 0;
    let predatorsKilled = 0;
    let withGuards = 0;
    let samples = 0;
    let safety = 0;
    let extinct = 0;
    const safe = new Set(
      ['flee', 'hide', 'guard', 'hunt'].map((id) => GOAL_TABLE.goals.findIndex((g) => g.id === id)),
    );
    for (const seed of seeds) {
      const sim = new Simulation({ seed, balance });
      let guards = false;
      let seen = 0;
      for (let t = 0; t < 60 * DAY; t += 200) {
        sim.step(200);
        for (const e of sim.events.since(seen)) {
          if (e.type === EventType.DEATH && e.subject === 2) killedByPredators++;
          if (e.type === EventType.PREDATOR_KILLED) predatorsKilled++;
          if (e.type === EventType.GUARD) guards = true;
        }
        seen = sim.events.count;
        const a = sim.agents;
        for (let id = 0; id < a.highWater; id++) {
          if (a.alive[id] !== 1) continue;
          samples++;
          if (safe.has(a.goal[id])) safety++;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (guards) withGuards++;
      if (sim.agents.aliveCount === 0) extinct++;
    }
    expect(killedByPredators / seeds.length).toBeGreaterThanOrEqual(1);
    expect(predatorsKilled / seeds.length).toBeGreaterThanOrEqual(3 * 4.4);
    expect(withGuards).toBeGreaterThan(seeds.length / 2);
    expect(safety / samples).toBeGreaterThanOrEqual(0.01);
    expect(extinct).toBe(0);
  }, 900000);
});
