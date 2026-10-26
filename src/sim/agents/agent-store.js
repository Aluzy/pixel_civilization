import { RecipeBook } from '../crafting/recipe-book.js';
import { Action } from './action-types.js';
import { ExplorationMap } from './exploration-map.js';
import { Journal } from './journal.js';
import { Memory } from './memory.js';
import { SocialModel } from './social-model.js';

/** Kinds of chronicle events about memory, each with its own cooldown per agent. */
export const MEMORY_EVENT_KINDS = 5;

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
   * @param {number} options.goodCount - Slots per inventory (good ids, 0 unused).
   * @param {number} [options.recipeCount=0]
   * @param {number} [options.failureSlots=1]
   * @param {number} [options.sheets=4] - Social sheets per agent.
   * @param {number} options.journalSize
   * @param {{ capacity: number, cellSize: number }} options.exploration
   * @param {Float64Array} [options.geneStart] - Founder value of each gene of the genome.
   * @param {number} [options.dangerSlots=8] - Zones whose danger an agent keeps in mind.
   * @param {number} [options.jobCount=0] - Jobs of data/jobs.json.
   * @param {number} [options.tradeSlots=1] - Recent trades kept per agent (inspector).
   */
  constructor({
    max,
    goodCount,
    recipeCount = 0,
    failureSlots = 1,
    journalSize,
    exploration,
    sheets = 4,
    geneStart = new Float64Array(0),
    dangerSlots = 8,
    jobCount = 0,
    tradeSlots = 1,
  }) {
    this.sheets = sheets;
    this.geneStart = geneStart;
    this.geneCount = geneStart.length;
    /** Decision genome, `geneCount` per agent (docs/design/06-ia.md, couche 8). */
    this.genes = new Float64Array(max * geneStart.length);
    // Experience (docs/design/06-ia.md, couche 7): danger of zones where it was attacked
    // (attacks and passes), current zone, and learnt ticks per unit delivered of each good.
    this.dangerSlots = dangerSlots;
    this.dangerX = new Int32Array(max * dangerSlots);
    this.dangerY = new Int32Array(max * dangerSlots);
    this.dangerAttacks = new Uint16Array(max * dangerSlots);
    this.dangerPasses = new Uint16Array(max * dangerSlots);
    this.dangerCount = new Uint8Array(max);
    this.zoneX = new Int32Array(max);
    this.zoneY = new Int32Array(max);
    this.costPerUnit = new Float64Array(max * goodCount);
    // Safety (docs/design/16-guerre-et-forteresses.md): fear 0 to 100, combat skill 0 to 1, and
    // the predator (≥ 0) or den (−2 − index) it is fighting.
    this.fear = new Float64Array(max);
    this.combatSkill = new Float64Array(max);
    this.attackTarget = new Int32Array(max);
    this.attackCooldown = new Int32Array(max);
    // Economy (docs/design/14-economie.md): écus, earned today, chosen job (-1 none) and since
    // when, observed net income and days worked per job, prices seen at the counter, recent
    // trades.
    this.jobCount = jobCount;
    this.coins = new Int32Array(max);
    this.earnedToday = new Int32Array(max);
    /** Écus spent today on the inputs of its trade (the ingredients of a baker). */
    this.spentToday = new Int32Array(max);
    this.job = new Int8Array(max).fill(-1);
    this.jobSince = new Int32Array(max);
    this.jobIncome = new Float64Array(max * Math.max(1, jobCount));
    this.jobDays = new Uint16Array(max * Math.max(1, jobCount));
    this.priceSeen = new Float64Array(max * goodCount);
    this.tradeSlots = tradeSlots;
    this.tradeTick = new Int32Array(max * tradeSlots);
    this.tradeGood = new Int32Array(max * tradeSlots);
    this.tradeUnits = new Int32Array(max * tradeSlots);
    this.tradeCoins = new Int32Array(max * tradeSlots);
    this.tradeNext = new Uint8Array(max);
    /** A sale it prepares: the good it gathers to sell at the counter (0 none), how many, since. */
    this.saleGood = new Uint8Array(max);
    this.saleAmount = new Uint16Array(max);
    this.saleTick = new Int32Array(max);
    /** Members of its colony when it last read the blackboard, and provisions taken to migrate. */
    this.crowdSeen = new Uint16Array(max);
    this.provisioned = new Uint8Array(max);
    // A merchant's caravan: colony it goes to (-1 none), 1 going there, 2 coming back, the good it
    // carries to sell, and the prices it saw at that colony's counter.
    this.caravanTo = new Int8Array(max).fill(-1);
    this.caravanLeg = new Uint8Array(max);
    this.caravanGood = new Uint8Array(max);
    this.caravanPrice = new Float64Array(max * goodCount);
    /** Tile of the wall segment (gate, tower) it builds, and 1 while it stands on a tower. */
    this.siteX = new Int32Array(max);
    this.siteY = new Int32Array(max);
    this.onTower = new Uint8Array(max);
    this.max = max;
    this.goodSlots = goodCount;
    this.recipeCount = recipeCount;
    this.failureSlots = failureSlots;
    this.journalSize = journalSize;
    this.exploration = exploration;
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
    /** Ticks spent waiting for the next tile of its path to be freed by another agent. */
    this.blocked = u8();
    /**
     * World whose tiles record who stands where (set by the simulation): two agents never share
     * a tile.
     * @type {import('../world/chunk-store.js').ChunkStore | null}
     */
    this.world = null;
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
    // Carried units per good id, and the tick each good was last picked up when none was carried.
    this.inventory = new Uint16Array(max * goodCount);
    this.acquiredTick = new Int32Array(max * goodCount);
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
    // Crafting: recipe being made, trial being tried, resource being harvested and up to how many.
    this.craftRecipe = new Int16Array(max);
    this.trialStation = i32();
    this.trialMask = i32();
    this.harvestGood = u8();
    this.harvestUntil = new Uint16Array(max);
    // Long-term project (HTN): index of the project and of its current step, -1 = none.
    this.project = new Int8Array(max).fill(-1);
    this.projectStep = new Int8Array(max).fill(-1);
    // Combat and safety.
    this.attackedTick = i32();
    /** Last imagined risk of fighting a predator (mental simulation), for the inspector. */
    this.fightRisk = f64();
    this.kills = new Uint16Array(max);
    /** First tick each recipe was made, per agent and recipe (-1 = never). */
    this.firstMade = new Int32Array(max * Math.max(1, recipeCount));
    /** @type {RecipeBook[]} Recipes known and failed trials remembered. */
    this.recipes = [];
    // Lineage, colony and replication.
    this.colony = new Int16Array(max).fill(-1);
    this.parent = i32();
    this.generation = new Uint16Array(max);
    this.children = new Uint16Array(max);
    /** Last tick hunger was at or above the replication threshold. */
    this.hungryTick = i32();
    /** Tick of its last meal: health holds only with regular meals. */
    this.mealTick = i32();
    /** Last tick health went down. */
    this.hurtTick = i32();
    this.prevHp = f64();
    this.lastReplication = i32();
    // Colony task: project slot (-1 none), good to bring, amount, when reserved, building.
    this.taskProject = new Int8Array(max).fill(-1);
    this.taskGood = u8();
    this.taskAmount = new Uint16Array(max);
    this.taskTick = i32();
    this.taskBuild = u8();
    /** Last tick the agent read and wrote the colony blackboard. */
    this.boardTick = i32();
    /** Food it saw in the pantry at that time, and whether there were open tasks (beliefs). */
    this.pantrySeen = new Uint16Array(max);
    this.tasksSeen = u8();
    // Farming (docs/design/13-agriculture-cuisine.md): the plot of its farm job (-1 none), the job,
    // and whether it saw free farm jobs on the blackboard.
    this.farmPlot = new Int32Array(max).fill(-1);
    this.farmJob = u8();
    this.farmSeen = u8();
    /** Whether the pantry was running down when it last looked at it. */
    this.pantryFalling = u8();
    /** Recipe of the batch it cooks (-1 none). */
    this.cookRecipe = new Int16Array(max).fill(-1);
    /** A good it guessed can be used alone, bare-handed (a seed in the ground), or 0. */
    this.hint = new Int16Array(max);
    /** A use it guessed for something it made (a researcher's idea): station and trial mask. */
    this.ideaStation = new Int8Array(max).fill(-1);
    this.ideaMask = new Int32Array(max);
    this.ideaTick = new Int32Array(max);
    /** Units gathered per good, crafts and builds: habits from which roles emerge. */
    this.gathered = new Uint16Array(max * goodCount);
    this.builds = new Uint16Array(max);
    this.delivers = new Uint16Array(max);
    /** Age at which each agent dies of old age, in ticks. */
    this.lifespan = new Int32Array(max);
    /** What it saw written in its colony's library (bit set of recipes), and whether it went. */
    this.librarySeen = i32();
    /** Weakest harmony component of its colony, as read on the blackboard (-1: none). */
    this.focusSeen = new Int8Array(max);
    /** Tick the newest map seen in the library was made, -1 if none. */
    this.mapSeen = i32();
    this.libraryVisited = u8();
    /** @type {SocialModel[]} What each agent believes about the others. */
    this.social = [];
    /**
     * Last plan of each agent, for the inspector only (derived from beliefs, never decides).
     * @type {(import('../ai/planner.js').PlanResult | null)[]}
     */
    this.lastPlan = [];
    // Path of absolute cells, as x, y pairs.
    /** @type {Int32Array[]} */
    this.path = [];
    this.pathLength = new Uint16Array(max);
    this.pathIndex = new Uint16Array(max);
    /** @type {Memory[]} Places each agent remembers (capacity = its Mémoire attribute). */
    this.memory = [];
    /** @type {ExplorationMap[]} Where each agent has been, and when. */
    this.explored = [];
    /** Last tick each kind of memory event was reported, to keep the chronicle readable. */
    this.memoryEventTick = new Int32Array(max * MEMORY_EVENT_KINDS);
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
   * @param {number} [spec.colony=-1]
   * @param {number} [spec.parent=-1]
   * @param {number} [spec.generation=0]
   * @param {number} [spec.lifespan] - Age at which it dies of old age, in ticks.
   * @returns {number}
   */
  create({
    x,
    y,
    tick,
    attributes,
    needs,
    rng,
    colony = -1,
    parent = -1,
    generation = 0,
    lifespan = 0x7fffffff,
  }) {
    let id = 0;
    while (id < this.max && this.alive[id] === 1) id++;
    if (id >= this.max) throw new Error('Too many agents');
    if (id >= this.highWater) this.highWater = id + 1;
    this.alive[id] = 1;
    this.aliveCount++;
    this.bornTick[id] = tick;
    this.x[id] = x;
    this.y[id] = y;
    if (this.world) this.world.setOccupant(x, y, id);
    this.moveProgress[id] = 0;
    this.blocked[id] = 0;
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
    this.inventory.fill(0, id * this.goodSlots, (id + 1) * this.goodSlots);
    this.acquiredTick.fill(-1e9, id * this.goodSlots, (id + 1) * this.goodSlots);
    this.goal[id] = -1;
    this.goalSince[id] = tick;
    this.action[id] = Action.NONE;
    this.thenAction[id] = Action.NONE;
    this.actionProgress[id] = 0;
    this.asleep[id] = 0;
    this.needsDecision[id] = 1;
    this.exploring[id] = 0;
    this.flags[id] = 0;
    this.craftRecipe[id] = -1;
    this.harvestGood[id] = 0;
    this.harvestUntil[id] = 0;
    this.project[id] = -1;
    this.projectStep[id] = -1;
    this.attackedTick[id] = -1e9;
    this.fightRisk[id] = 0;
    this.kills[id] = 0;
    const rc = Math.max(1, this.recipeCount);
    this.firstMade.fill(-1, id * rc, (id + 1) * rc);
    this.recipes[id] = new RecipeBook(this.recipeCount, this.failureSlots);
    this.lastPlan[id] = null;
    this.colony[id] = colony;
    this.parent[id] = parent;
    this.generation[id] = generation;
    this.children[id] = 0;
    this.hungryTick[id] = tick;
    this.mealTick[id] = tick;
    this.hurtTick[id] = tick;
    this.prevHp[id] = attributes.hp;
    this.lastReplication[id] = tick;
    this.taskProject[id] = -1;
    this.taskGood[id] = 0;
    this.taskAmount[id] = 0;
    this.taskTick[id] = 0;
    this.taskBuild[id] = 0;
    this.boardTick[id] = -1e9;
    this.pantrySeen[id] = 0;
    this.tasksSeen[id] = 0;
    this.farmPlot[id] = -1;
    this.farmJob[id] = 0;
    this.farmSeen[id] = 0;
    this.pantryFalling[id] = 0;
    this.cookRecipe[id] = -1;
    this.hint[id] = 0;
    this.ideaStation[id] = -1;
    this.ideaMask[id] = 0;
    this.ideaTick[id] = 0;
    this.gathered.fill(0, id * this.goodSlots, (id + 1) * this.goodSlots);
    this.builds[id] = 0;
    this.delivers[id] = 0;
    this.social[id] = new SocialModel(this.sheets);
    this.lifespan[id] = lifespan;
    this.genes.set(this.geneStart, id * this.geneCount);
    this.dangerCount[id] = 0;
    this.zoneX[id] = 0x7fffffff;
    this.zoneY[id] = 0x7fffffff;
    this.costPerUnit.fill(0, id * this.goodSlots, (id + 1) * this.goodSlots);
    this.fear[id] = 0;
    this.combatSkill[id] = 0;
    this.attackTarget[id] = -1;
    this.attackCooldown[id] = 0;
    this.coins[id] = 0;
    this.earnedToday[id] = 0;
    this.spentToday[id] = 0;
    this.job[id] = -1;
    this.jobSince[id] = tick;
    const jc = Math.max(1, this.jobCount);
    this.jobIncome.fill(0, id * jc, (id + 1) * jc);
    this.jobDays.fill(0, id * jc, (id + 1) * jc);
    this.priceSeen.fill(0, id * this.goodSlots, (id + 1) * this.goodSlots);
    const ts = this.tradeSlots;
    this.tradeTick.fill(-1, id * ts, (id + 1) * ts);
    this.tradeNext[id] = 0;
    this.saleGood[id] = 0;
    this.saleAmount[id] = 0;
    this.saleTick[id] = 0;
    this.crowdSeen[id] = 0;
    this.provisioned[id] = 0;
    this.caravanTo[id] = -1;
    this.caravanLeg[id] = 0;
    this.caravanGood[id] = 0;
    this.caravanPrice.fill(0, id * this.goodSlots, (id + 1) * this.goodSlots);
    // No building site yet (far from anything: never a real tile).
    this.siteX[id] = -0x80000000;
    this.siteY[id] = 0;
    this.onTower[id] = 0;
    this.librarySeen[id] = 0;
    this.mapSeen[id] = -1;
    this.focusSeen[id] = -1;
    this.libraryVisited[id] = 0;
    if (!this.path[id]) this.path[id] = new Int32Array(PATH_MAX * 2);
    this.pathLength[id] = 0;
    this.pathIndex[id] = 0;
    this.memory[id] = new Memory(attributes.memory);
    this.explored[id] = new ExplorationMap(this.exploration.capacity, this.exploration.cellSize);
    this.memoryEventTick.fill(-1e9, id * MEMORY_EVENT_KINDS, (id + 1) * MEMORY_EVENT_KINDS);
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
    if (this.world) this.world.setOccupant(this.x[id], this.y[id], -1 - id);
    this.asleep[id] = 0;
    this.action[id] = Action.NONE;
  }

  /**
   * Moves the agent to (x, y), which the caller found free.
   * @param {number} id
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  place(id, x, y) {
    if (this.world) {
      this.world.setOccupant(this.x[id], this.y[id], -1 - id);
      this.world.setOccupant(x, y, id);
    }
    this.x[id] = x;
    this.y[id] = y;
  }

  /**
   * Carried units of a good.
   * @param {number} id
   * @param {number} good
   * @returns {number}
   */
  carried(id, good) {
    return this.inventory[id * this.goodSlots + good];
  }

  /**
   * @param {number} id
   * @param {number} good
   * @param {number} delta
   * @param {number} [tick] - When given, a good carried for the first time is dated.
   * @returns {void}
   */
  addCarried(id, good, delta, tick) {
    const i = id * this.goodSlots + good;
    if (tick !== undefined && this.inventory[i] === 0 && delta > 0) this.acquiredTick[i] = tick;
    this.inventory[i] += delta;
  }

  /**
   * @param {number} id
   * @param {number} recipe
   * @returns {number} First tick the agent made this recipe, -1 if never.
   */
  madeAt(id, recipe) {
    return this.firstMade[id * Math.max(1, this.recipeCount) + recipe];
  }

  /**
   * @param {number} id
   * @param {number} recipe
   * @param {number} tick
   * @returns {boolean} True if it was the first time.
   */
  recordMade(id, recipe, tick) {
    const i = id * Math.max(1, this.recipeCount) + recipe;
    if (this.firstMade[i] >= 0) return false;
    this.firstMade[i] = tick;
    return true;
  }

  /**
   * @param {number} id
   * @returns {number} Total units carried.
   */
  carriedTotal(id) {
    let n = 0;
    const base = id * this.goodSlots;
    for (let g = 1; g < this.goodSlots; g++) n += this.inventory[base + g];
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
      this.fightRisk,
      this.fear,
      this.combatSkill,
    ];
    const one = new Float64Array(1);
    for (let id = 0; id < this.highWater; id++) {
      if (this.alive[id] !== 1) continue;
      h.uint32(id).uint32(this.x[id]).uint32(this.y[id]);
      h.uint32(this.goal[id] & 0xff);
      h.uint32(this.action[id]).uint32(this.thenAction[id]);
      h.uint32(this.actionX[id]).uint32(this.actionY[id]).uint32(this.asleep[id]);
      h.uint32(this.exploreX[id]).uint32(this.exploreY[id]).uint32(this.exploring[id]);
      for (const f of fields) {
        one[0] = f[id];
        h.typedArray(one);
      }
      const g0 = id * this.goodSlots;
      h.typedArray(this.inventory.subarray(g0, g0 + this.goodSlots));
      h.typedArray(this.acquiredTick.subarray(g0, g0 + this.goodSlots));
      h.uint32(this.craftRecipe[id] & 0xffff).uint32(this.trialStation[id]);
      h.uint32(this.trialMask[id]).uint32(this.harvestGood[id]).uint32(this.harvestUntil[id]);
      h.uint32(this.project[id] & 0xff).uint32(this.projectStep[id] & 0xff);
      h.uint32(this.attackedTick[id]).uint32(this.kills[id]);
      const rc = Math.max(1, this.recipeCount);
      h.typedArray(this.firstMade.subarray(id * rc, (id + 1) * rc));
      this.recipes[id].hashInto(h);
      h.uint32(this.colony[id] & 0xffff)
        .uint32(this.parent[id])
        .uint32(this.generation[id]);
      h.uint32(this.children[id]).uint32(this.hungryTick[id]).uint32(this.hurtTick[id]);
      h.uint32(this.mealTick[id]);
      h.uint32(this.lastReplication[id]).uint32(this.taskProject[id] & 0xff);
      h.uint32(this.taskGood[id]).uint32(this.taskAmount[id]).uint32(this.taskTick[id]);
      h.uint32(this.taskBuild[id]).uint32(this.boardTick[id]);
      h.uint32(this.pantrySeen[id]).uint32(this.tasksSeen[id]);
      h.uint32(this.farmPlot[id]).uint32(this.farmJob[id]).uint32(this.farmSeen[id]);
      h.uint32(this.cookRecipe[id] & 0xffff)
        .uint32(this.hint[id])
        .uint32(this.ideaStation[id] & 0xff)
        .uint32(this.ideaMask[id])
        .uint32(this.ideaTick[id])
        .uint32(this.pantryFalling[id]);
      h.typedArray(this.gathered.subarray(g0, g0 + this.goodSlots));
      h.uint32(this.builds[id]).uint32(this.delivers[id]);
      this.social[id].hashInto(h);
      h.uint32(this.lifespan[id]).uint32(this.librarySeen[id]).uint32(this.libraryVisited[id]);
      h.uint32(this.mapSeen[id]).uint32(this.focusSeen[id] & 0xff);
      h.uint32(this.attackTarget[id]).uint32(this.attackCooldown[id]);
      h.typedArray(this.genes.subarray(id * this.geneCount, (id + 1) * this.geneCount));
      const d0 = id * this.dangerSlots;
      const d1 = d0 + this.dangerCount[id];
      h.uint32(this.dangerCount[id]).uint32(this.zoneX[id]).uint32(this.zoneY[id]);
      h.typedArray(this.dangerX.subarray(d0, d1)).typedArray(this.dangerY.subarray(d0, d1));
      h.typedArray(this.dangerAttacks.subarray(d0, d1)).typedArray(
        this.dangerPasses.subarray(d0, d1),
      );
      h.typedArray(this.costPerUnit.subarray(g0, g0 + this.goodSlots));
      const jc = Math.max(1, this.jobCount);
      h.uint32(this.coins[id])
        .uint32(this.earnedToday[id])
        .uint32(this.job[id] & 0xff);
      h.uint32(this.jobSince[id]).typedArray(this.jobDays.subarray(id * jc, (id + 1) * jc));
      h.typedArray(this.jobIncome.subarray(id * jc, (id + 1) * jc));
      h.typedArray(this.priceSeen.subarray(g0, g0 + this.goodSlots));
      const t0 = id * this.tradeSlots;
      const t1 = t0 + this.tradeSlots;
      h.typedArray(this.tradeTick.subarray(t0, t1)).typedArray(this.tradeGood.subarray(t0, t1));
      h.typedArray(this.tradeUnits.subarray(t0, t1)).typedArray(this.tradeCoins.subarray(t0, t1));
      h.uint32(this.tradeNext[id]).uint32(this.saleGood[id]).uint32(this.saleAmount[id]);
      h.uint32(this.saleTick[id]).uint32(this.crowdSeen[id]).uint32(this.provisioned[id]);
      h.uint32(this.caravanTo[id] & 0xff)
        .uint32(this.caravanLeg[id])
        .uint32(this.caravanGood[id]);
      h.typedArray(this.caravanPrice.subarray(g0, g0 + this.goodSlots));
      h.uint32(this.siteX[id]).uint32(this.siteY[id]).uint32(this.onTower[id]);
      h.typedArray(this.path[id].subarray(0, this.pathLength[id] * 2));
      h.uint32(this.pathIndex[id]);
      h.typedArray(this.rng[id].s);
      this.memory[id].hashInto(h);
      this.explored[id].hashInto(h);
    }
  }
}
