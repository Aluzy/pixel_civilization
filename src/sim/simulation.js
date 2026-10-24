import { describeTick } from './core/clock.js';
import { createHasher } from './core/hash.js';
import { createRng, seedToKey } from './core/rng.js';
import { SYSTEMS } from './systems/index.js';

/** Independent random streams, one per subsystem, so that systems cannot disturb each other. */
export const RNG_STREAMS = Object.freeze(['world', 'threats', 'ai', 'social', 'lifecycle']);

/**
 * @typedef {object} SimState
 * @property {number} seedKey - 32-bit key derived from the seed.
 * @property {number} tick - Number of ticks simulated so far.
 * @property {Record<string, import('./core/rng.js').Rng>} rng - One stream per subsystem.
 * @property {object} balance - Content of data/balance.json.
 */

/**
 * Deterministic simulation: same seed and same number of ticks give the same state.
 * Contains no real-time logic; pacing is done by the host (src/worker).
 */
export class Simulation {
  /**
   * @param {{ seed: number | string, balance: { time: import('./core/clock.js').TimeConfig } }} options
   */
  constructor({ seed, balance }) {
    const root = createRng(seed);
    /** @type {Record<string, import('./core/rng.js').Rng>} */
    const rng = {};
    for (const name of RNG_STREAMS) rng[name] = root.fork(name);
    /** @type {SimState} */
    this.state = { seedKey: seedToKey(seed), tick: 0, rng, balance };
  }

  /** @returns {number} */
  get tick() {
    return this.state.tick;
  }

  /**
   * Runs `count` ticks. Batching never changes the result.
   * @param {number} [count=1]
   * @returns {void}
   */
  step(count = 1) {
    const state = this.state;
    for (let i = 0; i < count; i++) {
      for (let s = 0; s < SYSTEMS.length; s++) SYSTEMS[s](state);
    }
  }

  /** @returns {import('./core/clock.js').TickInfo} */
  time() {
    return describeTick(this.state.tick, this.state.balance.time);
  }

  /**
   * Hash of everything that defines the simulation state, used by determinism tests.
   * @returns {string}
   */
  hash() {
    const h = createHasher().uint32(this.state.seedKey).uint32(this.state.tick);
    for (const name of RNG_STREAMS) h.string(name).typedArray(this.state.rng[name].s);
    return h.hex();
  }
}
