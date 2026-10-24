import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/core/rng.js';

/**
 * @param {import('../../src/sim/core/rng.js').Rng} rng
 * @param {number} n
 * @returns {number[]}
 */
function draw(rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(rng.nextUint32());
  return out;
}

describe('rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(createRng(42), 100)).toEqual(draw(createRng(42), 100));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(createRng(42), 10)).not.toEqual(draw(createRng(43), 10));
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('returns integers within inclusive bounds and covers them', () => {
    const rng = createRng(11);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(-3, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it('forks independent, reproducible streams by label', () => {
    const a1 = createRng(5).fork('world');
    const a2 = createRng(5).fork('world');
    const b = createRng(5).fork('ai');
    expect(draw(a1, 20)).toEqual(draw(a2, 20));
    expect(draw(createRng(5).fork('world'), 20)).not.toEqual(draw(b, 20));
  });

  it('does not let a fork disturb the parent stream', () => {
    const plain = createRng(9);
    const forked = createRng(9);
    forked.fork('anything');
    expect(draw(plain, 20)).toEqual(draw(forked, 20));
  });

  it('can save and restore its state', () => {
    const rng = createRng(123);
    draw(rng, 5);
    const saved = rng.getState();
    const expected = draw(rng, 10);
    rng.setState(saved);
    expect(draw(rng, 10)).toEqual(expected);
  });

  it('accepts string seeds', () => {
    expect(draw(createRng('hello'), 5)).toEqual(draw(createRng('hello'), 5));
    expect(draw(createRng('hello'), 5)).not.toEqual(draw(createRng('world'), 5));
  });
});
