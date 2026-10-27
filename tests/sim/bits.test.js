import { describe, expect, it } from 'vitest';
import {
  and,
  andNot,
  bit,
  has,
  lowest,
  MAX_BITS,
  or,
  popcount,
  withBit,
  withoutBit,
} from '../../src/sim/core/bits.js';
import { CATALOG } from '../../src/sim/simulation.js';

// 53-bit sets (decision 0029): recipes past 32 no longer fold onto the first ones.

describe('53-bit sets', () => {
  it('keeps elements past 32 apart from the first ones', () => {
    let m = 0;
    for (const k of [0, 1, 31, 32, 33, 52]) m = withBit(m, k);
    expect(has(m, 32)).toBe(true);
    expect(has(m, 2)).toBe(false);
    expect(popcount(m)).toBe(6);
    expect(lowest(m)).toBe(0);
    expect(lowest(withoutBit(withoutBit(withoutBit(m, 0), 1), 31))).toBe(32);
    expect(lowest(0)).toBe(-1);
  });

  it('works word by word', () => {
    const a = or(bit(3), bit(40));
    const b = or(bit(40), bit(50));
    expect(and(a, b)).toBe(bit(40));
    expect(andNot(a, b)).toBe(bit(3));
    expect(or(a, b)).toBe(bit(3) + bit(40) + bit(50));
    expect(withBit(a, 40)).toBe(a);
  });

  it('holds every recipe of the catalog', () => {
    expect(CATALOG.recipes.length).toBeLessThanOrEqual(MAX_BITS);
    expect(CATALOG.recipes.length).toBeGreaterThan(32);
  });
});
