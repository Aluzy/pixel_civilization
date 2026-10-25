/**
 * The colony's trial notebook (docs/design/14-economie.md, « Arbre technologique »): the failed
 * trials of its researchers (its inventor, its cooks), kept without fading and handed from one to
 * the next, so that a long search (the oven, the foundry) is not started over at every change of
 * inventor. Oldest entries are pushed out first. Storage is preallocated; a set indexes the
 * entries for lookup only (never iterated).
 */
export class TrialNotebook {
  /**
   * @param {number} capacity
   */
  constructor(capacity) {
    this.capacity = capacity;
    this.station = new Int32Array(capacity).fill(-1);
    this.mask = new Int32Array(capacity);
    this.count = 0;
    this.next = 0;
    /** @type {Set<number>} */
    this.index = new Set();
  }

  /**
   * @param {number} station
   * @param {number} mask
   * @returns {number} One number per trial (station < 64, mask < 2^31).
   */
  static key(station, mask) {
    return station * 0x80000000 + mask;
  }

  /**
   * @param {number} station
   * @param {number} mask
   * @returns {boolean} True if this exact trial is noted as a failure.
   */
  hasFailed(station, mask) {
    return this.index.has(TrialNotebook.key(station, mask));
  }

  /**
   * @param {number} station
   * @param {number} mask
   * @returns {void}
   */
  record(station, mask) {
    const key = TrialNotebook.key(station, mask);
    if (this.index.has(key)) return;
    const k = this.next;
    if (this.count === this.capacity) {
      this.index.delete(TrialNotebook.key(this.station[k], this.mask[k]));
    } else this.count++;
    this.station[k] = station;
    this.mask[k] = mask;
    this.index.add(key);
    this.next = (k + 1) % this.capacity;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.count).uint32(this.next);
    h.typedArray(this.station.subarray(0, this.count));
    h.typedArray(this.mask.subarray(0, this.count));
  }
}
