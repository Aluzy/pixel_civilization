import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Place } from '../../src/sim/agents/action-types.js';
import { AgentStore } from '../../src/sim/agents/agent-store.js';
import { Journal } from '../../src/sim/agents/journal.js';
import {
  forgetPlace,
  nearestPlace,
  placeAt,
  placeCount,
  rememberPlace,
} from '../../src/sim/agents/places.js';
import { nextPhaseStart } from '../../src/sim/core/clock.js';
import { createRng } from '../../src/sim/core/rng.js';

/** @returns {AgentStore} */
function store() {
  return new AgentStore({ max: 4, resourceCount: 3, journalSize: 5, placesPerKind: 2 });
}

/**
 * @param {AgentStore} agents
 * @param {number} x
 * @returns {number}
 */
function spawn(agents, x) {
  return agents.create({
    x,
    y: 0,
    tick: 0,
    attributes: balance.agent.start,
    needs: 30,
    rng: createRng(x),
  });
}

describe('AgentStore', () => {
  it('reuses the lowest free id after a death', () => {
    const agents = store();
    expect(spawn(agents, 0)).toBe(0);
    expect(spawn(agents, 1)).toBe(1);
    agents.kill(0);
    expect(agents.aliveCount).toBe(1);
    expect(spawn(agents, 2)).toBe(0);
    expect(agents.highWater).toBe(2);
  });

  it('starts agents with the configured attributes and needs', () => {
    const agents = store();
    const id = spawn(agents, 5);
    expect(agents.hp[id]).toBe(balance.agent.start.hp);
    expect(agents.perception[id]).toBe(balance.agent.start.perception);
    expect(agents.hunger[id]).toBe(30);
    expect(agents.carriedTotal(id)).toBe(0);
  });

  it('refuses more agents than its capacity', () => {
    const agents = store();
    for (let i = 0; i < 4; i++) spawn(agents, i);
    expect(() => spawn(agents, 9)).toThrow();
  });
});

describe('remembered places', () => {
  it('merges nearby sightings and replaces the oldest when full', () => {
    const agents = store();
    const id = spawn(agents, 0);
    rememberPlace(agents, id, Place.WATER, 10, 10, 1);
    rememberPlace(agents, id, Place.WATER, 12, 11, 2);
    expect(placeCount(agents, id, Place.WATER)).toBe(1);
    rememberPlace(agents, id, Place.WATER, 50, 50, 3);
    rememberPlace(agents, id, Place.WATER, -40, 0, 4);
    expect(placeCount(agents, id, Place.WATER)).toBe(2);
    const kept = [0, 1].map((s) => placeAt(agents, id, Place.WATER, s));
    expect(kept).toContainEqual({ x: 50, y: 50 });
    expect(kept).toContainEqual({ x: -40, y: 0 });
  });

  it('returns the nearest place and forgets on demand', () => {
    const agents = store();
    const id = spawn(agents, 0);
    rememberPlace(agents, id, Place.FOOD, 30, 0, 1);
    rememberPlace(agents, id, Place.FOOD, 5, 0, 2);
    const slot = nearestPlace(agents, id, Place.FOOD);
    expect(placeAt(agents, id, Place.FOOD, slot)).toEqual({ x: 5, y: 0 });
    forgetPlace(agents, id, Place.FOOD, slot);
    expect(placeCount(agents, id, Place.FOOD)).toBe(1);
    expect(nearestPlace(agents, id, Place.WATER)).toBe(-1);
  });
});

describe('Journal', () => {
  it('keeps the three best goals of each decision, newest entry first', () => {
    const journal = new Journal(3);
    journal.record(10, 1, Float64Array.from([0.1, 0.9, 0.5, 0.7]), 2, 3, 4, 1);
    journal.record(20, 0, Float64Array.from([0.8, 0.2, 0.1, 0.3]), 1, 0, 0, 0);
    const [last, first] = journal.latest(5);
    expect(last.tick).toBe(20);
    expect(first.top).toEqual([1, 3, 2]);
    expect(first.topScore[0]).toBeCloseTo(0.9, 9);
  });

  it('overwrites the oldest entries when full', () => {
    const journal = new Journal(2);
    for (let t = 1; t <= 5; t++) journal.record(t, 0, Float64Array.from([1]), 0, 0, 0, 0);
    expect(journal.latest(10).map((e) => e.tick)).toEqual([5, 4]);
  });
});

describe('clock helpers', () => {
  it('finds the next start of a phase', () => {
    const time = balance.time;
    const dawnOffset = time.ticksPerDay * 0.9;
    expect(nextPhaseStart(0, time, 'dawn')).toBe(dawnOffset);
    expect(nextPhaseStart(dawnOffset, time, 'dawn')).toBe(time.ticksPerDay + dawnOffset);
    expect(nextPhaseStart(5, time, 'day')).toBe(time.ticksPerDay);
  });
});
