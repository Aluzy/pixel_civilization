import { MAX_RADIUS } from '../agents/navigation.js';
import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);

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

/**
 * First good of the replication cost the agent lacks, with the total to carry, or 0.
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
  return 0;
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
  if (missingCost(ctx, id, out) > 0 || !roomToReplicate(state, ctx, id)) return -1;
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
  });
  a.lastReplication[id] = state.tick;
  a.children[id]++;
  const colony = state.colonies[a.colony[id]];
  colony.births++;
  colony.members++;
  state.events.push(state.tick, EventType.BIRTH, child, x, y, id);
  return child;
}
