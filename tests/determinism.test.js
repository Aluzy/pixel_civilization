import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation.js';
import balance from '../data/balance.json' with { type: 'json' };

const TICKS = 5000;

describe('determinism', () => {
  it('gives the same state hash for the same seed', () => {
    const a = new Simulation({ seed: 42, balance });
    const b = new Simulation({ seed: 42, balance });
    a.step(TICKS);
    b.step(TICKS);
    expect(a.tick).toBe(TICKS);
    expect(a.hash()).toBe(b.hash());
  });

  it('does not depend on how ticks are batched', () => {
    const once = new Simulation({ seed: 7, balance });
    const batched = new Simulation({ seed: 7, balance });
    once.step(TICKS);
    for (let i = 0; i < TICKS / 10; i++) batched.step(10);
    expect(batched.hash()).toBe(once.hash());
  });

  it('gives different hashes for different seeds', () => {
    const a = new Simulation({ seed: 1, balance });
    const b = new Simulation({ seed: 2, balance });
    a.step(100);
    b.step(100);
    expect(a.hash()).not.toBe(b.hash());
  });
});
