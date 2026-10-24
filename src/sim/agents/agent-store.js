import { Action, PLACE_KINDS } from './action-types.js';
import { Journal } from './journal.js';

/** Longest path an agent can hold; paths never leave its perception window (radius ≤ 22). */
export const PATH_MAX = 2048;

/**
 * Components of all agents, as typed arrays indexed by entity id (light ECS). Ids are reused
 * after death, lowest first, so iteration in id order is deterministic.
 */
export class AgentStore {
  /**
   * @param {object} options
   * @param {number} options.max - Maximum number of simultaneous agents.
   * @param {number} options.resourceCount - Number of resource ids (excluding 0).
   * @param {number} options.journalSize
   * @param {number} options.placesPerKind - Remembered places per kind.
   */
  constructor({ max, resourceCount, journalSize, placesPerKind }) {
    this.max = max;
    this.resourceSlots = resourceCount + 1;
    this.journalSize = journalSize;
    this.placesPerKind = placesPerKind;
    /** One past the highest id ever used: loops stop there. */
    this.highWater = 0;
    this.aliveCount = 0;

    const f64 = () => new Float64Array(max);
    const i32 = () => new Int32Array(max);
    const u8 = () => new Uint8Array(max);

    this.alive = u8();
    this.bornTick = i32();
    // Position on the grid, and progress towards the next path cell.
    this.x = i32();
    this.y = i32();
    this.moveProgress = f64();
    // Health and needs, 0 (satisfied) to 100 (critical), health 0 to max.
    this.hp = f64();
    this.hunger = f64();
    this.thirst = f64();
    this.fatigue = f64();
    this.curiosity = f64();
    // Attributes.
    this.maxHp = f64();
    this.force = f64();
    this.speed = f64();
    this.attack = f64();
    this.defense = f64();
    this.perception = f64();
    this.memorySize = f64();
    // Carried units per resource id.
    this.inventory = new Uint16Array(max * this.resourceSlots);
    // Decision and action state.
    this.goal = new Int8Array(max).fill(-1);
    this.goalSince = i32();
    this.action = u8();
    this.thenAction = u8();
    this.actionX = i32();
    this.actionY = i32();
    this.actionProgress = f64();
    this.asleep = u8();
    this.needsDecision = u8();
    this.exploring = u8();
    this.exploreX = i32();
    this.exploreY = i32();
    this.flags = u8();
    // Path of absolute cells, as x, y pairs.
    /** @type {Int32Array[]} */
    this.path = [];
    this.pathLength = new Uint16Array(max);
    this.pathIndex = new Uint16Array(max);
    // Minimal memory of places: x, y, tick per slot.
    this.places = new Int32Array(max * PLACE_KINDS * placesPerKind * 3);
    this.placeCount = new Uint8Array(max * PLACE_KINDS);
    /** @type {import('../core/rng.js').Rng[]} One random stream per agent. */
    this.rng = [];
    /** @type {Journal[]} */
    this.journal = [];
  }

  /**
   * Creates an agent and returns its id.
   * @param {object} spec
   * @param {number} spec.x
   * @param {number} spec.y
   * @param {number} spec.tick
   * @param {Record<string, number>} spec.attributes - hp, force, speed, attack, defense,
   *   perception, memory.
   * @param {number} spec.needs - Starting value of every need.
   * @param {import('../core/rng.js').Rng} spec.rng
   * @returns {number}
   */
  create({ x, y, tick, attributes, needs, rng }) {
    let id = 0;
    while (id < this.max && this.alive[id] === 1) id++;
    if (id >= this.max) throw new Error('Too many agents');
    if (id >= this.highWater) this.highWater = id + 1;
    this.alive[id] = 1;
    this.aliveCount++;
    this.bornTick[id] = tick;
    this.x[id] = x;
    this.y[id] = y;
    this.moveProgress[id] = 0;
    this.maxHp[id] = attributes.hp;
    this.hp[id] = attributes.hp;
    this.force[id] = attributes.force;
    this.speed[id] = attributes.speed;
    this.attack[id] = attributes.attack;
    this.defense[id] = attributes.defense;
    this.perception[id] = attributes.perception;
    this.memorySize[id] = attributes.memory;
    this.hunger[id] = needs;
    this.thirst[id] = needs;
    this.fatigue[id] = needs;
    this.curiosity[id] = needs;
    this.inventory.fill(0, id * this.resourceSlots, (id + 1) * this.resourceSlots);
    this.goal[id] = -1;
    this.goalSince[id] = tick;
    this.action[id] = Action.NONE;
    this.thenAction[id] = Action.NONE;
    this.actionProgress[id] = 0;
    this.asleep[id] = 0;
    this.needsDecision[id] = 1;
    this.exploring[id] = 0;
    this.flags[id] = 0;
    if (!this.path[id]) this.path[id] = new Int32Array(PATH_MAX * 2);
    this.pathLength[id] = 0;
    this.pathIndex[id] = 0;
    this.placeCount.fill(0, id * PLACE_KINDS, (id + 1) * PLACE_KINDS);
    this.rng[id] = rng;
    this.journal[id] = new Journal(this.journalSize);
    return id;
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  kill(id) {
    if (this.alive[id] !== 1) return;
    this.alive[id] = 0;
    this.aliveCount--;
    this.asleep[id] = 0;
    this.action[id] = Action.NONE;
  }

  /**
   * Carried units of a resource.
   * @param {number} id
   * @param {number} resource
   * @returns {number}
   */
  carried(id, resource) {
    return this.inventory[id * this.resourceSlots + resource];
  }

  /**
   * @param {number} id
   * @param {number} resource
   * @param {number} delta
   * @returns {void}
   */
  addCarried(id, resource, delta) {
    this.inventory[id * this.resourceSlots + resource] += delta;
  }

  /**
   * @param {number} id
   * @returns {number} Total units carried.
   */
  carriedTotal(id) {
    let n = 0;
    const base = id * this.resourceSlots;
    for (let r = 1; r < this.resourceSlots; r++) n += this.inventory[base + r];
    return n;
  }

  /**
   * Hashes every alive agent's state, in id order, for determinism checks.
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.aliveCount).uint32(this.highWater);
    const fields = [
      this.moveProgress,
      this.hp,
      this.hunger,
      this.thirst,
      this.fatigue,
      this.curiosity,
      this.actionProgress,
    ];
    const one = new Float64Array(1);
    for (let id = 0; id < this.highWater; id++) {
      if (this.alive[id] !== 1) continue;
      h.uint32(id).uint32(this.x[id]).uint32(this.y[id]);
      h.uint32(this.goal[id] & 0xff).uint32(this.action[id]).uint32(this.thenAction[id]);
      h.uint32(this.actionX[id]).uint32(this.actionY[id]).uint32(this.asleep[id]);
      h.uint32(this.exploreX[id]).uint32(this.exploreY[id]).uint32(this.exploring[id]);
      for (const f of fields) {
        one[0] = f[id];
        h.typedArray(one);
      }
      h.typedArray(this.inventory.subarray(id * this.resourceSlots, (id + 1) * this.resourceSlots));
      h.typedArray(this.path[id].subarray(0, this.pathLength[id] * 2));
      h.uint32(this.pathIndex[id]);
      h.typedArray(this.rng[id].s);
    }
  }
}
