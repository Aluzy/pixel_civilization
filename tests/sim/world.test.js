import { describe, expect, it } from 'vitest';
import { createHasher } from '../../src/sim/core/hash.js';
import { createRng } from '../../src/sim/core/rng.js';
import { WORLD_TABLES } from '../../src/sim/simulation.js';
import { ChunkStore, findSpawn } from '../../src/sim/world/chunk-store.js';
import { CHUNK_SIZE, chunksInRect, toChunk, toLocal } from '../../src/sim/world/coords.js';
import { WorldGenerator } from '../../src/sim/world/generator.js';

/**
 * @param {number} seed
 * @returns {WorldGenerator}
 */
function generator(seed) {
  return new WorldGenerator(createRng(seed).fork('world').fork('generator'), WORLD_TABLES);
}

/**
 * @param {import('../../src/sim/world/chunk.js').Chunk} chunk
 * @returns {string}
 */
function chunkHash(chunk) {
  return createHasher()
    .typedArray(chunk.biome)
    .typedArray(chunk.resource)
    .typedArray(chunk.quantity)
    .typedArray(chunk.altitude)
    .hex();
}

const biomeId = (name) => WORLD_TABLES.biomes.findIndex((b) => b.id === name);
const resourceId = (name) => WORLD_TABLES.resources.findIndex((r) => r.id === name) + 1;

// A 512 × 512 sample (64 chunks) shared by the statistical tests.
const SAMPLE = (() => {
  const store = new ChunkStore(generator(2026));
  const biomeCount = new Array(WORLD_TABLES.biomes.length).fill(0);
  const resourceCount = new Array(WORLD_TABLES.resources.length + 1).fill(0);
  /** @type {Map<number, Set<number>>} resource id → biomes it appeared in */
  const resourceBiomes = new Map();
  let minIronAltitude = 255;
  let quantityOutOfRange = 0;
  for (let cy = -4; cy < 4; cy++) {
    for (let cx = -4; cx < 4; cx++) {
      const c = store.get(cx, cy);
      for (let i = 0; i < c.biome.length; i++) {
        biomeCount[c.biome[i]]++;
        const r = c.resource[i];
        resourceCount[r]++;
        if (r === 0) continue;
        if (!resourceBiomes.has(r)) resourceBiomes.set(r, new Set());
        resourceBiomes.get(r).add(c.biome[i]);
        const [qMin, qMax] = WORLD_TABLES.resources[r - 1].quantity;
        if (c.quantity[i] < qMin || c.quantity[i] > qMax) quantityOutOfRange++;
        if (r === resourceId('iron')) minIronAltitude = Math.min(minIronAltitude, c.altitude[i]);
      }
    }
  }
  const total = 512 * 512;
  return { biomeCount, resourceCount, resourceBiomes, minIronAltitude, quantityOutOfRange, total };
})();

describe('coords', () => {
  it('maps negative tiles to the right chunk and local position', () => {
    expect(toChunk(0)).toBe(0);
    expect(toChunk(CHUNK_SIZE - 1)).toBe(0);
    expect(toChunk(-1)).toBe(-1);
    expect(toLocal(-1)).toBe(CHUNK_SIZE - 1);
    expect(toChunk(-CHUNK_SIZE)).toBe(-1);
    expect(toLocal(-CHUNK_SIZE)).toBe(0);
  });

  it('lists the chunks of a rectangle with a margin, nearest to its centre first', () => {
    const list = chunksInRect({ x0: 0, y0: 0, x1: CHUNK_SIZE * 2 - 1, y1: CHUNK_SIZE - 1 }, 1);
    expect(list).toHaveLength(4 * 3);
    expect(new Set(list.map((c) => `${c.cx},${c.cy}`)).size).toBe(12);
    const first = list[0];
    expect(first.cy).toBe(0);
    expect([0, 1]).toContain(first.cx);
  });
});

describe('world generation', () => {
  it('gives the same chunk for the same seed', () => {
    expect(chunkHash(generator(1).generateChunk(5, -3))).toBe(
      chunkHash(generator(1).generateChunk(5, -3)),
    );
  });

  it('gives different chunks for different seeds', () => {
    expect(chunkHash(generator(1).generateChunk(0, 0))).not.toBe(
      chunkHash(generator(2).generateChunk(0, 0)),
    );
  });

  it('does not depend on generation order', () => {
    const a = generator(9);
    const b = generator(9);
    const a1 = a.generateChunk(2, 2);
    const a2 = a.generateChunk(-7, 1);
    const b2 = b.generateChunk(-7, 1);
    const b1 = b.generateChunk(2, 2);
    expect(chunkHash(a1)).toBe(chunkHash(b1));
    expect(chunkHash(a2)).toBe(chunkHash(b2));
  });

  it('is continuous across chunk borders', () => {
    // A seam would show as a jump across the border larger than any step inside a chunk.
    const g = generator(4);
    const left = g.generateChunk(-1, 0);
    const right = g.generateChunk(0, 0);
    let borderStep = 0;
    let innerStep = 0;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      const row = ly * CHUNK_SIZE;
      borderStep = Math.max(
        borderStep,
        Math.abs(left.altitude[row + CHUNK_SIZE - 1] - right.altitude[row]),
      );
      for (let lx = 0; lx < CHUNK_SIZE - 1; lx++) {
        const step = Math.abs(right.altitude[row + lx + 1] - right.altitude[row + lx]);
        innerStep = Math.max(innerStep, step);
      }
    }
    expect(borderStep).toBeLessThanOrEqual(innerStep + 2);
  });

  it('produces every biome in sensible proportions', () => {
    const share = (name) => SAMPLE.biomeCount[biomeId(name)] / SAMPLE.total;
    expect(share('water')).toBeGreaterThan(0.08);
    expect(share('water')).toBeLessThan(0.45);
    expect(share('plain') + share('forest')).toBeGreaterThan(0.3);
    expect(share('mountain')).toBeGreaterThan(0.02);
    for (const b of WORLD_TABLES.biomes) {
      expect(SAMPLE.biomeCount[biomeId(b.id)], `biome ${b.id}`).toBeGreaterThan(0);
    }
  });

  it('places every resource, only in the biomes allowed by data/resources.json', () => {
    const allowed = new Map();
    for (const [b, rules] of WORLD_TABLES.placementsByBiome.entries()) {
      for (const rule of rules) {
        if (!allowed.has(rule.resource)) allowed.set(rule.resource, new Set());
        allowed.get(rule.resource).add(b);
      }
    }
    for (let r = 1; r <= WORLD_TABLES.resources.length; r++) {
      const name = WORLD_TABLES.resources[r - 1].id;
      expect(SAMPLE.resourceCount[r], `resource ${name}`).toBeGreaterThan(0);
      for (const b of SAMPLE.resourceBiomes.get(r)) {
        expect(allowed.get(r).has(b), `${name} in ${WORLD_TABLES.biomes[b].id}`).toBe(true);
      }
    }
    expect(SAMPLE.resourceCount[0] / SAMPLE.total).toBeGreaterThan(0.6);
  });

  it('respects quantity ranges and minimum altitudes', () => {
    expect(SAMPLE.quantityOutOfRange).toBe(0);
    const ironRule = WORLD_TABLES.placementsByBiome
      .flat()
      .find((p) => p.resource === resourceId('iron'));
    expect(SAMPLE.minIronAltitude).toBeGreaterThanOrEqual(Math.floor(ironRule.minAltitude * 255));
  });

  it('groups resources in clusters rather than scattering them', () => {
    // Compare how often a resource tile's right neighbour holds the same resource with what
    // uniform scattering of the same tiles would give (the resource's share of all tiles).
    const store = new ChunkStore(generator(77));
    const counts = new Map();
    let tiles = 0;
    let pairs = 0;
    let same = 0;
    for (let cy = -2; cy < 2; cy++) {
      for (let cx = -2; cx < 2; cx++) {
        const c = store.get(cx, cy);
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE - 1; lx++) {
            tiles++;
            const r = c.resource[ly * CHUNK_SIZE + lx];
            if (r === 0) continue;
            counts.set(r, (counts.get(r) ?? 0) + 1);
            pairs++;
            if (c.resource[ly * CHUNK_SIZE + lx + 1] === r) same++;
          }
        }
      }
    }
    let uniform = 0;
    for (const n of counts.values()) uniform += (n / pairs) * (n / tiles);
    expect(pairs).toBeGreaterThan(500);
    expect(same / pairs).toBeGreaterThan(uniform * 1.5);
  });
});

describe('ChunkStore', () => {
  it('generates on demand and caches', () => {
    const store = new ChunkStore(generator(3));
    expect(store.size).toBe(0);
    const c = store.get(1, 1);
    expect(store.get(1, 1)).toBe(c);
    expect(store.size).toBe(1);
  });

  it('reads tiles at negative coordinates from the right chunk', () => {
    const store = new ChunkStore(generator(3));
    const tile = store.tileAt(-1, -1);
    const c = store.get(-1, -1);
    expect(tile.biome).toBe(c.biome[c.biome.length - 1]);
  });

  it('finds a spawn tile on plain or forest without a resource', () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
      const store = new ChunkStore(generator(seed));
      const spawn = findSpawn(store, WORLD_TABLES);
      const tile = store.tileAt(spawn.x, spawn.y);
      expect(WORLD_TABLES.spawnBiomes).toContain(tile.biome);
      expect(tile.resource).toBe(0);
    }
  });
});
