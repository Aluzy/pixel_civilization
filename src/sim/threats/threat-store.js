/** Behaviour state of a predator. */
export const Mood = Object.freeze({
  PROWL: 0, // No prey in sense: waits.
  HUNT: 1, // Closing in on a prey, attacks when adjacent.
  FLEE: 2, // Wounded: runs away, then leaves.
});

/**
 * Predators (docs/design/02-monde.md, « Menaces »), as typed arrays indexed by id like agents.
 * They are part of the world, not agents: no memory and no planning, just simple rules.
 */
export class ThreatStore {
  /**
   * @param {number} max
   */
  constructor(max) {
    this.max = max;
    this.highWater = 0;
    this.aliveCount = 0;
    this.alive = new Uint8Array(max);
    this.x = new Int32Array(max);
    this.y = new Int32Array(max);
    this.hp = new Float64Array(max);
    this.maxHp = new Float64Array(max);
    this.mood = new Uint8Array(max);
    this.target = new Int32Array(max).fill(-1);
    this.moveProgress = new Float64Array(max);
    this.cooldown = new Int32Array(max);
    /** Ticks hunting without landing a blow: a predator that cannot catch its prey gives up. */
    this.chase = new Int32Array(max);
    /** Distance found by the last {@link ThreatStore#nearest} call. */
    this.lastDistance = Infinity;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} hp
   * @returns {number} Id, or -1 if full.
   */
  spawn(x, y, hp) {
    let id = 0;
    while (id < this.max && this.alive[id] === 1) id++;
    if (id >= this.max) return -1;
    if (id >= this.highWater) this.highWater = id + 1;
    this.alive[id] = 1;
    this.aliveCount++;
    this.x[id] = x;
    this.y[id] = y;
    this.hp[id] = hp;
    this.maxHp[id] = hp;
    this.mood[id] = Mood.PROWL;
    this.target[id] = -1;
    this.moveProgress[id] = 0;
    this.cooldown[id] = 0;
    this.chase[id] = 0;
    return id;
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  remove(id) {
    if (this.alive[id] !== 1) return;
    this.alive[id] = 0;
    this.aliveCount--;
  }

  /**
   * Predators within `radius` (Chebyshev) of (x, y).
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {number}
   */
  countNear(x, y, radius) {
    let n = 0;
    for (let i = 0; i < this.highWater; i++) {
      if (this.alive[i] !== 1) continue;
      if (Math.abs(this.x[i] - x) <= radius && Math.abs(this.y[i] - y) <= radius) n++;
    }
    return n;
  }

  /**
   * Nearest predator within `radius` (Chebyshev), or -1; its distance is left in `lastDistance`.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {number}
   */
  nearest(x, y, radius) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.highWater; i++) {
      if (this.alive[i] !== 1) continue;
      const d = Math.max(Math.abs(this.x[i] - x), Math.abs(this.y[i] - y));
      if (d <= radius && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.lastDistance = bestD;
    return best;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.aliveCount).uint32(this.highWater);
    const one = new Float64Array(2);
    for (let i = 0; i < this.highWater; i++) {
      if (this.alive[i] !== 1) continue;
      h.uint32(i).uint32(this.x[i]).uint32(this.y[i]);
      h.uint32(this.mood[i]).uint32(this.target[i]).uint32(this.cooldown[i]);
      h.uint32(this.chase[i]);
      one[0] = this.hp[i];
      one[1] = this.moveProgress[i];
      h.typedArray(one);
    }
  }
}
