import { harvestMultiplier } from '../agents/equipment.js';
import { canHarvest } from '../agents/actions.js';
import { geneLevel } from '../genome/genome.js';
import { askOf, bidOf } from './prices.js';
import { treasureSpare } from './market.js';

// Jobs (docs/design/14-economie.md, « Métiers »): a member of a large enough colony chooses a job
// for several days, the one whose expected income is the best for it — its comparative advantage.
// From a job it did, it expects what it earned there; from another, what the prices it saw at the
// counter and what it learnt a unit of each good costs it promise (docs/design/06-ia.md, couche 7).
// Guards, the scribe and the inventor hold posts given by the colony and paid a wage; their post
// is their job while they hold it.

/**
 * @typedef {object} Job
 * @property {string} id
 * @property {string} name
 * @property {number} goal - Goal index of its work.
 * @property {string | null} post - "guard", "inventor", "scribe": a post given by the colony.
 * @property {number[]} requires - Recipes it needs to know (all of them).
 * @property {number[]} sells - Goods it brings to the counter.
 * @property {number[]} makes - Kitchen recipes it makes (one known is enough).
 * @property {number} gene - Gene index that draws towards it, -1 if none.
 * @property {boolean} trade - Caravans to other colonies (needs another colony known).
 * @property {boolean} gathers - Only brings what it harvests or grows (left to the people in a
 *   town).
 */

/**
 * @typedef {object} JobTable
 * @property {Job[]} jobs
 * @property {Record<string, number>} index - Job index per id.
 * @property {Uint8Array} workGoals - 1 per goal that is the work of a chosen job.
 * @property {Int8Array} postJob - Job index per post kind: [guard, inventor, scribe].
 * @property {Int8Array} sellerOf - Per good, the first job that sells it (-1 none): the trade
 *   one of the people does when it brings that good (decision 0030).
 */

/** Post kinds, in the order of {@link JobTable.postJob}. */
export const POSTS = Object.freeze(['guard', 'inventor', 'scribe']);

/**
 * Builds the job table from data/jobs.json.
 * @param {{ jobs: object[] }} data
 * @param {import('../crafting/catalog.js').Catalog} catalog
 * @param {import('../world/world-data.js').WorldTables} tables
 * @param {Record<string, number>} goalIndex
 * @param {import('../genome/genome.js').GeneTable} genes
 * @returns {JobTable}
 */
export function buildJobs(data, catalog, tables, goalIndex, genes) {
  const recipe = (id) => {
    const r = catalog.recipes.findIndex((rc) => rc.id === id);
    if (r < 0) throw new Error(`Job: unknown recipe ${id}`);
    return r;
  };
  const good = (id) => {
    const r = tables.resources.findIndex((res) => res.id === id);
    if (r >= 0) return r + 1;
    const item = catalog.items.find((i) => i.id === id);
    if (!item) throw new Error(`Job: unknown good ${id}`);
    return item.good;
  };
  const jobs = data.jobs.map((j) => {
    const goal = goalIndex[j.goal];
    if (goal === undefined) throw new Error(`Job ${j.id}: unknown goal ${j.goal}`);
    const gene = j.gene ? genes.index[j.gene] : -1;
    if (gene === undefined) throw new Error(`Job ${j.id}: unknown gene ${j.gene}`);
    return {
      id: j.id,
      name: j.name,
      goal,
      post: j.post ?? null,
      requires: (j.requires ?? []).map(recipe),
      sells: (j.sells ?? []).map(good),
      makes: (j.makes ?? []).map(recipe),
      gene,
      trade: j.trade === true,
      // Only brings what it harvests or grows: the people's work in a town.
      gathers: (j.sells ?? []).length > 0 && (j.makes ?? []).length === 0 && !j.trade,
    };
  });
  const workGoals = new Uint8Array(Object.keys(goalIndex).length);
  for (const j of jobs) if (!j.post) workGoals[j.goal] = 1;
  const postJob = Int8Array.from(POSTS, (p) => jobs.findIndex((j) => j.post === p));
  const sellerOf = new Int8Array(catalog.goodCount).fill(-1);
  jobs.forEach((j, i) => {
    for (const g of j.sells) if (sellerOf[g] < 0) sellerOf[g] = i;
  });
  return {
    jobs,
    index: Object.fromEntries(jobs.map((j, i) => [j.id, i])),
    workGoals,
    postJob,
    sellerOf,
  };
}

/**
 * True if the agent can do this job: it knows what it requires, and one of its kitchen recipes.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Job} job
 * @param {number} id
 * @returns {boolean}
 */
export function canDo(ctx, job, id) {
  if (job.post) return false;
  if (job.trade) return bestCaravan(ctx, id, null) > 0;
  const book = ctx.agents.recipes[id];
  for (const r of job.requires) if (!book.knows(r)) return false;
  if (job.makes.length === 0) return true;
  for (const r of job.makes) if (book.knows(r)) return true;
  return false;
}

/**
 * Ticks the agent believes one unit of a good costs it to bring to the counter: what it learnt
 * from its own deliveries, else the harvest time at its speed, times `tripFactor` for the walk.
 * Infinity if it cannot harvest it (a tool it lacks).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} g
 * @returns {number}
 */
export function unitTicks(ctx, id, g) {
  const a = ctx.agents;
  const learnt = a.costPerUnit[id * a.goodSlots + g];
  if (learnt > 0) return learnt;
  if (g > ctx.catalog.resourceCount || !canHarvestOrTool(ctx, id, g)) return Infinity;
  const speed = (1 + a.force[id] / ctx.harvestForceScale) * harvestMultiplier(ctx, id, g);
  return (ctx.harvestTicks[g] / speed) * ctx.balance.economy.tripFactor;
}

/**
 * True if the agent can harvest the resource, or knows how to make the tool it needs.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} g
 * @returns {boolean}
 */
export function canHarvestOrTool(ctx, id, g) {
  if (canHarvest(ctx, id, g)) return true;
  const tool = ctx.catalog.requiredTool[g];
  const r = tool > 0 ? ctx.catalog.recipeForGood[tool] : -1;
  return r >= 0 && ctx.agents.recipes[id].knows(r);
}

/**
 * Money margin of one round of a kitchen recipe at the given prices: what the counter pays for
 * the output minus what it asks for the inputs.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Float64Array} prices - Reference prices (index = good id), from `offset`.
 * @param {number} offset
 * @param {number} r
 * @returns {number}
 */
export function kitchenMargin(ctx, prices, offset, r) {
  const spread = ctx.balance.economy.spread;
  const recipe = ctx.catalog.recipes[r];
  let m = bidOf(prices[offset + recipe.output]);
  for (const input of recipe.inputs) m -= askOf(prices[offset + input.good], spread) * input.count;
  return m;
}

/**
 * Income the agent expects from a job per day, in écus. From a job it has done, what it earned
 * there (a moving average of its days); from one it has never done, an estimate from the prices it
 * saw: its best good to sell at its learnt cost, or its best kitchen recipe.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} j - Job index.
 * @param {number} id
 * @returns {number}
 */
export function expectedIncome(ctx, j, id) {
  const a = ctx.agents;
  const i = id * a.jobCount + j;
  if (a.jobDays[i] > 0) return a.jobIncome[i];
  return estimatedIncome(ctx, ctx.jobs.jobs[j], id);
}

/**
 * Income per day the agent would estimate for a job it has never done, from the prices it saw.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Job} job
 * @param {number} id
 * @returns {number}
 */
export function estimatedIncome(ctx, job, id) {
  const a = ctx.agents;
  const cfg = ctx.balance.economy;
  if (job.trade) return bestCaravan(ctx, id, null);
  const seen = a.priceSeen;
  const o = id * a.goodSlots;
  let best = 0;
  for (const g of job.sells) {
    const t = unitTicks(ctx, id, g);
    if (t === Infinity) continue;
    const v = (bidOf(seen[o + g]) * cfg.workTicks) / t;
    if (v > best) best = v;
  }
  const book = a.recipes[id];
  for (const r of job.makes) {
    if (!book.knows(r)) continue;
    const ticks = ctx.catalog.recipes[r].duration + cfg.kitchenOverhead;
    const v = (kitchenMargin(ctx, seen, o, r) * cfg.workTicks) / ticks;
    if (v > best) best = v;
  }
  return best;
}

/**
 * The job the agent would choose: the best expected income it can do, weighed by the gene that
 * draws it there.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number} Job index, -1 if none pays.
 */
function bestJob(ctx, id) {
  const table = ctx.jobs;
  const pull = ctx.balance.economy.genePull;
  let best = -1;
  let bestValue = 0;
  // In a town with its people, the figures leave the fields and the gathering to them (decision
  // 0030) and take the trades that make, carry or need a mind.
  const c = ctx.agents.colony[id];
  const town = c >= 0 && ctx.colonies[c].members >= ctx.balance.people.commonFrom;
  for (let j = 0; j < table.jobs.length; j++) {
    const job = table.jobs[j];
    if (town && job.gathers) continue;
    if (!canDo(ctx, job, id)) continue;
    let v = expectedIncome(ctx, j, id);
    if (job.gene >= 0) v *= 1 + pull * (geneLevel(ctx.genes, ctx.agents.genes, id, job.gene) - 0.5);
    if (v > bestValue) {
      bestValue = v;
      best = j;
    }
  }
  return best;
}

/**
 * At the camp, once its colony is large enough: the agent keeps its job for `jobDays` (and an
 * apprentice its parent's for `apprenticeDays`), then changes only for a job that pays clearly
 * more (`inertia`), or if it can no longer do it. Returns true if the job changed.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {boolean}
 */
export function considerJob(state, ctx, colony, id) {
  const a = ctx.agents;
  const cfg = ctx.balance.economy;
  const day = ctx.balance.time.ticksPerDay;
  if (colony.members < cfg.jobMembers) return false;
  const current = a.job[id];
  const table = ctx.jobs;
  // In a town, a figure that gathered leaves it to the people (decision 0030).
  const town = colony.members >= ctx.balance.people.commonFrom;
  const able =
    current >= 0 && canDo(ctx, table.jobs[current], id) && !(town && table.jobs[current].gathers);
  const held = state.tick - a.jobSince[id];
  const apprentice = state.tick - a.bornTick[id] < cfg.apprenticeDays * day;
  if (able && (held < cfg.jobDays * day || apprentice)) return false;
  const best = bestJob(ctx, id);
  if (best < 0 && current >= 0 && town && table.jobs[current].gathers) {
    a.job[id] = -1;
    a.jobSince[id] = state.tick;
    return true;
  }
  if (best < 0 || best === current) return false;
  if (able) {
    const now = expectedIncome(ctx, current, id);
    if (expectedIncome(ctx, best, id) <= now * (1 + cfg.inertia)) return false;
  }
  a.job[id] = best;
  a.jobSince[id] = state.tick;
  return true;
}

/**
 * The good of its job the agent would gather to sell at the counter (docs/design/14-economie.md,
 * « Le marché »: producers offer what they make): the best price for its learnt cost, among those
 * it can harvest and knows a place of (or carries), or that the colony asked for (it will look for
 * it). 0 if none pays.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {number}
 */
export function saleGood(ctx, colony, id) {
  const a = ctx.agents;
  const j = a.job[id];
  if (j < 0 || colony.members < ctx.balance.economy.jobMembers) return 0;
  const memory = a.memory[id];
  const o = id * a.goodSlots;
  let best = 0;
  let bestValue = 0;
  for (const g of ctx.jobs.jobs[j].sells) {
    const bid = bidOf(a.priceSeen[o + g]);
    if (bid < 1 || g > ctx.catalog.resourceCount) continue;
    // Gold and gems sell only while the counter has écus to spare for them.
    if (ctx.treasureGoods[g] === 1 && treasureSpare(ctx, colony) < bid) continue;
    // A good it knows no place of is sought only if the colony asks for it (prospecting).
    const known =
      a.carried(id, g) > 0 || memory.nearest(ctx.subjectMasks[g], a.x[id], a.y[id]) >= 0;
    if (!known && colony.demand[g] === 0) continue;
    const t = unitTicks(ctx, id, g);
    if (t === Infinity) continue;
    if (bid / t > bestValue) {
      bestValue = bid / t;
      best = g;
    }
  }
  return best;
}

/**
 * The best caravan the agent's colony knows of (docs/design/15-colonies-et-migration.md,
 * « Commerce »): a good bought at its counter and sold at another colony's, by the prices posted
 * at the camp (its own as it saw them, the other's as last brought back). Returns the income it
 * promises per day of work (a load per trip, there and back), 0 if none pays.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Int32Array | null} out - Receives colony, good of the best one.
 * @returns {number}
 */
export function bestCaravan(ctx, id, out) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return 0;
  const home = ctx.colonies[c];
  const cfg = ctx.balance.economy;
  const G = a.goodSlots;
  const o = id * G;
  const load = ctx.capacity(id);
  let best = 0;
  for (let k = 0; k < home.relKnown.length; k++) {
    if (k === c || home.relKnown[k] !== 1 || home.relPriceTick[k] < 0) continue;
    // Enough caravans already on that road (they left from the camp: everyone saw them go).
    if (a.caravanTo[id] !== k && caravansTo(ctx, c, k) >= cfg.caravans) continue;
    const far = Math.max(
      Math.abs(home.relCampX[k] - home.campX),
      Math.abs(home.relCampY[k] - home.campY),
    );
    const trip = 2 * far * cfg.ticksPerTile + cfg.tripOverhead;
    for (let g = 1; g < G; g++) {
      if (a.priceSeen[o + g] <= 0) continue;
      const margin = bidOf(home.relPrice[k * G + g]) - askOf(a.priceSeen[o + g], cfg.spread);
      const v = (margin * load * cfg.workTicks) / trip;
      if (v > best) {
        best = v;
        if (out) {
          out[0] = k;
          out[1] = g;
        }
      }
    }
  }
  return best;
}

/**
 * Merchants of colony `c` on their way to or back from colony `k`.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} c
 * @param {number} k
 * @returns {number}
 */
function caravansTo(ctx, c, k) {
  const a = ctx.agents;
  let n = 0;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] === 1 && a.colony[id] === c && a.caravanTo[id] === k) n++;
  }
  return n;
}
