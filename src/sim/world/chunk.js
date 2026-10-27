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
    /** Structure code per tile (station, shelter), 0 = none. Built by agents only. */
    this.structure = new Uint8Array(CHUNK_AREA);
    /** Altitude quantised to [0, 255]. */
    this.altitude = new Uint8Array(CHUNK_AREA);
    /**
     * Footsteps on each tile, up to the count that makes it a trail (faster to walk): the way the
     * individuals go most wears a lasting path (balance.trails).
     */
    this.wear = new Uint8Array(CHUNK_AREA);
    /**
     * Agent standing on each tile, plus one (0 = none): two agents never share a tile. Derived
     * from the agents' positions, so neither hashed nor saved.
     */
    this.occupant = new Uint16Array(CHUNK_AREA);
    /** True once the simulation has changed a tile, so the chunk belongs to the saved state. */
    this.modified = false;
    /** The store's count of changes at the last structure or ground changed here (0 never). */
    this.built = 0;
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
