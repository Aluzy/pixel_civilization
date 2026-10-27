// Spatial index of the agents (decision 0030): buckets of CELL × CELL tiles, each a doubly linked
// list of agent ids, kept up to date as agents are created, moved and killed. A query returns the
// agents of a box in id order, so a loop over them behaves exactly like a loop over every agent
// that skips those out of reach, at a cost that no longer grows with the population.

/** Side of a bucket, in tiles. */
export const CELL = 16;

const OFFSET = 1 << 20;
const SPAN = 1 << 21;
const NONE = -1;

/**
 * @param {number} bx
 * @param {number} by
 * @returns {number} Numeric key of a bucket.
 */
function keyOf(bx, by) {
  return (by + OFFSET) * SPAN + (bx + OFFSET);
}

export class AgentGrid {
  /**
   * @param {number} max - Most agents at once.
   */
  constructor(max) {
    this.next = new Int32Array(max).fill(NONE);
    this.prev = new Int32Array(max).fill(NONE);
    /** Bucket key of each agent, NaN when it is in none. */
    this.key = new Float64Array(max).fill(NaN);
    /** @type {Map<number, number>} First agent of each bucket (NONE when empty). */
    this.heads = new Map();
    /** Ids found by the last {@link AgentGrid#query}, in increasing order. */
    this.found = new Int32Array(max);
  }

  /**
   * @param {number} id
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  insert(id, x, y) {
    const k = keyOf(Math.floor(x / CELL), Math.floor(y / CELL));
    const head = this.heads.get(k) ?? NONE;
    this.key[id] = k;
    this.prev[id] = NONE;
    this.next[id] = head;
    if (head !== NONE) this.prev[head] = id;
    this.heads.set(k, id);
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  remove(id) {
    const k = this.key[id];
    if (k !== k) return;
    const p = this.prev[id];
    const n = this.next[id];
    if (p !== NONE) this.next[p] = n;
    else this.heads.set(k, n);
    if (n !== NONE) this.prev[n] = p;
    this.key[id] = NaN;
    this.next[id] = NONE;
    this.prev[id] = NONE;
  }

  /**
   * Moves an agent to (x, y): relinked only when it changes bucket.
   * @param {number} id
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  move(id, x, y) {
    const k = keyOf(Math.floor(x / CELL), Math.floor(y / CELL));
    if (k === this.key[id]) return;
    this.remove(id);
    this.insert(id, x, y);
  }

  /**
   * Agents whose position (as given by `xs`, `ys`) lies in the box [x0, x1] × [y0, y1], written
   * in increasing id order to {@link AgentGrid#found}.
   * @param {Int32Array} xs
   * @param {Int32Array} ys
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1
   * @param {number} y1
   * @returns {number} How many.
   */
  query(xs, ys, x0, y0, x1, y1) {
    const bx0 = Math.floor(x0 / CELL);
    const by0 = Math.floor(y0 / CELL);
    const bx1 = Math.floor(x1 / CELL);
    const by1 = Math.floor(y1 / CELL);
    const found = this.found;
    let n = 0;
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        let id = this.heads.get(keyOf(bx, by)) ?? NONE;
        while (id !== NONE) {
          const x = xs[id];
          const y = ys[id];
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) found[n++] = id;
          id = this.next[id];
        }
      }
    }
    if (n > 1) found.subarray(0, n).sort();
    return n;
  }
}
