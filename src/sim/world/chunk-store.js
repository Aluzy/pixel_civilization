import { Chunk } from './chunk.js';
import { chunkKey, toChunk, toLocal } from './coords.js';

/**
 * @typedef {object} TileInfo
 * @property {number} x
 * @property {number} y
 * @property {number} biome - Biome index.
 * @property {number} resource - Resource id, 0 = none.
 * @property {number} quantity
 * @property {number} altitude - In [0, 255].
 */

/**
 * Chunks generated on demand and kept in memory.
 * Generation is a pure function of the seed, so the cache never changes the simulation's result.
 */
export class ChunkStore {
  /**
   * @param {import('./generator.js').WorldGenerator} generator
   */
  constructor(generator) {
    this.generator = generator;
    /** @type {Map<string, Chunk>} */
    this.chunks = new Map();
  }

  /** @returns {number} Number of chunks in memory. */
  get size() {
    return this.chunks.size;
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @returns {boolean}
   */
  has(cx, cy) {
    return this.chunks.has(chunkKey(cx, cy));
  }

  /**
   * Returns the chunk, generating it if needed.
   * @param {number} cx
   * @param {number} cy
   * @returns {Chunk}
   */
  get(cx, cy) {
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generator.generateChunk(cx, cy);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {TileInfo}
   */
  tileAt(x, y) {
    const chunk = this.get(toChunk(x), toChunk(y));
    const i = Chunk.index(toLocal(x), toLocal(y));
    return {
      x,
      y,
      biome: chunk.biome[i],
      resource: chunk.resource[i],
      quantity: chunk.quantity[i],
      altitude: chunk.altitude[i],
    };
  }

  /**
   * Chunks changed by the simulation, in a stable order (for hashing and saving).
   * @returns {Chunk[]}
   */
  modifiedChunks() {
    return [...this.chunks.values()]
      .filter((c) => c.modified)
      .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  }
}

/**
 * Finds the nearest suitable empty tile to the origin, ring by ring, for the first individual.
 * @param {ChunkStore} store
 * @param {import('./world-data.js').WorldTables} tables
 * @returns {{ x: number, y: number }}
 */
export function findSpawn(store, tables) {
  const allowed = new Set(tables.spawnBiomes);
  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  const fits = (x, y) => {
    const tile = store.tileAt(x, y);
    return allowed.has(tile.biome) && tile.resource === 0;
  };
  if (fits(0, 0)) return { x: 0, y: 0 };
  for (let r = 1; r <= tables.spawnMaxRadius; r++) {
    // Walk the square ring of radius r only: top and bottom rows, then the side columns.
    for (let dx = -r; dx <= r; dx++) {
      if (fits(dx, -r)) return { x: dx, y: -r };
      if (fits(dx, r)) return { x: dx, y: r };
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      if (fits(-r, dy)) return { x: -r, y: dy };
      if (fits(r, dy)) return { x: r, y: dy };
    }
  }
  return { x: 0, y: 0 };
}
