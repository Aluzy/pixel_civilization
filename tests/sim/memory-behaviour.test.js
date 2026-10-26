import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { recall } from '../../src/sim/agents/beliefs.js';
import { WATER_SUBJECT } from '../../src/sim/agents/memory.js';
import { EventType } from '../../src/sim/core/events.js';
import { Simulation } from '../../src/sim/simulation.js';

const DAY = balance.time.ticksPerDay;

describe('memory in play', () => {
  it('remembers water and food it has seen, sized by its Mémoire attribute', () => {
    const sim = new Simulation({ seed: 3, balance });
    sim.step(DAY);
    const agent = sim.describeAgent(0);
    expect(agent.memoryCapacity).toBe(balance.agent.start.memory);
    expect(agent.memory.length).toBeGreaterThan(0);
    expect(agent.memory.length).toBeLessThanOrEqual(agent.memoryCapacity);
    expect(agent.knownWater.length).toBeGreaterThan(0);
    for (let i = 1; i < agent.memory.length; i++) {
      expect(agent.memory[i - 1].strength).toBeGreaterThanOrEqual(agent.memory[i].strength);
    }
  });

  it('recalls strong memories exactly and weak ones approximately', () => {
    const sim = new Simulation({ seed: 3, balance });
    const memory = sim.agents.memory[0];
    memory.remember(WATER_SUBJECT, 40, 40, 0, 0, 1, sim.ctx.placeTau, 4);
    const out = new Int32Array(2);
    recall(sim.ctx, 0, 0, 0, out);
    expect([...out]).toEqual([40, 40]);
    const late = Math.round(sim.ctx.placeTau * 2);
    recall(sim.ctx, 0, 0, late, out);
    const drift = Math.max(Math.abs(out[0] - 40), Math.abs(out[1] - 40));
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeLessThanOrEqual(balance.memory.maxBlur);
  });

  // Seed 9 tells the J3 story: an individual forgets a place, looks for it from a blurred memory,
  // misses it ("not found"), then rediscovers it. (The seed changes when behaviour does: seed 20
  // told it until J6, 16 until J8, 10 until J9, 25 until J10, 1 until J11, 27 until J12, 2 until
  // the village, 4 until the canals, 3 until the architecture.)
  it('forgets a place, fails to find it, then rediscovers it (J3 exit, seed 9)', async () => {
    const sim = new Simulation({ seed: 9, balance });
    // The log keeps only the latest events: gather them as time goes by.
    const events = [];
    const slice = 100;
    for (let t = 0; t < 30 * DAY; t += slice) {
      const seen = sim.events.count;
      sim.step(slice);
      events.push(...sim.events.since(seen));
      // Let Vitest's worker messages through during this long test.
      if (t % DAY === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const story = events.flatMap((forgot, i) => {
      if (forgot.type !== EventType.FORGOT_PLACE) return [];
      const failed = events.findIndex(
        (e, j) =>
          j > i &&
          e.type === EventType.NOT_FOUND &&
          e.agent === forgot.agent &&
          e.subject === forgot.subject,
      );
      if (failed < 0) return [];
      const found = events.findIndex(
        (e, k) =>
          k > failed &&
          e.type === EventType.REDISCOVERED &&
          e.agent === forgot.agent &&
          e.subject === forgot.subject &&
          e.x === forgot.x &&
          e.y === forgot.y,
      );
      return found < 0 ? [] : [{ forgot, failed: events[failed], found: events[found] }];
    });
    expect(story.length).toBeGreaterThan(0);
    const { forgot, failed, found } = story[0];
    expect(forgot.tick).toBeLessThan(failed.tick);
    expect(failed.tick).toBeLessThan(found.tick);
  }, 180000);

  it('marks the areas it sees as explored', () => {
    const sim = new Simulation({ seed: 4, balance });
    sim.step(DAY);
    const map = sim.agents.explored[0];
    expect(map.size).toBeGreaterThan(4);
    const cell = Math.floor(sim.agents.x[0] / map.cellSize);
    const row = Math.floor(sim.agents.y[0] / map.cellSize);
    expect(map.lastSeen(cell, row)).toBeGreaterThan(0);
  });
});
