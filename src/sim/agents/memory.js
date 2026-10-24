import { expNeg } from '../core/math.js';

/** Subject id for water; resource ids (1…n) are their own subjects. */
export const WATER_SUBJECT = 0;

/** Most memory slots an agent can ever have (the attribute Mémoire is clamped to it). */
export const MAX_MEMORY = 64;

/** Recently forgotten places kept to notice a rediscovery. */
export const FORGOTTEN_SLOTS = 8;

/** Results of {@link Memory#remember}. */
export const Remembered = Object.freeze({
  REFRESHED: 0, // Same place already known: refreshed.
  ADDED: 1, // New place stored in a free slot.
  REPLACED: 2, // Memory full: the weakest place was pushed out.
  IGNORED: 3, // Memory full of stronger places: not stored.
});

/**
 * Memory of places of one agent (docs/design/05-savoir.md). Each place has a strength
 * s(t) = s0 × e^(−(t − t0) / τ); it is evaluated on demand, refreshed when the place is seen
 * again, consolidated (τ × consolidation) when used, and forgotten below a threshold. Capacity is
 * the agent's Mémoire attribute: when full, a new place pushes out the weakest one.
 * All storage is preallocated; no method allocates.
 */
export class Memory {
  /**
   * @param {number} capacity
   */
  constructor(capacity) {
    this.capacity = Math.max(1, Math.min(MAX_MEMORY, Math.floor(capacity)));
    this.count = 0;
    this.subject = new Int16Array(this.capacity);
    this.x = new Int32Array(this.capacity);
    this.y = new Int32Array(this.capacity);
    /** Units seen there at the last observation (belief, may be outdated). */
    this.quantity = new Uint8Array(this.capacity);
    /** Tick of the last observation. */
    this.seen = new Int32Array(this.capacity);
    this.s0 = new Float64Array(this.capacity);
    this.t0 = new Int32Array(this.capacity);
    this.tau = new Float64Array(this.capacity);
    // Ring of recently forgotten places.
    this.lostSubject = new Int16Array(FORGOTTEN_SLOTS).fill(-1);
    this.lostX = new Int32Array(FORGOTTEN_SLOTS);
    this.lostY = new Int32Array(FORGOTTEN_SLOTS);
    this.lostTick = new Int32Array(FORGOTTEN_SLOTS);
    this.lostNext = 0;
  }

  /**
   * @param {number} i
   * @param {number} tick
   * @returns {number} Current strength in [0, 1].
   */
  strength(i, tick) {
    return this.s0[i] * expNeg((tick - this.t0[i]) / this.tau[i]);
  }

  /**
   * Index of a known place of `subject` within `radius` tiles (Chebyshev) of (x, y), or -1.
   * @param {number} subject
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {number}
   */
  find(subject, x, y, radius) {
    for (let i = 0; i < this.count; i++) {
      if (this.subject[i] !== subject) continue;
      if (Math.abs(this.x[i] - x) <= radius && Math.abs(this.y[i] - y) <= radius) return i;
    }
    return -1;
  }

  /**
   * Stores or refreshes a place that the agent sees now.
   * @param {number} subject
   * @param {number} x
   * @param {number} y
   * @param {number} quantity
   * @param {number} tick
   * @param {number} salience - Initial strength, in (0, 1].
   * @param {number} tau - Initial time constant, in ticks.
   * @param {number} radius - Sightings this close to a known place refresh it.
   * @returns {number} One of {@link Remembered}.
   */
  remember(subject, x, y, quantity, tick, salience, tau, radius) {
    const known = this.find(subject, x, y, radius);
    if (known >= 0) {
      // The place keeps its first position: moving it could drift it onto another memory.
      this.refresh(known, tick, salience, quantity);
      return Remembered.REFRESHED;
    }
    let slot = this.count;
    let result = Remembered.ADDED;
    if (this.count >= this.capacity) {
      slot = this.weakest(tick);
      if (this.strength(slot, tick) >= salience) return Remembered.IGNORED;
      this.recordLost(slot, tick);
      result = Remembered.REPLACED;
    } else {
      this.count++;
    }
    this.subject[slot] = subject;
    this.x[slot] = x;
    this.y[slot] = y;
    this.quantity[slot] = quantity;
    this.seen[slot] = tick;
    this.s0[slot] = salience;
    this.t0[slot] = tick;
    this.tau[slot] = tau;
    return result;
  }

  /**
   * Seen again: back to at least `salience`, observation date updated.
   * @param {number} i
   * @param {number} tick
   * @param {number} salience
   * @param {number} quantity
   * @returns {void}
   */
  refresh(i, tick, salience, quantity) {
    const s = this.strength(i, tick);
    this.s0[i] = s > salience ? s : salience;
    this.t0[i] = tick;
    this.quantity[i] = quantity;
    this.seen[i] = tick;
  }

  /**
   * @param {number} tick
   * @returns {number} Index of the weakest place (lowest index on ties).
   */
  weakest(tick) {
    let best = 0;
    let bestS = Infinity;
    for (let i = 0; i < this.count; i++) {
      const s = this.strength(i, tick);
      if (s < bestS) {
        bestS = s;
        best = i;
      }
    }
    return best;
  }

  /**
   * Strengthens a place the agent just used: full strength, and it fades more slowly.
   * @param {number} i
   * @param {number} tick
   * @param {number} consolidation - Multiplier applied to τ.
   * @param {number} maxTau
   * @returns {void}
   */
  reinforce(i, tick, consolidation, maxTau) {
    this.s0[i] = 1;
    this.t0[i] = tick;
    const tau = this.tau[i] * consolidation;
    this.tau[i] = tau > maxTau ? maxTau : tau;
  }

  /**
   * Removes a place without remembering that it was lost (it turned out to be wrong).
   * @param {number} i
   * @returns {void}
   */
  remove(i) {
    const last = this.count - 1;
    if (i !== last) {
      this.subject[i] = this.subject[last];
      this.x[i] = this.x[last];
      this.y[i] = this.y[last];
      this.quantity[i] = this.quantity[last];
      this.seen[i] = this.seen[last];
      this.s0[i] = this.s0[last];
      this.t0[i] = this.t0[last];
      this.tau[i] = this.tau[last];
    }
    this.count = last;
  }

  /**
   * @param {number} i
   * @param {number} tick
   * @returns {void}
   */
  recordLost(i, tick) {
    const k = this.lostNext;
    this.lostSubject[k] = this.subject[i];
    this.lostX[k] = this.x[i];
    this.lostY[k] = this.y[i];
    this.lostTick[k] = tick;
    this.lostNext = (k + 1) % FORGOTTEN_SLOTS;
  }

  /**
   * Forgets the place at `i` because it faded: it goes to the ring of lost places.
   * @param {number} i
   * @param {number} tick
   * @returns {void}
   */
  forget(i, tick) {
    this.recordLost(i, tick);
    this.remove(i);
  }

  /**
   * If (x, y) matches a recently forgotten place of `subject`, clears that entry and returns its
   * index in the lost ring; otherwise returns -1.
   * @param {number} subject
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {number}
   */
  takeLost(subject, x, y, radius) {
    for (let k = 0; k < FORGOTTEN_SLOTS; k++) {
      if (this.lostSubject[k] !== subject) continue;
      if (Math.abs(this.lostX[k] - x) > radius || Math.abs(this.lostY[k] - y) > radius) continue;
      this.lostSubject[k] = -1;
      return k;
    }
    return -1;
  }

  /**
   * @param {number} k - Index in the lost ring.
   * @returns {boolean} True if this lost entry is in use.
   */
  isLost(k) {
    return this.lostSubject[k] >= 0;
  }

  /**
   * @param {number} k
   * @returns {void}
   */
  clearLost(k) {
    this.lostSubject[k] = -1;
  }

  /**
   * Nearest known place whose subject is flagged in `subjects`, or -1.
   * @param {Uint8Array} subjects - 1 per wanted subject id.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  nearest(subjects, x, y) {
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (subjects[this.subject[i]] !== 1) continue;
      const dx = this.x[i] - x;
      const dy = this.y[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  /**
   * Hashes the memory content for determinism checks.
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    const n = this.count;
    h.uint32(n).uint32(this.lostNext);
    h.typedArray(this.subject.subarray(0, n)).typedArray(this.x.subarray(0, n));
    h.typedArray(this.y.subarray(0, n)).typedArray(this.quantity.subarray(0, n));
    h.typedArray(this.s0.subarray(0, n)).typedArray(this.t0.subarray(0, n));
    h.typedArray(this.tau.subarray(0, n)).typedArray(this.lostSubject);
  }
}
