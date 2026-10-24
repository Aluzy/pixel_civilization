import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { EventType } from '../../src/sim/core/events.js';
import { Simulation } from '../../src/sim/simulation.js';

// J2 exit criterion: the lone pixel survives 10 days without intervention.
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DAYS = 10;

describe('survival of the first individual', () => {
  for (const seed of SEEDS) {
    it(`survives ${DAYS} days (seed ${seed})`, () => {
      const sim = new Simulation({ seed, balance });
      sim.step(DAYS * balance.time.ticksPerDay);
      expect(sim.agents.aliveCount).toBe(1);
      const types = new Set(sim.events.events.map((e) => e.type));
      expect(types.has(EventType.FIRST_DRINK)).toBe(true);
      expect(types.has(EventType.FIRST_MEAL)).toBe(true);
      expect(types.has(EventType.FIRST_SLEEP)).toBe(true);
      expect(types.has(EventType.DEATH)).toBe(false);
    });
  }

  it('explains its decisions in its journal', () => {
    const sim = new Simulation({ seed: 3, balance });
    sim.step(balance.time.ticksPerDay);
    const agent = sim.describeAgent(0);
    expect(agent.journal.length).toBeGreaterThan(0);
    for (const entry of agent.journal) {
      expect(entry.top.length).toBeGreaterThan(0);
      expect(entry.top[0].score).toBeGreaterThanOrEqual(entry.top.at(-1).score);
    }
  });

  it('depletes the bushes it eats from, then lets them grow back', () => {
    const sim = new Simulation({ seed: 5, balance });
    sim.step(3 * balance.time.ticksPerDay);
    expect(sim.world.modifiedChunks().length).toBeGreaterThan(0);
    const regrowthQueued = sim.state.regrowth.length;
    expect(regrowthQueued).toBeGreaterThan(0);
    const first = sim.state.regrowth[0];
    sim.step(first.tick - sim.tick);
    const tile = sim.world.tileAt(first.x, first.y);
    expect(tile.resource).toBe(first.resource);
  });
});
