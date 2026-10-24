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
  }

  /**
   * @param {{ x0: number, y0: number, x1: number, y1: number }} rect - Visible tiles, inclusive.
   * @returns {void}
   */
  setViewport(rect) {
    const keep = new Set(chunksInRect(rect, this.keepMargin).map((c) => chunkKey(c.cx, c.cy)));
    for (const key of this.sent) if (!keep.has(key)) this.sent.delete(key);
    this.queue = chunksInRect(rect, this.sendMargin).filter(
      (c) => !this.sent.has(chunkKey(c.cx, c.cy)),
    );
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
    this.sent.add(chunkKey(c.cx, c.cy));
    return this.store.get(c.cx, c.cy);
  }
}
