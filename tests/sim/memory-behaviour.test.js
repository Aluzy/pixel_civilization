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

  // Seed 47 tells the J3 story: it forgets the pond at (8, -7) on day 11, looks for it on day 19
  // from a blurred memory, misses it ("not found"), then rediscovers it the same evening.
  it('forgets a place, fails to find it, then rediscovers it (J3 exit, seed 47)', () => {
    const sim = new Simulation({ seed: 47, balance });
    sim.step(20 * DAY);
    const events = sim.events.events;
    const forgot = events.findIndex((e) => e.type === EventType.FORGOT_PLACE);
    expect(forgot).toBeGreaterThanOrEqual(0);
    const subject = events[forgot].subject;
    const failed = events.findIndex(
      (e, i) => i > forgot && e.type === EventType.NOT_FOUND && e.subject === subject,
    );
    expect(failed).toBeGreaterThan(forgot);
    const found = events.findIndex(
      (e, i) => i > failed && e.type === EventType.REDISCOVERED && e.subject === subject,
    );
    expect(found).toBeGreaterThan(failed);
    expect([events[found].x, events[found].y]).toEqual([events[forgot].x, events[forgot].y]);
    expect(sim.agents.aliveCount).toBe(1);
  });

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
