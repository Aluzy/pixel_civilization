import { chunkKey, chunksInRect } from '../sim/world/coords.js';

/**
 * Decides which chunks to send to the renderer, nearest to the view first, and remembers what the
 * renderer already has. The renderer keeps exactly the chunks within `keepMargin` of its view,
 * computed with the same {@link chunksInRect}, so both sides agree without extra messages.
 */
export class ChunkStreamer {
  /**
   * @param {import('../sim/world/chunk-store.js').ChunkStore} store
   * @param {{ sendMargin: number, keepMargin: number }} margins - In chunks, keep ≥ send.
   */
  constructor(store, { sendMargin, keepMargin }) {
    this.store = store;
    this.sendMargin = sendMargin;
    this.keepMargin = Math.max(keepMargin, sendMargin);
    /** @type {Set<string>} Chunks the renderer holds. */
    this.sent = new Set();
    /** @type {{ cx: number, cy: number }[]} Chunks still to send, in order. */
    this.queue = [];
    /** @type {Set<string>} Chunks the renderer holds in an outdated version. */
    this.stale = new Set();
  }

  /**
   * @param {{ x0: number, y0: number, x1: number, y1: number }} rect - Visible tiles, inclusive.
   * @returns {void}
   */
  setViewport(rect) {
    const keep = new Set(chunksInRect(rect, this.keepMargin).map((c) => chunkKey(c.cx, c.cy)));
    for (const key of this.sent) {
      if (keep.has(key)) continue;
      this.sent.delete(key);
      this.stale.delete(key);
    }
    this.queue = chunksInRect(rect, this.sendMargin).filter((c) => {
      const key = chunkKey(c.cx, c.cy);
      return !this.sent.has(key) || this.stale.has(key);
    });
  }

  /**
   * Queues a chunk again, first, if the renderer holds it (its content changed).
   * @param {number} cx
   * @param {number} cy
   * @returns {void}
   */
  resend(cx, cy) {
    const key = chunkKey(cx, cy);
    if (!this.sent.has(key) || this.stale.has(key)) return;
    this.stale.add(key);
    this.queue.unshift({ cx, cy });
  }

  /** @returns {boolean} */
  get pending() {
    return this.queue.length > 0;
  }

  /**
   * Generates (if needed) and returns the next chunk to send, marking it as sent.
   * @returns {import('../sim/world/chunk.js').Chunk | null}
   */
  next() {
    const c = this.queue.shift();
    if (!c) return null;
    const key = chunkKey(c.cx, c.cy);
    this.sent.add(key);
    this.stale.delete(key);
    return this.store.get(c.cx, c.cy);
  }
}
