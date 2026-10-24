// Personal map of explored areas (influence map "Exploration", docs/design/06-ia.md, layer 3):
// one entry per cell of `cellSize` × `cellSize` tiles, holding when the agent last saw it.
// Stored in a fixed open-addressing table; when full, the oldest entries are overwritten, so
// long-unvisited regions slowly become unknown again.

const PROBES = 16;
// Packs two cell coordinates (|c| < 2^26) into one exactly representable number.
const KEY_OFFSET = 67108864;
const KEY_SPAN = 134217728;
const EMPTY = -1;

// 16 headings around the compass (cos, sin of k × 22.5°), written out to stay deterministic.
const HEADINGS = Float64Array.from([
  1, 0, 0.92388, 0.382683, 0.707107, 0.707107, 0.382683, 0.92388, 0, 1, -0.382683, 0.92388,
  -0.707107, 0.707107, -0.92388, 0.382683, -1, 0, -0.92388, -0.382683, -0.707107, -0.707107,
  -0.382683, -0.92388, 0, -1, 0.382683, -0.92388, 0.707107, -0.707107, 0.92388, -0.382683,
]);
export const HEADING_COUNT = HEADINGS.length / 2;

export class ExplorationMap {
  /**
   * @param {number} capacity - Number of cells the agent can keep track of.
   * @param {number} cellSize - Tiles per cell side.
   */
  constructor(capacity, cellSize) {
    this.capacity = capacity;
    this.cellSize = cellSize;
    this.keys = new Float64Array(capacity).fill(EMPTY);
    this.ticks = new Int32Array(capacity);
    this.size = 0;
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @returns {number}
   */
  static key(cx, cy) {
    return (cx + KEY_OFFSET) * KEY_SPAN + (cy + KEY_OFFSET);
  }

  /**
   * @param {number} key
   * @returns {number} First probe index.
   */
  home(key) {
    // Cheap integer mix of the two halves of the key.
    const hi = Math.floor(key / KEY_SPAN);
    const lo = key - hi * KEY_SPAN;
    const h = Math.imul(hi ^ Math.imul(lo, 0x9e3779b1), 0x85ebca6b) >>> 0;
    return h % this.capacity;
  }

  /**
   * Records that the agent saw a cell at `tick`.
   * @param {number} cx
   * @param {number} cy
   * @param {number} tick
   * @returns {void}
   */
  mark(cx, cy, tick) {
    const key = ExplorationMap.key(cx, cy);
    let slot = this.home(key);
    let oldest = slot;
    for (let p = 0; p < PROBES; p++) {
      const k = this.keys[slot];
      if (k === key) {
        this.ticks[slot] = tick;
        return;
      }
      if (k === EMPTY) {
        this.keys[slot] = key;
        this.ticks[slot] = tick;
        this.size++;
        return;
      }
      if (this.ticks[slot] < this.ticks[oldest]) oldest = slot;
      slot = (slot + 1) % this.capacity;
    }
    this.keys[oldest] = key;
    this.ticks[oldest] = tick;
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @returns {number} Tick the cell was last seen, or -1 if never (or forgotten).
   */
  lastSeen(cx, cy) {
    const key = ExplorationMap.key(cx, cy);
    let slot = this.home(key);
    for (let p = 0; p < PROBES; p++) {
      const k = this.keys[slot];
      if (k === key) return this.ticks[slot];
      if (k === EMPTY) return -1;
      slot = (slot + 1) % this.capacity;
    }
    return -1;
  }

  /**
   * How unknown a cell is: 1 if never seen, rising from 0 back to 1 as the view gets old.
   * @param {number} cx
   * @param {number} cy
   * @param {number} tick
   * @param {number} staleTicks - Age at which a seen cell counts as unknown again.
   * @returns {number}
   */
  unknownness(cx, cy, tick, staleTicks) {
    const seen = this.lastSeen(cx, cy);
    if (seen < 0) return 1;
    const age = (tick - seen) / staleTicks;
    return age >= 1 ? 1 : age;
  }

  /**
   * Marks every cell whose centre lies inside a tile square.
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1 - Inclusive.
   * @param {number} y1 - Inclusive.
   * @param {number} tick
   * @returns {void}
   */
  markArea(x0, y0, x1, y1, tick) {
    const s = this.cellSize;
    const cx0 = Math.ceil((x0 - s / 2) / s);
    const cy0 = Math.ceil((y0 - s / 2) / s);
    const cx1 = Math.floor((x1 - s / 2) / s);
    const cy1 = Math.floor((y1 - s / 2) / s);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) this.mark(cx, cy, tick);
    }
  }

  /**
   * Picks an exploration target: among 16 headings at distance `leg`, the one whose surroundings
   * (3 × 3 cells) are the least known. Small random jitter breaks ties.
   * @param {number} x
   * @param {number} y
   * @param {number} leg - Distance in tiles.
   * @param {number} tick
   * @param {number} staleTicks
   * @param {import('../core/rng.js').Rng} rng
   * @param {Int32Array} out - Receives target x, y.
   * @returns {number} Unknownness of the chosen target, in [0, 1].
   */
  frontier(x, y, leg, tick, staleTicks, rng, out) {
    const s = this.cellSize;
    let bestScore = -1;
    let bestX = x;
    let bestY = y;
    let bestValue = 0;
    for (let h = 0; h < HEADING_COUNT; h++) {
      const tx = Math.round(x + HEADINGS[h * 2] * leg);
      const ty = Math.round(y + HEADINGS[h * 2 + 1] * leg);
      const cx = Math.floor(tx / s);
      const cy = Math.floor(ty / s);
      let value = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          value += this.unknownness(cx + dx, cy + dy, tick, staleTicks);
        }
      }
      value /= 9;
      const score = value + rng.next() * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestX = tx;
        bestY = ty;
        bestValue = value;
      }
    }
    out[0] = bestX;
    out[1] = bestY;
    return bestValue;
  }

  /**
   * Entries as [cx, cy, tick] triples, for the inspector layer (allocates; not for hot loops).
   * @returns {number[]}
   */
  entries() {
    const out = [];
    for (let i = 0; i < this.capacity; i++) {
      const key = this.keys[i];
      if (key === EMPTY) continue;
      const hi = Math.floor(key / KEY_SPAN);
      out.push(hi - KEY_OFFSET, key - hi * KEY_SPAN - KEY_OFFSET, this.ticks[i]);
    }
    return out;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.size).typedArray(this.keys).typedArray(this.ticks);
  }
}
