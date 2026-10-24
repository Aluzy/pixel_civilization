import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/core/rng.js';
import { SimplexNoise2D, fbm } from '../../src/sim/world/noise.js';

/**
 * @param {SimplexNoise2D} noise
 * @returns {number[]}
 */
function samples(noise) {
  const out = [];
  for (let i = 0; i < 50; i++) out.push(noise.noise(i * 0.37 - 9, i * 0.71 + 4));
  return out;
}

describe('SimplexNoise2D', () => {
  it('is reproducible for the same rng seed', () => {
    expect(samples(new SimplexNoise2D(createRng(1)))).toEqual(
      samples(new SimplexNoise2D(createRng(1))),
    );
  });

  it('differs between seeds', () => {
    expect(samples(new SimplexNoise2D(createRng(1)))).not.toEqual(
      samples(new SimplexNoise2D(createRng(2))),
    );
  });

  it('stays within [-1, 1] and uses most of that range', () => {
    const noise = new SimplexNoise2D(createRng(3));
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const v = noise.noise(x * 0.13, y * 0.13);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeLessThan(-0.6);
    expect(max).toBeGreaterThan(0.6);
  });

  it('is continuous', () => {
    const noise = new SimplexNoise2D(createRng(4));
    for (let i = 0; i < 200; i++) {
      const x = i * 1.7 - 150;
      const y = i * -0.9 + 33;
      expect(Math.abs(noise.noise(x, y) - noise.noise(x + 0.001, y))).toBeLessThan(0.02);
    }
  });

  it('works with negative coordinates', () => {
    const noise = new SimplexNoise2D(createRng(5));
    const v = noise.noise(-1234.5, -987.25);
    expect(Number.isFinite(v)).toBe(true);
  });
});

describe('fbm', () => {
  it('returns values in [0, 1]', () => {
    const noise = new SimplexNoise2D(createRng(6));
    const params = { scale: 0.01, octaves: 4, lacunarity: 2, gain: 0.5 };
    for (let i = 0; i < 2000; i++) {
      const v = fbm(noise, i * 3.1, i * -2.3, params);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
