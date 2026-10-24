import { describe, expect, it } from 'vitest';
import { ExplorationMap } from '../../src/sim/agents/exploration-map.js';
import { Memory, Remembered, WATER_SUBJECT } from '../../src/sim/agents/memory.js';
import { expNeg } from '../../src/sim/core/math.js';
import { createRng } from '../../src/sim/core/rng.js';

const TAU = 1000;
const RADIUS = 4;
const BERRIES = 1;

describe('expNeg', () => {
  it('matches e^(-x) closely over the useful range', () => {
    for (const x of [0, 1e-6, 0.1, 0.5, 1, 2.3, 7, 20, 60, 300]) {
      const expected = Math.exp(-x);
      expect(Math.abs(expNeg(x) - expected)).toBeLessThanOrEqual(expected * 1e-12 + 1e-300);
    }
  });

  it('handles the edges', () => {
    expect(expNeg(0)).toBe(1);
    expect(expNeg(-3)).toBe(1);
    expect(expNeg(1e6)).toBe(0);
  });
});

describe('Memory', () => {
  it('fades with time and remembers the same place only once', () => {
    const m = new Memory(4);
    expect(m.remember(WATER_SUBJECT, 10, 10, 0, 0, 1, TAU, RADIUS)).toBe(Remembered.ADDED);
    expect(m.strength(0, TAU)).toBeCloseTo(Math.exp(-1), 12);
    expect(m.remember(WATER_SUBJECT, 12, 9, 0, TAU, 1, TAU, RADIUS)).toBe(Remembered.REFRESHED);
    expect(m.count).toBe(1);
    expect(m.strength(0, TAU)).toBe(1);
    expect([m.x[0], m.y[0]]).toEqual([10, 10]);
  });

  it('never ends up with two memories of the same place', () => {
    const m = new Memory(8);
    m.remember(BERRIES, 13, -20, 5, 0, 1, TAU, RADIUS);
    m.remember(BERRIES, 17, -24, 5, 0, 1, TAU, RADIUS);
    m.remember(BERRIES, 12, -22, 5, 10, 1, TAU, RADIUS);
    m.remember(BERRIES, 16, -25, 5, 20, 1, TAU, RADIUS);
    for (let i = 0; i < m.count; i++) {
      for (let j = i + 1; j < m.count; j++) {
        const near = Math.abs(m.x[i] - m.x[j]) <= RADIUS && Math.abs(m.y[i] - m.y[j]) <= RADIUS;
        expect(near).toBe(false);
      }
    }
  });

  it('keeps a place used often for longer (consolidation)', () => {
    const m = new Memory(4);
    m.remember(BERRIES, 0, 0, 5, 0, 1, TAU, RADIUS);
    m.remember(BERRIES, 50, 0, 5, 0, 1, TAU, RADIUS);
    m.reinforce(0, 0, 1.5, 100 * TAU);
    expect(m.strength(0, 2 * TAU)).toBeGreaterThan(m.strength(1, 2 * TAU));
  });

  it('pushes out the weakest place when full, but not for something weaker', () => {
    const m = new Memory(2);
    m.remember(BERRIES, 0, 0, 5, 0, 1, TAU, RADIUS);
    m.remember(BERRIES, 50, 0, 5, 500, 1, TAU, RADIUS);
    expect(m.remember(WATER_SUBJECT, 90, 0, 0, 1000, 1, TAU, RADIUS)).toBe(Remembered.REPLACED);
    expect(m.find(BERRIES, 0, 0, RADIUS)).toBe(-1);
    expect(m.find(BERRIES, 50, 0, RADIUS)).toBeGreaterThanOrEqual(0);
    expect(m.remember(BERRIES, -70, 0, 5, 1000, 0.1, TAU, RADIUS)).toBe(Remembered.IGNORED);
  });

  it('remembers what it lost, to notice a rediscovery', () => {
    const m = new Memory(3);
    m.remember(WATER_SUBJECT, 30, 30, 0, 0, 1, TAU, RADIUS);
    m.forget(0, 5000);
    expect(m.count).toBe(0);
    expect(m.takeLost(WATER_SUBJECT, 31, 29, RADIUS)).toBeGreaterThanOrEqual(0);
    expect(m.takeLost(WATER_SUBJECT, 31, 29, RADIUS)).toBe(-1);
  });

  it('finds the nearest place among wanted subjects', () => {
    const m = new Memory(4);
    m.remember(BERRIES, 40, 0, 5, 0, 1, TAU, RADIUS);
    m.remember(WATER_SUBJECT, 5, 0, 0, 0, 1, TAU, RADIUS);
    m.remember(BERRIES, 10, 0, 5, 0, 1, TAU, RADIUS);
    const food = Uint8Array.from([0, 1]);
    expect(m.x[m.nearest(food, 0, 0)]).toBe(10);
    m.remove(m.nearest(food, 0, 0));
    expect(m.x[m.nearest(food, 0, 0)]).toBe(40);
  });
});

describe('ExplorationMap', () => {
  it('records when cells were seen and how unknown they are', () => {
    const map = new ExplorationMap(64, 8);
    expect(map.lastSeen(0, 0)).toBe(-1);
    map.markArea(-8, -8, 15, 15, 100);
    expect(map.lastSeen(0, 0)).toBe(100);
    expect(map.lastSeen(-1, -1)).toBe(100);
    expect(map.unknownness(0, 0, 100, 1000)).toBe(0);
    expect(map.unknownness(0, 0, 600, 1000)).toBeCloseTo(0.5, 9);
    expect(map.unknownness(5, 5, 600, 1000)).toBe(1);
  });

  it('overwrites the oldest cells when full', () => {
    const map = new ExplorationMap(16, 8);
    for (let i = 0; i < 40; i++) map.mark(i, 0, i);
    expect(map.lastSeen(39, 0)).toBe(39);
    expect(map.lastSeen(0, 0)).toBe(-1);
  });

  it('heads for the least known direction', () => {
    const map = new ExplorationMap(1024, 8);
    // Everything known except the east.
    for (let cy = -20; cy <= 20; cy++) {
      for (let cx = -20; cx <= 3; cx++) map.mark(cx, cy, 1000);
    }
    const out = new Int32Array(2);
    const value = map.frontier(0, 0, 40, 1000, 3600, createRng(1), out);
    expect(out[0]).toBeGreaterThan(30);
    expect(value).toBeGreaterThan(0.6);
  });
});
