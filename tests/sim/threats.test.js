import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { CATALOG, Simulation } from '../../src/sim/simulation.js';
import { threatSystem } from '../../src/sim/systems/threat-system.js';
import { Mood } from '../../src/sim/threats/threat-store.js';

const DAY = balance.time.ticksPerDay;
const cfg = balance.threats;
const spear = CATALOG.items.find((i) => i.id === 'spear').good;
const shelterCode = CATALOG.structures.find((s) => s.kind === 'shelter').code;

/**
 * A simulation at night (predators active), with no predator yet.
 * @param {number} seed
 * @returns {Simulation}
 */
function night(seed) {
  const sim = new Simulation({ seed, balance });
  const nightPhase = sim.ctx.nightPhase;
  sim.state.tick = 2 * DAY + Math.round(0.75 * DAY);
  sim.ctx.phase = nightPhase;
  return sim;
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

describe('predators', () => {
  it('appear only from the configured day, at dusk or night, out of sight', () => {
    const sim = new Simulation({ seed: 4, balance });
    let firstSeen = -1;
    for (let t = 0; t < 6 * DAY && firstSeen < 0; t++) {
      sim.step(1);
      if (sim.state.threats.aliveCount > 0) firstSeen = sim.tick;
    }
    expect(firstSeen).toBeGreaterThanOrEqual((cfg.startDay - 1) * DAY);
    const phase = sim.time().phase;
    expect(['dusk', 'night']).toContain(phase);
  });

  it('hunt an agent and trade blows when adjacent; a sleeping agent wakes up', () => {
    const sim = night(5);
    const a = sim.agents;
    a.asleep[0] = 1;
    const p = sim.state.threats.spawn(a.x[0] + 1, a.y[0], cfg.hp);
    runThreats(sim, 1);
    expect(a.hp[0]).toBe(a.maxHp[0] - Math.max(1, cfg.attack - a.defense[0]));
    expect(a.asleep[0]).toBe(0);
    expect(sim.state.threats.hp[p]).toBe(cfg.hp);
    runThreats(sim, cfg.attackInterval);
    expect(sim.state.threats.hp[p]).toBe(cfg.hp - Math.max(1, a.attack[0] - cfg.defense));
  });

  it('die against an armed agent', () => {
    const sim = night(5);
    const a = sim.agents;
    a.addCarried(0, spear, 1);
    const p = sim.state.threats.spawn(a.x[0] + 1, a.y[0], cfg.hp);
    runThreats(sim, cfg.attackInterval * 6);
    expect(sim.state.threats.alive[p]).toBe(0);
    expect(a.kills[0]).toBe(1);
    expect(sim.events.events.some((e) => e.type === 'predatorKilled')).toBe(true);
  });

  it('cannot reach an agent inside a shelter', () => {
    const sim = night(5);
    const a = sim.agents;
    sim.world.setStructure(a.x[0], a.y[0], shelterCode);
    sim.state.threats.spawn(a.x[0] + 1, a.y[0], cfg.hp);
    runThreats(sim, cfg.attackInterval * 3);
    expect(a.hp[0]).toBe(a.maxHp[0]);
  });

  it('give up a prey they cannot catch, and leave at daybreak', () => {
    const sim = night(5);
    const a = sim.agents;
    const p = sim.state.threats.spawn(a.x[0] + 20, a.y[0], cfg.hp);
    sim.state.threats.target[p] = 0;
    sim.state.threats.chase[p] = cfg.giveUpTicks + 1;
    runThreats(sim, 1);
    expect(sim.state.threats.mood[p]).toBe(Mood.FLEE);
    const q = sim.state.threats.spawn(a.x[0] + 10, a.y[0], cfg.hp);
    sim.ctx.phase = 0; // Day.
    runThreats(sim, 1);
    expect(sim.state.threats.mood[q]).toBe(Mood.FLEE);
  });

  it('kill nobody in ten days on ten seeds', () => {
    for (let seed = 11; seed <= 20; seed++) {
      const sim = new Simulation({ seed, balance });
      sim.step(10 * DAY);
      expect(sim.agents.alive[0], `seed ${seed}`).toBe(1);
      expect(
        sim.events.events.some((e) => e.type === 'death'),
        `seed ${seed}`,
      ).toBe(false);
    }
  }, 60000);
});
