import { CHUNK_KEEP_MARGIN } from '../sim/protocol.js';
import { CHUNK_SIZE, chunkKey, chunksInRect, toChunk, toLocal } from '../sim/world/coords.js';
import { paintChunk } from './palette.js';

/**
 * @typedef {object} ChunkMessage
 * @property {number} cx
 * @property {number} cy
 * @property {Uint8Array} biome
 * @property {Uint8Array} resource
 * @property {Uint8Array} quantity
 * @property {Uint8Array} altitude
 */

/**
 * @typedef {object} Slot
 * @property {string} textureKey
 * @property {any} texture - Phaser CanvasTexture.
 * @property {any} image - Phaser Image showing the texture.
 * @property {ChunkMessage | null} data
 */

/**
 * Draws received chunks as one 64 × 64 texture each, reusing textures through a pool.
 * Holds a read-only copy of tile data for inspection.
 */
export class ChunkLayer {
  /**
   * @param {any} scene - Phaser scene.
   * @param {import('./palette.js').Palette} palette
   * @param {number} depth
   */
  constructor(scene, palette, depth) {
    this.scene = scene;
    this.palette = palette;
    this.depth = depth;
    /** @type {Map<string, Slot>} */
    this.slots = new Map();
    /** @type {Slot[]} */
    this.free = [];
    this.created = 0;
    this.rgba = new Uint8ClampedArray(CHUNK_SIZE * CHUNK_SIZE * 4);
  }

  /** @returns {number} Chunks currently shown. */
  get count() {
    return this.slots.size;
  }

  /** @returns {Slot} */
  takeSlot() {
    const slot = this.free.pop();
    if (slot) return slot;
    const textureKey = `chunk-${this.created++}`;
    const texture = this.scene.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE);
    const image = this.scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDepth(this.depth);
    return { textureKey, texture, image, data: null };
  }

  /**
   * @param {ChunkMessage} message
   * @returns {void}
   */
  add(message) {
    const key = chunkKey(message.cx, message.cy);
    const slot = this.slots.get(key) ?? this.takeSlot();
    slot.data = message;
    paintChunk(this.rgba, message, this.palette);
    const image = new ImageData(this.rgba, CHUNK_SIZE, CHUNK_SIZE);
    slot.texture.context.putImageData(image, 0, 0);
    slot.texture.refresh();
    slot.image.setPosition(message.cx * CHUNK_SIZE, message.cy * CHUNK_SIZE).setVisible(true);
    this.slots.set(key, slot);
  }

  /**
   * Releases chunks outside the view + keep margin; the worker forgets them the same way.
   * @param {{ x0: number, y0: number, x1: number, y1: number }} rect
   * @returns {void}
   */
  keepOnly(rect) {
    const keep = new Set(chunksInRect(rect, CHUNK_KEEP_MARGIN).map((c) => chunkKey(c.cx, c.cy)));
    for (const [key, slot] of this.slots) {
      if (keep.has(key)) continue;
      slot.image.setVisible(false);
      slot.data = null;
      this.slots.delete(key);
      this.free.push(slot);
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {import('../sim/world/chunk-store.js').TileInfo | null} Null if not loaded yet.
   */
  tileAt(x, y) {
    const data = this.slots.get(chunkKey(toChunk(x), toChunk(y)))?.data;
    if (!data) return null;
    const i = toLocal(y) * CHUNK_SIZE + toLocal(x);
    return {
      x,
      y,
      biome: data.biome[i],
      resource: data.resource[i],
      quantity: data.quantity[i],
      altitude: data.altitude[i],
    };
  }
}
