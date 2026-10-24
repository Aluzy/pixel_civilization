import world from '../../../data/world.json' with { type: 'json' };

/** Width and height of a chunk, in tiles. */
export const CHUNK_SIZE = world.chunkSize;

/**
 * Chunk coordinate containing a tile coordinate (floor division, correct for negatives).
 * @param {number} t - Tile coordinate (x or y).
 * @returns {number}
 */
export function toChunk(t) {
  return Math.floor(t / CHUNK_SIZE);
}

/**
 * Position of a tile inside its chunk, in [0, CHUNK_SIZE).
 * @param {number} t - Tile coordinate (x or y).
 * @returns {number}
 */
export function toLocal(t) {
  return t - toChunk(t) * CHUNK_SIZE;
}

/**
 * @param {number} cx
 * @param {number} cy
 * @returns {string}
 */
export function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

/**
 * Chunks overlapping a tile rectangle, widened by `margin` chunks, nearest to its centre first.
 * Shared by the worker (what to send) and the renderer (what to keep) so they always agree.
 * @param {{ x0: number, y0: number, x1: number, y1: number }} rect - Tile bounds, inclusive.
 * @param {number} margin - Extra chunks on each side.
 * @returns {{ cx: number, cy: number }[]}
 */
export function chunksInRect(rect, margin) {
  const cx0 = toChunk(Math.floor(rect.x0)) - margin;
  const cy0 = toChunk(Math.floor(rect.y0)) - margin;
  const cx1 = toChunk(Math.floor(rect.x1)) + margin;
  const cy1 = toChunk(Math.floor(rect.y1)) + margin;
  const midX = (rect.x0 + rect.x1) / 2 / CHUNK_SIZE - 0.5;
  const midY = (rect.y0 + rect.y1) / 2 / CHUNK_SIZE - 0.5;
  const list = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const dx = cx - midX;
      const dy = cy - midY;
      list.push({ cx, cy, d: dx * dx + dy * dy });
    }
  }
  list.sort((a, b) => a.d - b.d || a.cy - b.cy || a.cx - b.cx);
  return list.map(({ cx, cy }) => ({ cx, cy }));
}
