import { Chunk } from './chunk.js';
import { CHUNK_SIZE, toChunk, toLocal } from './coords.js';

// Numeric chunk ids avoid building strings in hot loops. Valid for |cx|, |cy| < 2^20 chunks.
const ID_OFFSET = 1 << 20;
const ID_SPAN = 1 << 21;

/**
 * @param {number} cx
 * @param {number} cy
 * @returns {number}
 */
export function chunkId(cx, cy) {
  return (cy + ID_OFFSET) * ID_SPAN + (cx + ID_OFFSET);
}

/** Packed tile layout returned by {@link ChunkStore#packedAt}. */
export const PACK = Object.freeze({
  RESOURCE_SHIFT: 8,
  QUANTITY_SHIFT: 16,
  STRUCTURE_SHIFT: 24,
  MASK: 0xff,
});

/**
 * @typedef {object} TileInfo
 * @property {number} x
 * @property {number} y
 * @property {number} biome - Biome index.
 * @property {number} resource - Resource id, 0 = none.
 * @property {number} quantity
 * @property {number} structure - Structure code, 0 = none.
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
    /** @type {Map<number, Chunk>} */
    this.chunks = new Map();
    /** @type {Set<number>} Ids of chunks changed since the last {@link ChunkStore#takeDirty}. */
    this.dirty = new Set();
    /** @type {Chunk | null} Last chunk accessed, to skip the map lookup on runs of tiles. */
    this.last = null;
    /** Tile index in {@link ChunkStore#last} of the last {@link ChunkStore#packedAt}. */
    this.lastIndex = 0;
    /** Set by {@link ChunkStore#takeUnit}: true if the last take emptied its tile. */
    this.lastTakeDepleted = false;
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
    return this.chunks.has(chunkId(cx, cy));
  }

  /**
   * Returns the chunk, generating it if needed.
   * @param {number} cx
   * @param {number} cy
   * @returns {Chunk}
   */
  get(cx, cy) {
    const last = this.last;
    if (last !== null && last.cx === cx && last.cy === cy) return last;
    const id = chunkId(cx, cy);
    let chunk = this.chunks.get(id);
    if (!chunk) {
      chunk = this.generator.generateChunk(cx, cy);
      this.chunks.set(id, chunk);
    }
    this.last = chunk;
    return chunk;
  }

  /**
   * Allocation-free tile read: biome | resource << 8 | quantity << 16 | structure << 24 (see
   * {@link PACK}). Read the structure with `>>>` since the result may be negative.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  packedAt(x, y) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunk = this.get(cx, cy);
    const i = (y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE);
    this.lastIndex = i;
    return (
      chunk.biome[i] |
      (chunk.resource[i] << 8) |
      (chunk.quantity[i] << 16) |
      (chunk.structure[i] << 24)
    );
  }

  /**
   * Agent standing on the tile of the last {@link ChunkStore#packedAt}, or -1 (no lookup).
   * @returns {number}
   */
  lastOccupant() {
    return this.last.occupant[this.lastIndex] - 1;
  }

  /**
   * Footsteps worn on the tile of the last {@link ChunkStore#packedAt} (no lookup).
   * @returns {number}
   */
  lastWear() {
    return this.last.wear[this.lastIndex];
  }

  /**
   * One more footstep on (x, y), up to `steps`: at `steps` the tile is a trail for good (and sent
   * again to the renderer).
   * @param {number} x
   * @param {number} y
   * @param {number} steps
   * @returns {void}
   */
  tread(x, y, steps) {
    const chunk = this.get(toChunk(x), toChunk(y));
    const i = Chunk.index(toLocal(x), toLocal(y));
    if (chunk.wear[i] >= steps) return;
    chunk.wear[i]++;
    chunk.modified = true;
    if (chunk.wear[i] === steps) this.markChanged(chunk);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} Agent standing on (x, y), or -1.
   */
  occupantAt(x, y) {
    const chunk = this.get(toChunk(x), toChunk(y));
    return chunk.occupant[Chunk.index(toLocal(x), toLocal(y))] - 1;
  }

  /**
   * Marks (x, y) as held by agent `id`, or frees it if it held `id` (id given as `-1 - id`).
   * @param {number} x
   * @param {number} y
   * @param {number} id - Agent id, or `-1 - id` to leave the tile.
   * @returns {void}
   */
  setOccupant(x, y, id) {
    const chunk = this.get(toChunk(x), toChunk(y));
    const i = Chunk.index(toLocal(x), toLocal(y));
    if (id >= 0) chunk.occupant[i] = id + 1;
    else if (chunk.occupant[i] === -id) chunk.occupant[i] = 0;
  }

  /**
   * Removes one unit of resource from a tile and clears the tile when it reaches zero.
   * Allocation-free: whether the tile was emptied is left in {@link ChunkStore#lastTakeDepleted}.
   * @param {number} x
   * @param {number} y
   * @returns {number} Resource id taken, 0 if there was none.
   */
  takeUnit(x, y) {
    const chunk = this.get(toChunk(x), toChunk(y));
    const i = Chunk.index(toLocal(x), toLocal(y));
    const resource = chunk.resource[i];
    this.lastTakeDepleted = false;
    if (resource === 0 || chunk.quantity[i] === 0) return 0;
    chunk.quantity[i] -= 1;
    if (chunk.quantity[i] === 0) {
      chunk.resource[i] = 0;
      this.lastTakeDepleted = true;
    }
    this.markChanged(chunk);
    return resource;
  }

  /**
   * Puts a resource back on a tile (regrowth).
   * @param {number} x
   * @param {number} y
   * @param {number} resource
   * @param {number} quantity
   * @returns {void}
   */
  setResource(x, y, resource, quantity) {
    const chunk = this.get(toChunk(x), toChunk(y));
    const i = Chunk.index(toLocal(x), toLocal(y));
    chunk.resource[i] = resource;
    chunk.quantity[i] = quantity;
    this.markChanged(chunk);
  }

  /**
   * Places a structure on a tile (built by an agent).
   * @param {number} x
   * @param {number} y
   * @param {number} code - Structure code, 0 to remove.
   * @returns {void}
   */
  setStructure(x, y, code) {
    const chunk = this.get(toChunk(x), toChunk(y));
    chunk.structure[Chunk.index(toLocal(x), toLocal(y))] = code;
    this.markChanged(chunk);
  }

  /**
   * @param {Chunk} chunk
   * @returns {void}
   */
  markChanged(chunk) {
    chunk.modified = true;
    this.dirty.add(chunkId(chunk.cx, chunk.cy));
  }

  /**
   * Chunks changed since the last call, so the host can send them to the renderer again.
   * @returns {Chunk[]}
   */
  takeDirty() {
    const out = [];
    for (const id of this.dirty) out.push(this.chunks.get(id));
    this.dirty.clear();
    return out;
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
      structure: chunk.structure[i],
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
