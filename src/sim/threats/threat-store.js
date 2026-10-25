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
/** Most dens in the world at once. */
export const MAX_DENS = 32;

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
    /** Den the predator belongs to (pack), or -1 for a lone prowler. */
    this.den = new Int16Array(max).fill(-1);
    // Dens (docs/design/16-guerre-et-forteresses.md): position, health, alive, colony nearby.
    this.denX = new Int32Array(MAX_DENS);
    this.denY = new Int32Array(MAX_DENS);
    this.denHp = new Float64Array(MAX_DENS);
    this.denAlive = new Uint8Array(MAX_DENS);
    this.denColony = new Int16Array(MAX_DENS).fill(-1);
    this.denCount = 0;
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
    this.den[id] = -1;
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
  /**
   * A new den, or -1 if there are too many.
   * @param {number} x
   * @param {number} y
   * @param {number} hp
   * @param {number} colony - Colony whose camp it threatens.
   * @returns {number}
   */
  addDen(x, y, hp, colony) {
    let d = 0;
    while (d < this.denCount && this.denAlive[d] === 1) d++;
    if (d >= MAX_DENS) return -1;
    if (d === this.denCount) this.denCount++;
    this.denX[d] = x;
    this.denY[d] = y;
    this.denHp[d] = hp;
    this.denAlive[d] = 1;
    this.denColony[d] = colony;
    return d;
  }

  /**
   * Predators of a den still alive.
   * @param {number} d
   * @returns {number}
   */
  packSize(d) {
    let n = 0;
    for (let i = 0; i < this.highWater; i++) if (this.alive[i] === 1 && this.den[i] === d) n++;
    return n;
  }

  /**
   * Den on or next to (x, y), or -1.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  denAt(x, y) {
    for (let d = 0; d < this.denCount; d++) {
      if (this.denAlive[d] !== 1) continue;
      if (Math.abs(this.denX[d] - x) <= 1 && Math.abs(this.denY[d] - y) <= 1) return d;
    }
    return -1;
  }

  hashInto(h) {
    h.uint32(this.aliveCount).uint32(this.highWater);
    const D = this.denCount;
    h.uint32(D).typedArray(this.denX.subarray(0, D)).typedArray(this.denY.subarray(0, D));
    h.typedArray(this.denHp.subarray(0, D)).typedArray(this.denAlive.subarray(0, D));
    h.typedArray(this.denColony.subarray(0, D));
    const one = new Float64Array(2);
    for (let i = 0; i < this.highWater; i++) {
      if (this.alive[i] !== 1) continue;
      h.uint32(i).uint32(this.x[i]).uint32(this.y[i]);
      h.uint32(this.mood[i]).uint32(this.target[i]).uint32(this.cooldown[i]);
      h.uint32(this.chase[i]).uint32(this.den[i] & 0xffff);
      one[0] = this.hp[i];
      one[1] = this.moveProgress[i];
      h.typedArray(one);
    }
  }
}
