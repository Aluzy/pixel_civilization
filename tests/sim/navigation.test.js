import { describe, expect, it } from 'vitest';
import { Navigator } from '../../src/sim/agents/navigation.js';

// Biomes for these tests: 0 = land (speed 1), 1 = water (impassable), 2 = mud (speed 0.25).
const SPEED = Float64Array.from([1, 0, 0.25]);
const WATER = 1;

/**
 * Fake world from ASCII rows: "." land, "~" water, "m" mud, "b" berries (resource 1) on land.
 * Row 0 is y = 0; outside the drawing is land.
 * @param {string[]} rows
 * @returns {{ packedAt: (x: number, y: number) => number }}
 */
function worldFrom(rows) {
  return {
    packedAt(x, y) {
      const ch = rows[y]?.[x] ?? '.';
      if (ch === '~') return WATER;
      if (ch === 'm') return 2;
      if (ch === 'b') return 0 | (1 << 8) | (5 << 16);
      return 0;
    },
  };
}

/**
 * @param {Navigator} nav
 * @param {number} cell
 * @returns {string[]} Path as "x,y" strings.
 */
function pathTo(nav, cell) {
  const out = new Int32Array(4096);
  const n = nav.writePath(cell, out);
  const steps = [];
  for (let i = 0; i < n; i++) steps.push(`${out[i * 2]},${out[i * 2 + 1]}`);
  return steps;
}

describe('Navigator', () => {
  it('walks around water, never through it', () => {
    const world = worldFrom([
      '.....', //
      '.~~~.',
      '.~.~.',
      '.~~~.',
      '.....',
    ]);
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: WATER });
    nav.prepare(world, 0, 2, 4);
    const target = nav.cellAt(4, 2);
    expect(nav.reachable(target)).toBe(true);
    const steps = pathTo(nav, target);
    expect(steps.at(-1)).toBe('4,2');
    for (const s of steps) {
      const [x, y] = s.split(',').map(Number);
      expect(world.packedAt(x, y) & 0xff).not.toBe(WATER);
    }
    // The island in the middle is unreachable.
    expect(nav.reachable(nav.cellAt(2, 2))).toBe(false);
  });

  it('does not cut corners between two water tiles', () => {
    const world = worldFrom([
      '.~', //
      '~.',
    ]);
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: WATER });
    nav.prepare(world, 0, 0, 1);
    expect(nav.reachable(nav.cellAt(1, 1))).toBe(false);
  });

  it('prefers fast ground over a shorter path through mud', () => {
    const world = worldFrom([
      '.....', //
      'mmmmm',
      '.....',
    ]);
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: WATER });
    nav.prepare(world, 0, 1, 4);
    const steps = pathTo(nav, nav.cellAt(4, 1));
    const mudSteps = steps.filter((s) => s.endsWith(',1')).length;
    expect(mudSteps).toBeLessThan(3);
  });

  it('finds the nearest water side and the nearest resource', () => {
    const world = worldFrom([
      '......', //
      '......',
      '..b..~',
    ]);
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: WATER });
    nav.prepare(world, 0, 0, 5);
    const water = nav.nearestWaterSide();
    expect(nav.besideWater(water)).toBe(true);
    const wanted = Uint8Array.from([0, 1]);
    const food = nav.nearestResource(wanted);
    expect([nav.cellX(food), nav.cellY(food)]).toEqual([2, 2]);
  });

  it('heads toward a target beyond the window, or reports no progress', () => {
    const open = worldFrom([]);
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: WATER });
    nav.prepare(open, 0, 0, 3);
    const cell = nav.toward(100, 0);
    expect(nav.cellX(cell)).toBe(3);
    const walled = worldFrom(['.~', '.~', '.~', '.~']);
    nav.prepare(walled, 0, 1, 1);
    expect(nav.toward(50, 1)).toBe(-1);
  });
});
