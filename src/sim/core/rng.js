import { createHasher, hashString } from './hash.js';

/**
 * Turns any seed into a 32-bit key: numbers keep their low 32 bits, strings are hashed.
 * @param {number | string} seed
 * @returns {number}
 */
export function seedToKey(seed) {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) throw new Error(`Invalid seed: ${seed}`);
    return Math.trunc(seed) >>> 0;
  }
  return hashString(String(seed));
}

/**
 * SplitMix32 step, used only to spread a 32-bit key over the generator state.
 * @param {number} x
 * @returns {number}
 */
function splitMix32(x) {
  let z = (x + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Seeded pseudo-random generator (SFC32). The only source of randomness allowed in src/sim.
 * Each subsystem should use its own stream obtained with {@link Rng#fork}.
 */
export class Rng {
  /**
   * @param {number} key - 32-bit key identifying this stream.
   */
  constructor(key) {
    /** @type {number} */
    this.key = key >>> 0;
    const s = new Uint32Array(4);
    let x = this.key;
    for (let i = 0; i < 4; i++) {
      x = splitMix32(x + i);
      s[i] = x;
    }
    /** @type {Uint32Array} */
    this.s = s;
    // Discard the first outputs, which are weakly mixed for nearby keys.
    for (let i = 0; i < 15; i++) this.nextUint32();
  }

  /** @returns {number} Unsigned 32-bit integer. */
  nextUint32() {
    const s = this.s;
    const t = (((s[0] + s[1]) >>> 0) + s[3]) >>> 0;
    s[3] = (s[3] + 1) >>> 0;
    s[0] = s[1] ^ (s[1] >>> 9);
    s[1] = (s[2] + (s[2] << 3)) >>> 0;
    s[2] = ((s[2] << 21) | (s[2] >>> 11)) >>> 0;
    s[2] = (s[2] + t) >>> 0;
    return t;
  }

  /** @returns {number} Float in [0, 1). */
  next() {
    return this.nextUint32() / 4294967296;
  }

  /**
   * @param {number} min - Inclusive lower bound (integer).
   * @param {number} max - Inclusive upper bound (integer).
   * @returns {number}
   */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /**
   * Derives an independent stream from this stream's key and a label.
   * Forking never consumes numbers from the parent stream.
   * @param {string} label
   * @returns {Rng}
   */
  fork(label) {
    return new Rng(createHasher().uint32(this.key).string(label).digest());
  }

  /** @returns {Uint32Array} Copy of the internal state. */
  getState() {
    return Uint32Array.from(this.s);
  }

  /** @param {Uint32Array} state - A state previously returned by {@link Rng#getState}. */
  setState(state) {
    this.s.set(state);
  }
}

/**
 * @param {number | string} seed
 * @returns {Rng}
 */
export function createRng(seed) {
  return new Rng(seedToKey(seed));
}
