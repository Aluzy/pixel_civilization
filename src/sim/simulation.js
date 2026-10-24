import aiGoals from '../../data/ai-goals.json' with { type: 'json' };
import resourceData from '../../data/resources.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { ACTION_NAMES, Action } from './agents/action-types.js';
import { AgentStore } from './agents/agent-store.js';
import { MAX_RADIUS, Navigator } from './agents/navigation.js';
import { WATER_SUBJECT } from './agents/memory.js';
import { buildGoalTable } from './ai/utility.js';
import { describeTick, phaseIndexAt } from './core/clock.js';
import { EventLog, EventType } from './core/events.js';
import { createHasher, hashCoords } from './core/hash.js';
import { createRng, seedToKey } from './core/rng.js';
import { SYSTEMS } from './systems/index.js';
import { ChunkStore, findSpawn } from './world/chunk-store.js';
import { WorldGenerator } from './world/generator.js';
import { buildWorldTables } from './world/world-data.js';

/** Indexed world tables built from data/, shared by every simulation (read-only). */
export const WORLD_TABLES = buildWorldTables(worldData, resourceData);

/** Compiled utility goals from data/ai-goals.json (read-only). */
export const GOAL_TABLE = buildGoalTable(aiGoals);

/** Independent random streams, one per subsystem, so that systems cannot disturb each other. */
export const RNG_STREAMS = Object.freeze(['world', 'threats', 'ai', 'social', 'lifecycle']);

/**
 * @typedef {object} Regrowth
 * @property {number} tick - When the resource comes back.
 * @property {number} x
 * @property {number} y
 * @property {number} resource
 * @property {number} quantity
 */

/**
 * Everything that defines a game at a given tick (hashed by {@link Simulation#hash}).
 * @typedef {object} SimState
 * @property {number} seedKey - 32-bit key derived from the seed.
 * @property {number} tick - Number of ticks simulated so far.
 * @property {Record<string, import('./core/rng.js').Rng>} rng - One stream per subsystem.
 * @property {object} balance - Content of data/balance.json.
 * @property {ChunkStore} world - Tiles, generated on demand.
 * @property {{ x: number, y: number }} spawn - Where the first individual appears.
 * @property {AgentStore} agents
 * @property {EventLog} events
 * @property {Regrowth[]} regrowth - Sorted by tick.
 */

/**
 * Read-only tables, per-tick derived values and scratch buffers shared by the systems.
 * Rebuilt from data and state; never part of the hash.
 * @typedef {object} SimContext
 * @property {object} balance
 * @property {import('./world/world-data.js').WorldTables} tables
 * @property {import('./ai/utility.js').GoalTable} goals
 * @property {string[]} goalKinds - Goal id per goal index.
 * @property {Record<string, number>} goalIndex - Goal index per goal id.
 * @property {AgentStore} agents
 * @property {Navigator} nav
 * @property {Float64Array} biomeSpeed
 * @property {number} waterBiome
 * @property {Uint8Array} edible - 1 per edible resource id.
 * @property {Float64Array} nutrition - Hunger removed per unit, per resource id.
 * @property {Float64Array} harvestTicks - Base ticks to harvest one unit, per resource id.
 * @property {number} harvestForceScale
 * @property {number} ticksPerSecond
 * @property {{ hunger: number, thirst: number, fatigue: number, fatigueRecovery: number,
 *   curiosity: number, curiosityRelief: number, damage: number, regen: number }} rates - Per tick.
 * @property {Float64Array} darknessByPhase
 * @property {number} nightPhase
 * @property {number} darkness - Current light level input, 0 (day) to 1 (night).
 * @property {boolean} dark - True at night (reduced perception).
 * @property {Float64Array} inputs - Scratch utility inputs.
 * @property {Float64Array} scores - Scratch utility scores.
 * @property {import('./agents/behaviors.js').Plan} plan - Scratch plan.
 * @property {(id: number) => number} capacity - Units an agent can carry.
 * @property {number} placeTau - Initial memory time constant, in ticks.
 * @property {number} maxTau - Longest memory time constant, in ticks.
 * @property {number} staleTicks - Age at which an explored area counts as unknown again.
 * @property {Uint8Array} waterSubjects - Memory subject mask for water.
 * @property {number} firstEdible - A food subject, for "searching for food" events.
 * @property {Int32Array} nearestBySubject - Scratch: nearest window cell per resource.
 * @property {Int32Array} exploreTarget - Scratch: x, y of a chosen exploration target.
 * @property {Int32Array} recallTarget - Scratch: x, y where a memory is believed to be.
 * @property {(state: SimState, x: number, y: number, resource: number) => void} scheduleRegrowth
 */

/**
 * @param {number} slots - Number of memory subjects (resources + water).
 * @returns {Uint8Array} Subject mask selecting water only.
 */
function waterMask(slots) {
  const mask = new Uint8Array(slots);
  mask[WATER_SUBJECT] = 1;
  return mask;
}

/**
 * Builds the shared context for a simulation.
 * @param {object} balance
 * @param {import('./world/world-data.js').WorldTables} tables
 * @param {AgentStore} agents
 * @param {number} seedKey
 * @returns {SimContext}
 */
function buildContext(balance, tables, agents, seedKey) {
  const time = balance.time;
  const perTick = (perDay) => perDay / time.ticksPerDay;
  const n = balance.needs;
  const resourceSlots = tables.resources.length + 1;
  const edible = new Uint8Array(resourceSlots);
  const nutrition = new Float64Array(resourceSlots);
  const harvestTicks = new Float64Array(resourceSlots);
  const regrowTicks = new Int32Array(resourceSlots);
  tables.resources.forEach((r, i) => {
    const id = i + 1;
    if (r.nutrition > 0) {
      edible[id] = 1;
      nutrition[id] = r.nutrition;
    }
    harvestTicks[id] = r.harvestTicks ?? 1;
    regrowTicks[id] = r.renewable ? (r.regrowTicks ?? 0) : 0;
  });
  const biomeSpeed = Float64Array.from(tables.biomes.map((b) => b.speed ?? 1));
  const waterBiome = tables.biomes.findIndex((b) => b.id === 'water');
  const goalKinds = GOAL_TABLE.goals.map((g) => g.id);
  const goalIndex = Object.fromEntries(goalKinds.map((id, i) => [id, i]));
  if (goalIndex.sleep === undefined) throw new Error('data/ai-goals.json needs a "sleep" goal');
  const phases = time.phases.map((p) => p.name);
  const darknessByPhase = Float64Array.from(phases.map((p) => worldData.darkness[p] ?? 0));
  const phase0 = phaseIndexAt(0, time);
  return {
    balance,
    tables,
    goals: GOAL_TABLE,
    goalKinds,
    goalIndex,
    agents,
    nav: new Navigator({ biomeSpeed, waterBiome }),
    biomeSpeed,
    waterBiome,
    edible,
    nutrition,
    harvestTicks,
    harvestForceScale: balance.actions.harvestForceScale,
    ticksPerSecond: time.ticksPerSecond,
    rates: {
      hunger: perTick(n.hungerPerDay),
      thirst: perTick(n.thirstPerDay),
      fatigue: perTick(n.fatiguePerDayAwake),
      fatigueRecovery: perTick(n.fatigueRecoveryPerDayAsleep),
      curiosity: perTick(n.curiosityPerDay),
      curiosityRelief: perTick(n.curiosityReliefPerDayExploring),
      damage: perTick(n.damagePerDayPerCriticalNeed),
      regen: perTick(n.regenPerDay),
    },
    darknessByPhase,
    nightPhase: phases.indexOf('night'),
    darkness: darknessByPhase[phase0],
    dark: phases.indexOf('night') === phase0,
    inputs: new Float64Array(8),
    scores: new Float64Array(GOAL_TABLE.goals.length),
    plan: { action: 0, x: 0, y: 0, note: 0 },
    capacity: (id) => agents.force[id] * balance.agent.carryPerForce,
    placeTau: balance.memory.placeTauDays * time.ticksPerDay,
    maxTau: balance.memory.maxTauDays * time.ticksPerDay,
    staleTicks: balance.exploration.staleDays * time.ticksPerDay,
    waterSubjects: waterMask(resourceSlots),
    firstEdible: Math.max(0, edible.indexOf(1)),
    nearestBySubject: new Int32Array(resourceSlots),
    exploreTarget: new Int32Array(2),
    recallTarget: new Int32Array(2),
    scheduleRegrowth(state, x, y, resource) {
      const delay = regrowTicks[resource];
      if (delay <= 0) return;
      const [qMin, qMax] = tables.resources[resource - 1].quantity;
      const q = qMin + (hashCoords(seedKey, x, y, state.tick) % (qMax - qMin + 1));
      const entry = { tick: state.tick + delay, x, y, resource, quantity: q };
      const queue = state.regrowth;
      let i = queue.length;
      while (i > 0 && queue[i - 1].tick > entry.tick) i--;
      queue.splice(i, 0, entry);
    },
  };
}

/**
 * Deterministic simulation: same seed and same number of ticks give the same state.
 * Contains no real-time logic; pacing is done by the host (src/worker).
 */
export class Simulation {
  /**
   * @param {object} options
   * @param {number | string} options.seed
   * @param {object} options.balance - Content of data/balance.json.
   * @param {import('./world/world-data.js').WorldTables} [options.tables]
   */
  constructor({ seed, balance, tables = WORLD_TABLES }) {
    const root = createRng(seed);
    /** @type {Record<string, import('./core/rng.js').Rng>} */
    const rng = {};
    for (const name of RNG_STREAMS) rng[name] = root.fork(name);
    const world = new ChunkStore(new WorldGenerator(rng.world.fork('generator'), tables));
    const spawn = findSpawn(world, tables);
    if (balance.agent.start.perception > MAX_RADIUS) throw new Error('Perception above maximum');
    const agents = new AgentStore({
      max: balance.agent.maxEntities,
      resourceCount: tables.resources.length,
      journalSize: balance.ai.journalSize,
      exploration: balance.exploration,
    });
    const seedKey = seedToKey(seed);
    /** @type {SimState} */
    this.state = {
      seedKey,
      tick: 0,
      rng,
      balance,
      world,
      spawn,
      agents,
      events: new EventLog(),
      regrowth: [],
    };
    /** @type {SimContext} */
    this.ctx = buildContext(balance, tables, agents, seedKey);
    this.tables = tables;

    const first = agents.create({
      x: spawn.x,
      y: spawn.y,
      tick: 0,
      attributes: balance.agent.start,
      needs: balance.agent.startNeeds,
      rng: rng.ai.fork('agent-0-0'),
    });
    this.state.events.push(0, EventType.BIRTH, first, spawn.x, spawn.y);
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

  /** @returns {AgentStore} */
  get agents() {
    return this.state.agents;
  }

  /** @returns {EventLog} */
  get events() {
    return this.state.events;
  }

  /**
   * Runs `count` ticks. Batching never changes the result.
   * @param {number} [count=1]
   * @returns {void}
   */
  step(count = 1) {
    const state = this.state;
    const ctx = this.ctx;
    for (let i = 0; i < count; i++) {
      for (let s = 0; s < SYSTEMS.length; s++) SYSTEMS[s](state, ctx);
    }
  }

  /** @returns {import('./core/clock.js').TickInfo} */
  time() {
    return describeTick(this.state.tick, this.state.balance.time);
  }

  /**
   * Positions of alive agents, interpolated along their path, for the renderer.
   * @returns {{ id: number, x: number, y: number, asleep: boolean }[]}
   */
  agentPositions() {
    const a = this.state.agents;
    const out = [];
    for (let id = 0; id < a.highWater; id++) {
      if (a.alive[id] !== 1) continue;
      let x = a.x[id];
      let y = a.y[id];
      const i = a.pathIndex[id];
      if (a.action[id] === Action.MOVE && i < a.pathLength[id]) {
        const t = Math.min(1, a.moveProgress[id]);
        x += (a.path[id][i * 2] - x) * t;
        y += (a.path[id][i * 2 + 1] - y) * t;
      }
      out.push({ id, x, y, asleep: a.asleep[id] === 1 });
    }
    return out;
  }

  /**
   * Full description of one agent for the inspector, or null if it does not exist.
   * @param {number} id
   * @param {boolean} [withMap=false] - Include the explored cells (for the memory layer).
   * @returns {object | null}
   */
  describeAgent(id, withMap = false) {
    const a = this.state.agents;
    if (id < 0 || id >= a.highWater || a.alive[id] !== 1) return null;
    const goals = this.ctx.goals.goals;
    const inventory = [];
    for (let r = 1; r < a.resourceSlots; r++) {
      const n = a.carried(id, r);
      if (n > 0) inventory.push({ resource: r, count: n });
    }
    const memory = a.memory[id];
    const tick = this.state.tick;
    const remembered = [];
    for (let i = 0; i < memory.count; i++) {
      remembered.push({
        subject: memory.subject[i],
        x: memory.x[i],
        y: memory.y[i],
        quantity: memory.quantity[i],
        seen: memory.seen[i],
        strength: memory.strength(i, tick),
      });
    }
    remembered.sort((p, q) => q.strength - p.strength);
    return {
      id,
      x: a.x[id],
      y: a.y[id],
      age: this.state.tick - a.bornTick[id],
      hp: a.hp[id],
      maxHp: a.maxHp[id],
      needs: {
        hunger: a.hunger[id],
        thirst: a.thirst[id],
        fatigue: a.fatigue[id],
        curiosity: a.curiosity[id],
      },
      attributes: {
        force: a.force[id],
        speed: a.speed[id],
        attack: a.attack[id],
        defense: a.defense[id],
        perception: a.perception[id],
        memory: a.memorySize[id],
      },
      inventory,
      goal: a.goal[id] >= 0 ? goals[a.goal[id]].name : '—',
      action: ACTION_NAMES[a.action[id]],
      asleep: a.asleep[id] === 1,
      exploration: withMap
        ? { cellSize: a.explored[id].cellSize, cells: a.explored[id].entries() }
        : null,
      memory: remembered,
      memoryCapacity: memory.capacity,
      knownWater: remembered.filter((p) => p.subject === WATER_SUBJECT),
      knownFood: remembered.filter((p) => this.ctx.edible[p.subject] === 1),
      journal: a.journal[id].latest(6).map((e) => ({
        ...e,
        goal: goals[e.goal]?.name ?? '—',
        top: e.top
          .filter((g) => g >= 0)
          .map((g, k) => ({ goal: goals[g].name, score: e.topScore[k] })),
        action: ACTION_NAMES[e.action],
      })),
    };
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
    s.agents.hashInto(h);
    h.uint32(s.events.count);
    for (const e of s.events.events) h.uint32(e.tick).string(e.type).uint32(e.agent);
    for (const g of s.regrowth) h.uint32(g.tick).uint32(g.x).uint32(g.y).uint32(g.resource);
    return h.hex();
  }
}
