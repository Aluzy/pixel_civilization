import { expNeg } from '../core/math.js';

/**
 * What one agent knows about making things (docs/design/05-savoir.md): the recipes it has
 * discovered and the trials it remembers as failures. Both fade like places do:
 * s(t) = s0 × e^(−(t − t0) / τ), consolidated on use, forgotten below a threshold by the memory
 * sweep. Recipes have their own slots (one per recipe of the catalogue); failures use a small
 * ring, the oldest pushed out first. All storage is preallocated.
 */
export class RecipeBook {
  /**
   * @param {number} recipeCount
   * @param {number} failureSlots
   */
  constructor(recipeCount, failureSlots) {
    this.recipeCount = recipeCount;
    this.known = new Uint8Array(recipeCount);
    this.s0 = new Float64Array(recipeCount);
    this.t0 = new Int32Array(recipeCount);
    this.tau = new Float64Array(recipeCount);
    this.failureSlots = failureSlots;
    this.failStation = new Int32Array(failureSlots).fill(-1);
    this.failMask = new Int32Array(failureSlots);
    this.failT0 = new Int32Array(failureSlots);
    this.failTau = new Float64Array(failureSlots);
    this.failNext = 0;
  }

  /**
   * @param {number} r - Recipe index.
   * @returns {boolean}
   */
  knows(r) {
    return this.known[r] === 1;
  }

  /**
   * @param {number} r
   * @param {number} tick
   * @returns {number} Strength in [0, 1], 0 if unknown.
   */
  strength(r, tick) {
    if (this.known[r] !== 1) return 0;
    return this.s0[r] * expNeg((tick - this.t0[r]) / this.tau[r]);
  }

  /**
   * Learns a recipe at full strength.
   * @param {number} r
   * @param {number} tick
   * @param {number} tau
   * @returns {boolean} True if it was not known.
   */
  learn(r, tick, tau) {
    const fresh = this.known[r] !== 1;
    this.known[r] = 1;
    this.s0[r] = 1;
    this.t0[r] = tick;
    if (fresh || this.tau[r] < tau) this.tau[r] = tau;
    return fresh;
  }

  /**
   * Made it again: full strength, and it fades more slowly.
   * @param {number} r
   * @param {number} tick
   * @param {number} consolidation
   * @param {number} maxTau
   * @returns {void}
   */
  use(r, tick, consolidation, maxTau) {
    if (this.known[r] !== 1) return;
    this.s0[r] = 1;
    this.t0[r] = tick;
    const tau = this.tau[r] * consolidation;
    this.tau[r] = tau > maxTau ? maxTau : tau;
  }

  /**
   * @param {number} r
   * @returns {void}
   */
  forget(r) {
    this.known[r] = 0;
  }

  /**
   * Bit set of known recipes (recipe count ≤ 31).
   * @returns {number}
   */
  knownMask() {
    let m = 0;
    for (let r = 0; r < this.recipeCount; r++) if (this.known[r] === 1) m |= 1 << r;
    return m;
  }

  /**
   * @param {number} station
   * @param {number} mask
   * @returns {boolean} True if this exact trial is remembered as a failure.
   */
  hasFailed(station, mask) {
    for (let k = 0; k < this.failureSlots; k++) {
      if (this.failStation[k] === station && this.failMask[k] === mask) return true;
    }
    return false;
  }

  /**
   * @param {number} station
   * @param {number} mask
   * @param {number} tick
   * @param {number} tau
   * @returns {void}
   */
  recordFailure(station, mask, tick, tau) {
    const k = this.failNext;
    this.failStation[k] = station;
    this.failMask[k] = mask;
    this.failT0[k] = tick;
    this.failTau[k] = tau;
    this.failNext = (k + 1) % this.failureSlots;
  }

  /** @returns {number} Failures remembered. */
  failureCount() {
    let n = 0;
    for (let k = 0; k < this.failureSlots; k++) if (this.failStation[k] >= 0) n++;
    return n;
  }

  /**
   * Forgets failures that faded below `threshold`, and returns the first recipe that did (or −1),
   * so the caller can report it. Call repeatedly until it returns −1.
   * @param {number} tick
   * @param {number} threshold
   * @returns {number}
   */
  sweep(tick, threshold) {
    for (let k = 0; k < this.failureSlots; k++) {
      if (this.failStation[k] < 0) continue;
      if (expNeg((tick - this.failT0[k]) / this.failTau[k]) < threshold) this.failStation[k] = -1;
    }
    for (let r = 0; r < this.recipeCount; r++) {
      if (this.known[r] === 1 && this.strength(r, tick) < threshold) {
        this.known[r] = 0;
        return r;
      }
    }
    return -1;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.typedArray(this.known).typedArray(this.s0).typedArray(this.t0).typedArray(this.tau);
    h.typedArray(this.failStation).typedArray(this.failMask).typedArray(this.failT0);
    h.uint32(this.failNext);
  }
}
