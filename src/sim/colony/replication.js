import { MAX_RADIUS } from '../agents/navigation.js';
import { EventType } from '../core/events.js';
import { inherit } from '../genome/genome.js';
import { PACK } from '../world/chunk-store.js';

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);

/**
 * @param {object} balance
 * @param {import('../core/rng.js').Rng} rng
 * @returns {number} Lifespan in ticks, drawn in the configured range of days.
 */
export function lifespanOf(balance, rng) {
  const [min, max] = balance.agent.lifespanDays;
  return Math.round((min + rng.next() * (max - min)) * balance.time.ticksPerDay);
}

// Replication (docs/design/03-individu.md): a decision, not an automatism. The agent replicates
// when fed for a while, unhurt for days, carrying the cost, and when its colony has a free bed.

/**
 * Whether the colony has room for one more (free bed, food to spare, population cap) and the
 * agent's cooldown
 * has passed: the goal "Se répliquer" makes sense. Being fed, unhurt and carrying the cost are
 * then prepared by the behaviour itself.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
export function roomToReplicate(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return false;
  const colony = state.colonies[c];
  const r = ctx.balance.replication;
  if (state.tick - a.lastReplication[id] < r.cooldownTicks) return false;
  if (a.aliveCount >= ctx.balance.colony.maxPopulation) return false;
  // A bed, and food to spare in the pantry (as last seen): growth follows what the land gives.
  if (a.pantrySeen[id] < r.pantryPerMember * colony.members) return false;
  // In a large colony, a pantry running down (as last seen) holds births back, unless it is still
  // well stocked: so many mouths would empty it in days.
  const large = colony.members >= r.reserveMembers;
  // A farming colony grows no faster than its fields (as counted on the blackboard).
  if (large && colony.plots > 0 && colony.plots < colony.members * r.plotsPerMember) return false;
  if (
    large &&
    a.pantryFalling[id] === 1 &&
    a.pantrySeen[id] < r.reservePerMember * colony.members
  ) {
    return false;
  }
  return colony.beds(ctx.balance.colony.bedsPerShelter) > colony.members;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} Fed long enough (hunger below the threshold for `fedTicks`).
 */
export function fedEnough(state, ctx, id) {
  return state.tick - ctx.agents.hungryTick[id] >= ctx.balance.replication.fedTicks;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} No health lost for `unhurtDays`.
 */
export function unhurt(state, ctx, id) {
  const days = ctx.balance.replication.unhurtDays * ctx.balance.time.ticksPerDay;
  return state.tick - ctx.agents.hurtTick[id] >= days;
}

/** Code of {@link missingCost} when what is missing is food (any, in portions). */
export const FOOD_COST = -1;

/**
 * Food the agent carries, in portions.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function carriedPortions(ctx, id) {
  const t = ctx.foodTables;
  let sum = 0;
  for (let k = 0; k < t.order.length; k++)
    sum += ctx.agents.carried(id, t.order[k]) * t.nutrition[t.order[k]];
  return Math.floor(sum / ctx.balance.cooking.portion);
}

/**
 * First good of the replication cost the agent lacks, with the total to carry; {@link FOOD_COST}
 * with the portions to carry if it lacks food (any food will do); or 0.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Int32Array} out - Receives good, total.
 * @returns {number}
 */
export function missingCost(ctx, id, out) {
  const cost = ctx.replicationCost;
  for (let g = 1; g < cost.length; g++) {
    if (cost[g] > 0 && ctx.agents.carried(id, g) < cost[g]) {
      out[0] = g;
      out[1] = cost[g];
      return g;
    }
  }
  const food = ctx.balance.replication.costFood;
  if (carriedPortions(ctx, id) < food) {
    out[0] = FOOD_COST;
    out[1] = food;
    return FOOD_COST;
  }
  return 0;
}

/**
 * Pays the food of a replication, the least nourishing food first.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function payFood(ctx, id) {
  const t = ctx.foodTables;
  let due = ctx.balance.replication.costFood * ctx.balance.cooking.portion;
  for (let k = t.order.length - 1; k >= 0 && due > 0; k--) {
    const g = t.order[k];
    const n = Math.min(ctx.agents.carried(id, g), Math.ceil(due / t.nutrition[g]));
    if (n <= 0) continue;
    ctx.agents.addCarried(id, g, -n);
    due -= n * t.nutrition[g];
  }
}

/**
 * Creates the replica on a free passable tile next to the parent: attributes mutated by up to
 * ±`mutation`, needs at their start value, no memory, no recipe, same colony.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id - Parent.
 * @returns {number} Child id, or -1 if it could not be born (no room).
 */
export function replicate(state, ctx, id) {
  const a = ctx.agents;
  const r = ctx.balance.replication;
  const out = ctx.costOut;
  if (missingCost(ctx, id, out) !== 0 || !roomToReplicate(state, ctx, id)) return -1;
  const rng = state.rng.lifecycle;
  // Always the same draw order, so the mutations are reproducible.
  const mutate = (value) => value * (1 + (rng.next() * 2 - 1) * r.mutation);
  const attributes = {
    hp: mutate(a.maxHp[id]),
    force: mutate(a.force[id]),
    speed: mutate(a.speed[id]),
    attack: mutate(a.attack[id]),
    defense: mutate(a.defense[id]),
    perception: Math.min(MAX_RADIUS, mutate(a.perception[id])),
    memory: Math.max(1, Math.round(mutate(a.memorySize[id]))),
  };
  let x = a.x[id];
  let y = a.y[id];
  for (let k = 0; k < 8; k++) {
    const nx = a.x[id] + DX[k];
    const ny = a.y[id] + DY[k];
    if (ctx.biomeSpeed[state.world.packedAt(nx, ny) & PACK.MASK] > 0) {
      x = nx;
      y = ny;
      break;
    }
  }
  const cost = ctx.replicationCost;
  for (let g = 1; g < cost.length; g++) if (cost[g] > 0) a.addCarried(id, g, -cost[g]);
  payFood(ctx, id);
  const child = a.create({
    x,
    y,
    tick: state.tick,
    attributes,
    needs: ctx.balance.agent.startNeeds,
    rng: state.rng.ai.fork(`agent-${id}-${state.tick}`),
    colony: a.colony[id],
    parent: id,
    generation: a.generation[id] + 1,
    lifespan: lifespanOf(ctx.balance, rng),
  });
  inherit(ctx.genes, a.genes, id, child, r.geneMutation, state.rng.genome);
  // A share of the parent's écus, and its job to learn by its side for the first days.
  const gift = Math.floor(a.coins[id] * ctx.balance.economy.birthShare);
  a.coins[id] -= gift;
  a.coins[child] = gift;
  a.job[child] = a.job[id];
  a.lastReplication[id] = state.tick;
  a.children[id]++;
  const colony = state.colonies[a.colony[id]];
  colony.births++;
  colony.members++;
  state.events.push(state.tick, EventType.BIRTH, child, x, y, id);
  return child;
}
