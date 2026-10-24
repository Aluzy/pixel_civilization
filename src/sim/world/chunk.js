import { CHUNK_SIZE } from './coords.js';

/** Number of tiles in a chunk. */
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;

/**
 * A square block of tiles, stored as parallel typed arrays indexed by `ly * CHUNK_SIZE + lx`.
 */
export class Chunk {
  /**
   * @param {number} cx
   * @param {number} cy
   */
  constructor(cx, cy) {
    /** @type {number} */
    this.cx = cx;
    /** @type {number} */
    this.cy = cy;
    /** Biome index per tile. */
    this.biome = new Uint8Array(CHUNK_AREA);
    /** Resource id per tile, 0 = none. */
    this.resource = new Uint8Array(CHUNK_AREA);
    /** Units of resource left per tile. */
    this.quantity = new Uint8Array(CHUNK_AREA);
    /** Altitude quantised to [0, 255]. */
    this.altitude = new Uint8Array(CHUNK_AREA);
    /** True once the simulation has changed a tile, so the chunk belongs to the saved state. */
    this.modified = false;
  }

  /**
   * @param {number} lx
   * @param {number} ly
   * @returns {number}
   */
  static index(lx, ly) {
    return ly * CHUNK_SIZE + lx;
  }
}
