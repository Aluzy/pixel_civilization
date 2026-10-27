import { expNeg } from '../core/math.js';

// Weariness of a goal (decision 0029): a goal whose plan keeps failing (trials that teach nothing)
// loses its appeal, more so the more it failed lately, and gets it back as the failures fade. A
// founder no longer spends its life trying to make a weapon it cannot find.

const LN2 = 0.6931471805599453;

/**
 * Fades the agent's weariness of every goal to `tick` (half-life from balance.ai.weariness).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} tick
 * @returns {void}
 */
export function fadeWeariness(ctx, id, tick) {
  const a = ctx.agents;
  const dt = tick - a.wearyTick[id];
  if (dt <= 0) return;
  a.wearyTick[id] = tick;
  const half = ctx.balance.ai.weariness.halfLifeDays * ctx.balance.time.ticksPerDay;
  const keep = expNeg((LN2 * dt) / half);
  const G = a.goalCount;
  for (let g = id * G; g < (id + 1) * G; g++) if (a.weary[g] !== 0) a.weary[g] *= keep;
}

/**
 * A trial made for `goal` failed: the agent grows weary of it.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} goal
 * @param {number} tick
 * @returns {void}
 */
export function tire(ctx, id, goal, tick) {
  if (goal < 0) return;
  fadeWeariness(ctx, id, tick);
  ctx.agents.weary[id * ctx.agents.goalCount + goal] += ctx.balance.ai.weariness.perFailure;
}

/**
 * A trial for `goal` taught something: the weariness of it is gone.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} goal
 * @returns {void}
 */
export function refresh(ctx, id, goal) {
  if (goal >= 0) ctx.agents.weary[id * ctx.agents.goalCount + goal] = 0;
}

/**
 * Divides each goal's weight by 1 + `scale` × its weariness beyond `grace` (faded to `tick`):
 * the first failures are the normal cost of trying.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} tick
 * @param {Float64Array} weights
 * @returns {void}
 */
export function wearyWeights(ctx, id, tick, weights) {
  fadeWeariness(ctx, id, tick);
  const a = ctx.agents;
  const G = a.goalCount;
  const { scale, grace } = ctx.balance.ai.weariness;
  for (let g = 0; g < G; g++) {
    const w = a.weary[id * G + g] - grace;
    if (w > 0) weights[g] /= 1 + scale * w;
  }
}
