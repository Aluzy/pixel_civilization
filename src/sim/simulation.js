import resourceData from '../../data/resources.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { describeTick } from './core/clock.js';
import { createHasher } from './core/hash.js';
import { createRng, seedToKey } from './core/rng.js';
import { SYSTEMS } from './systems/index.js';
import { ChunkStore, findSpawn } from './world/chunk-store.js';
import { WorldGenerator } from './world/generator.js';
import { buildWorldTables } from './world/world-data.js';

/** Indexed world tables built from data/, shared by every simulation (read-only). */
export const WORLD_TABLES = buildWorldTables(worldData, resourceData);

/** Independent random streams, one per subsystem, so that systems cannot disturb each other. */
export const RNG_STREAMS = Object.freeze(['world', 'threats', 'ai', 'social', 'lifecycle']);

/**
 * @typedef {object} SimState
 * @property {number} seedKey - 32-bit key derived from the seed.
 * @property {number} tick - Number of ticks simulated so far.
 * @property {Record<string, import('./core/rng.js').Rng>} rng - One stream per subsystem.
 * @property {object} balance - Content of data/balance.json.
 * @property {ChunkStore} world - Tiles, generated on demand.
 * @property {{ x: number, y: number }} spawn - Where the first individual appears.
 */

/**
 * Deterministic simulation: same seed and same number of ticks give the same state.
 * Contains no real-time logic; pacing is done by the host (src/worker).
 */
export class Simulation {
  /**
   * @param {object} options
   * @param {number | string} options.seed
   * @param {{ time: import('./core/clock.js').TimeConfig }} options.balance
   * @param {import('./world/world-data.js').WorldTables} [options.tables]
   */
  constructor({ seed, balance, tables = WORLD_TABLES }) {
    const root = createRng(seed);
    /** @type {Record<string, import('./core/rng.js').Rng>} */
    const rng = {};
    for (const name of RNG_STREAMS) rng[name] = root.fork(name);
    const world = new ChunkStore(new WorldGenerator(rng.world.fork('generator'), tables));
    const spawn = findSpawn(world, tables);
    /** @type {SimState} */
    this.state = { seedKey: seedToKey(seed), tick: 0, rng, balance, world, spawn };
    this.tables = tables;
  }

  /** @returns {ChunkStore} */
  get world() {
    return this.state.world;
  }

  /** @returns {{ x: number, y: number }} */
  get spawn() {
    return this.state.spawn;
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
   * Generated-but-untouched chunks are a pure function of the seed, so only modified chunks
   * count: what the observer looked at never changes the hash.
   * @returns {string}
   */
  hash() {
    const s = this.state;
    const h = createHasher().uint32(s.seedKey).uint32(s.tick);
    h.uint32(s.spawn.x).uint32(s.spawn.y);
    for (const name of RNG_STREAMS) h.string(name).typedArray(s.rng[name].s);
    for (const c of s.world.modifiedChunks()) {
      h.uint32(c.cx).uint32(c.cy).typedArray(c.resource).typedArray(c.quantity);
    }
    return h.hex();
  }
}
