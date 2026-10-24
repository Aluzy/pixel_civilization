import { BARE_HANDS } from '../crafting/catalog.js';

/** Kinds of plan steps, in execution order of a plan. */
export const Step = Object.freeze({
  NONE: 0,
  EXPLORE: 1, // Find a place holding the resource (arg).
  GATHER: 2, // Carry at least `count` units of the resource (arg).
  CRAFT: 3, // Make the recipe (arg), `count` times.
  BUILD: 4, // Build the structure of the recipe (arg).
});

/** Outcome of a planning request. */
export const PlanStatus = Object.freeze({
  DONE: 0, // The target is already satisfied.
  OK: 1, // A plan was found.
  NO_PLAN: 2, // No plan with what the agent knows (a recipe is unknown).
  BUDGET: 3, // Search stopped by the work budget.
});

/**
 * @typedef {object} PlanStep
 * @property {number} kind - {@link Step}.
 * @property {number} arg - Resource id or recipe index.
 * @property {number} count
 */

/**
 * @typedef {object} PlanResult
 * @property {number} status - {@link PlanStatus}.
 * @property {ReadonlyArray<PlanStep>} steps - In execution order.
 * @property {number} cost - Estimated ticks.
 * @property {number} nodes - Work units spent (nodes expanded).
 */

/**
 * @typedef {object} PlanTarget
 * @property {number} id - Small integer, part of the cache key.
 * @property {Uint8Array} goods - 1 for each good that satisfies the target.
 * @property {Uint8Array} structures - 1 for each structure code that satisfies the target.
 */

const EMPTY = Object.freeze([]);
const DONE_RESULT = Object.freeze({ status: PlanStatus.DONE, steps: EMPTY, cost: 0, nodes: 0 });
const CACHE_MAX = 1024;

/**
 * GOAP planner (docs/design/06-ia.md, couche 2): A* search backwards from the target over the
 * agent's beliefs (carried goods, known recipes, known stations, known resource places).
 * Each node holds what is still required; resolving the first unmet requirement creates children
 * (gather or explore for a resource, craft with a known recipe, build a station). Costs are
 * estimated in ticks without distances, so a plan is a pure function of the beliefs: plans are
 * memoised by a signature of those beliefs and shared by all agents. The search is bounded by a
 * budget of nodes (work units, never time), and all node storage is preallocated.
 */
export class Planner {
  /**
   * @param {import('../crafting/catalog.js').Catalog} catalog
   * @param {object} options
   * @param {number} options.nodeBudget - Nodes expanded per plan at most.
   * @param {number} options.maxSteps - Longest plan accepted.
   * @param {number} options.travelCost - Ticks added per trip (gather, station).
   * @param {number} options.exploreCost - Ticks estimated to find an unknown resource.
   * @param {Float64Array} options.harvestTicks - Base ticks per unit, per resource id.
   */
  constructor(catalog, { nodeBudget, maxSteps, travelCost, exploreCost, harvestTicks }) {
    this.catalog = catalog;
    this.nodeBudget = nodeBudget;
    this.maxSteps = maxSteps;
    this.travelCost = travelCost;
    this.exploreCost = exploreCost;
    this.harvestTicks = harvestTicks;
    const G = catalog.goodCount;
    this.goods = G;
    /** Inputs, filled by the caller before {@link Planner#plan}. */
    this.inventory = new Int32Array(G);
    this.stations = new Uint8Array(catalog.structures.length + 1);
    this.places = new Uint8Array(catalog.resourceCount + 1);
    this.recipeMask = 0;
    // Producers per good (recipe indices), built once.
    /** @type {number[][]} */
    this.producers = Array.from({ length: G }, () => []);
    catalog.recipes.forEach((r) => {
      if (r.outputKind === 'item') this.producers[r.output].push(r.index);
    });
    this.toolMult = new Float64Array(catalog.resourceCount + 1);
    // Node pool: room for every child of every expanded node.
    const cap = nodeBudget * 4 + 16;
    this.capacity = cap;
    this.have = new Int16Array(cap * G);
    this.req = new Int16Array(cap * G);
    this.stationNeed = new Int32Array(cap);
    this.stationPlanned = new Int32Array(cap);
    this.placeNeed = new Int32Array(cap);
    this.placeFound = new Int32Array(cap);
    this.cost = new Float64Array(cap);
    this.priority = new Float64Array(cap);
    this.parent = new Int32Array(cap);
    this.depth = new Uint8Array(cap);
    this.stepKind = new Uint8Array(cap);
    this.stepArg = new Int16Array(cap);
    this.stepCount = new Int16Array(cap);
    this.heap = new Int32Array(cap + 1);
    this.heapSize = 0;
    this.used = 0;
    // First unmet requirement found by unmet(): kind (1 station, 2 place, 3 good) and argument.
    this.firstKind = 0;
    this.firstArg = 0;
    /** @type {Map<number, PlanResult>} */
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Plans for `target` from the inputs set on this planner.
   * @param {PlanTarget} target
   * @returns {PlanResult}
   */
  plan(target) {
    if (this.satisfiedNow(target)) return DONE_RESULT;
    const key = this.signature(target);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.hits++;
      return cached;
    }
    this.misses++;
    const result = this.search(target);
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }

  /**
   * @param {PlanTarget} target
   * @returns {boolean}
   */
  satisfiedNow(target) {
    for (let g = 1; g < this.goods; g++) {
      if (target.goods[g] === 1 && this.inventory[g] > 0) return true;
    }
    for (let c = 1; c < this.stations.length; c++) {
      if (target.structures[c] === 1 && this.stations[c] === 1) return true;
    }
    return false;
  }

  /**
   * 53-bit signature of the target and the beliefs (two FNV-1a hashes).
   * @param {PlanTarget} target
   * @returns {number}
   */
  signature(target) {
    let a = 0x811c9dc5;
    let b = 0x01000193 ^ target.id;
    const mix = (v) => {
      a = Math.imul(a ^ (v & 0xffff), 0x01000193) >>> 0;
      a = Math.imul(a ^ (v >>> 16), 0x01000193) >>> 0;
      b = Math.imul(b ^ (v & 0xffff), 0x5bd1e995) >>> 0;
      b = (b ^ (b >>> 13) ^ (v >>> 16)) >>> 0;
    };
    mix(target.id);
    mix(this.recipeMask);
    for (let g = 1; g < this.goods; g++) mix(this.inventory[g]);
    let s = 0;
    for (let c = 1; c < this.stations.length; c++) s |= this.stations[c] << c;
    mix(s);
    let p = 0;
    for (let r = 1; r < this.places.length; r++) p |= this.places[r] << r;
    mix(p);
    return a * 0x200000 + (b & 0x1fffff);
  }

  /**
   * @param {number} r - Recipe index.
   * @returns {boolean}
   */
  knows(r) {
    return (this.recipeMask & (1 << r)) !== 0;
  }

  /**
   * Allocates a node copied from `from` (or from the inventory when −1).
   * @param {number} from
   * @returns {number} Node index, −1 if the pool is full.
   */
  newNode(from) {
    if (this.used >= this.capacity) return -1;
    const n = this.used++;
    const G = this.goods;
    if (from < 0) {
      for (let g = 0; g < G; g++) {
        const v = this.inventory[g];
        this.have[n * G + g] = v > 30000 ? 30000 : v;
        this.req[n * G + g] = 0;
      }
      this.stationNeed[n] = 0;
      this.stationPlanned[n] = 0;
      this.placeNeed[n] = 0;
      this.placeFound[n] = 0;
      this.cost[n] = 0;
      this.depth[n] = 0;
    } else {
      this.have.copyWithin(n * G, from * G, from * G + G);
      this.req.copyWithin(n * G, from * G, from * G + G);
      this.stationNeed[n] = this.stationNeed[from];
      this.stationPlanned[n] = this.stationPlanned[from];
      this.placeNeed[n] = this.placeNeed[from];
      this.placeFound[n] = this.placeFound[from];
      this.cost[n] = this.cost[from];
      this.depth[n] = this.depth[from];
    }
    this.parent[n] = from;
    this.stepKind[n] = Step.NONE;
    this.stepArg[n] = 0;
    this.stepCount[n] = 0;
    return n;
  }

  /**
   * Requirements still unmet in node `n`: returns the count, and leaves the first one in
   * `this.firstKind` (0 none, 1 station, 2 place, 3 good) and `this.firstArg`.
   * @param {number} n
   * @returns {number}
   */
  unmet(n) {
    const G = this.goods;
    let count = 0;
    this.firstKind = 0;
    this.firstArg = 0;
    const needS = this.stationNeed[n] & ~this.stationPlanned[n];
    for (let c = 1; c < this.stations.length; c++) {
      if ((needS & (1 << c)) === 0 || this.stations[c] === 1) continue;
      if (count++ === 0) {
        this.firstKind = 1;
        this.firstArg = c;
      }
    }
    const needP = this.placeNeed[n] & ~this.placeFound[n];
    for (let r = 1; r < this.places.length; r++) {
      if ((needP & (1 << r)) === 0 || this.places[r] === 1) continue;
      if (count++ === 0) {
        this.firstKind = 2;
        this.firstArg = r;
      }
    }
    for (let g = 1; g < G; g++) {
      if (this.req[n * G + g] <= this.have[n * G + g]) continue;
      if (count++ === 0) {
        this.firstKind = 3;
        this.firstArg = g;
      }
    }
    return count;
  }

  /**
   * Adds the inputs and station of recipe `r`, made `times` times, to node `n`.
   * @param {number} n
   * @param {number} r
   * @param {number} times
   * @returns {void}
   */
  require(n, r, times) {
    const recipe = this.catalog.recipes[r];
    const G = this.goods;
    for (const input of recipe.inputs) this.req[n * G + input.good] += input.count * times;
    if (recipe.station !== BARE_HANDS) this.stationNeed[n] |= 1 << recipe.station;
    this.cost[n] += recipe.duration * times + (recipe.station !== BARE_HANDS ? this.travelCost : 0);
  }

  /**
   * @param {number} n
   * @returns {void}
   */
  push(n) {
    const unmet = this.unmet(n);
    this.priority[n] = this.cost[n] + unmet;
    let i = ++this.heapSize;
    const heap = this.heap;
    while (i > 1) {
      const p = heap[i >> 1];
      if (this.priority[p] < this.priority[n] || (this.priority[p] === this.priority[n] && p < n)) {
        break;
      }
      heap[i] = p;
      i >>= 1;
    }
    heap[i] = n;
  }

  /** @returns {number} */
  pop() {
    const heap = this.heap;
    const top = heap[1];
    const last = heap[this.heapSize--];
    let i = 1;
    for (;;) {
      let c = i * 2;
      if (c > this.heapSize) break;
      if (c < this.heapSize && this.before(heap[c + 1], heap[c])) c++;
      if (!this.before(heap[c], last)) break;
      heap[i] = heap[c];
      i = c;
    }
    heap[i] = last;
    return top;
  }

  /**
   * @param {number} a
   * @param {number} b
   * @returns {boolean}
   */
  before(a, b) {
    return this.priority[a] < this.priority[b] || (this.priority[a] === this.priority[b] && a < b);
  }

  /**
   * Toolkit effect: harvest multiplier per resource from carried tools.
   * @returns {void}
   */
  computeTools() {
    this.toolMult.fill(1);
    for (const item of this.catalog.items) {
      if (this.inventory[item.good] <= 0) continue;
      for (let r = 1; r < this.toolMult.length; r++) {
        if (item.harvest[r] > this.toolMult[r]) this.toolMult[r] = item.harvest[r];
      }
    }
  }

  /**
   * @param {PlanTarget} target
   * @returns {PlanResult}
   */
  search(target) {
    const G = this.goods;
    this.used = 0;
    this.heapSize = 0;
    this.computeTools();
    // Root alternatives: one node per acceptable good or structure.
    for (let g = 1; g < G; g++) {
      if (target.goods[g] !== 1) continue;
      const n = this.newNode(-1);
      this.req[n * G + g] = 1;
      this.push(n);
    }
    for (let c = 1; c < this.stations.length; c++) {
      if (target.structures[c] !== 1) continue;
      const n = this.newNode(-1);
      this.stationNeed[n] = 1 << c;
      this.push(n);
    }
    let expanded = 0;
    let truncated = false;
    while (this.heapSize > 0) {
      if (expanded >= this.nodeBudget) {
        truncated = true;
        break;
      }
      const n = this.pop();
      expanded++;
      if (this.unmet(n) === 0) return this.result(n, expanded);
      if (this.depth[n] >= this.maxSteps) continue;
      const kind = this.firstKind;
      const arg = this.firstArg;
      if (kind === 1) {
        const r = this.catalog.recipeForStructure[arg];
        if (r < 0 || !this.knows(r)) continue;
        const child = this.newNode(n);
        if (child < 0) break;
        this.stationPlanned[child] |= 1 << arg;
        this.require(child, r, 1);
        this.setStep(child, Step.BUILD, r, 1);
        this.push(child);
      } else if (kind === 2) {
        const child = this.newNode(n);
        if (child < 0) break;
        this.placeFound[child] |= 1 << arg;
        this.cost[child] += this.exploreCost;
        this.setStep(child, Step.EXPLORE, arg, 1);
        this.push(child);
      } else {
        const g = arg;
        const deficit = this.req[n * G + g] - this.have[n * G + g];
        const tool = g <= this.catalog.resourceCount ? this.catalog.requiredTool[g] : 0;
        if (g <= this.catalog.resourceCount && tool >= 0) {
          const child = this.newNode(n);
          if (child < 0) break;
          this.have[child * G + g] = this.req[n * G + g];
          // Harvesting it needs a tool, kept afterwards: at least one must be at hand.
          if (tool > 0 && this.req[child * G + tool] < 1) this.req[child * G + tool] = 1;
          this.placeNeed[child] |= 1 << g;
          this.cost[child] += (deficit * this.harvestTicks[g]) / this.toolMult[g] + this.travelCost;
          this.setStep(child, Step.GATHER, g, this.req[n * G + g]);
          this.push(child);
        }
        for (const r of this.producers[g]) {
          if (!this.knows(r)) continue;
          const child = this.newNode(n);
          if (child < 0) break;
          this.have[child * G + g] = this.req[n * G + g];
          this.require(child, r, deficit);
          this.setStep(child, Step.CRAFT, r, deficit);
          this.push(child);
        }
      }
    }
    return {
      status: truncated ? PlanStatus.BUDGET : PlanStatus.NO_PLAN,
      steps: EMPTY,
      cost: 0,
      nodes: expanded,
    };
  }

  /**
   * @param {number} n
   * @param {number} kind
   * @param {number} arg
   * @param {number} count
   * @returns {void}
   */
  setStep(n, kind, arg, count) {
    this.stepKind[n] = kind;
    this.stepArg[n] = arg;
    this.stepCount[n] = count;
    this.depth[n]++;
  }

  /**
   * The search regresses from the target, so walking from the goal node back to the root lists
   * the steps in execution order (what must happen first was resolved last).
   * @param {number} n
   * @param {number} expanded
   * @returns {PlanResult}
   */
  result(n, expanded) {
    /** @type {PlanStep[]} */
    const steps = [];
    for (let k = n; k >= 0; k = this.parent[k]) {
      if (this.stepKind[k] === Step.NONE) continue;
      steps.push(
        Object.freeze({ kind: this.stepKind[k], arg: this.stepArg[k], count: this.stepCount[k] }),
      );
    }
    return Object.freeze({
      status: PlanStatus.OK,
      steps: Object.freeze(steps),
      cost: this.cost[n],
      nodes: expanded,
    });
  }
}
