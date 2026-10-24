/**
 * What one agent believes about the others it has met (docs/design/06-ia.md, couche 6): a few
 * compact sheets, the least recently seen pushed out when full. Never exact: only what the agent
 * itself perceived (recipes it saw made, talks, shared work).
 */
export class SocialModel {
  /**
   * @param {number} capacity
   */
  constructor(capacity) {
    this.capacity = capacity;
    this.count = 0;
    this.other = new Int32Array(capacity);
    this.seen = new Int32Array(capacity);
    /** Grows with talks and shared work. */
    this.affinity = new Float64Array(capacity);
    /** Bit set of recipes the agent saw the other one make. */
    this.skills = new Int32Array(capacity);
    /** Projects both contributed to. */
    this.shared = new Uint16Array(capacity);
    this.talks = new Uint16Array(capacity);
  }

  /**
   * Sheet of `other`, created (or recycled from the least recently seen) if needed.
   * @param {number} other
   * @param {number} tick
   * @returns {number}
   */
  sheet(other, tick) {
    let oldest = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.other[i] === other) {
        this.seen[i] = tick;
        return i;
      }
      if (this.seen[i] < this.seen[oldest]) oldest = i;
    }
    const i = this.count < this.capacity ? this.count++ : oldest;
    this.other[i] = other;
    this.seen[i] = tick;
    this.affinity[i] = 0;
    this.skills[i] = 0;
    this.shared[i] = 0;
    this.talks[i] = 0;
    return i;
  }

  /**
   * @param {number} other
   * @returns {number} Sheet index, -1 if unknown.
   */
  find(other) {
    for (let i = 0; i < this.count; i++) if (this.other[i] === other) return i;
    return -1;
  }

  /**
   * Forgets a dead agent.
   * @param {number} other
   * @returns {void}
   */
  remove(other) {
    const i = this.find(other);
    if (i < 0) return;
    const last = --this.count;
    this.other[i] = this.other[last];
    this.seen[i] = this.seen[last];
    this.affinity[i] = this.affinity[last];
    this.skills[i] = this.skills[last];
    this.shared[i] = this.shared[last];
    this.talks[i] = this.talks[last];
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    const n = this.count;
    h.uint32(n).typedArray(this.other.subarray(0, n)).typedArray(this.seen.subarray(0, n));
    h.typedArray(this.affinity.subarray(0, n)).typedArray(this.skills.subarray(0, n));
    h.typedArray(this.shared.subarray(0, n)).typedArray(this.talks.subarray(0, n));
  }
}
