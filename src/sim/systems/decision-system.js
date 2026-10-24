import { Action } from '../agents/action-types.js';
import { planGoal } from '../agents/behaviors.js';
import { INPUT, scoreGoals } from '../ai/utility.js';

/**
 * Chooses a goal for each agent with the utility AI, then plans it. Agents re-evaluate every
 * `decisionInterval` ticks, staggered by id to spread the load, or at once when their action
 * ends. A journal entry is written whenever the goal or the plan changes.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function decisionSystem(state, ctx) {
  const a = ctx.agents;
  const interval = ctx.balance.ai.decisionInterval;
  const input = ctx.inputs;
  const scores = ctx.scores;
  const plan = ctx.plan;
  const critical = ctx.balance.needs.critical;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const due = (state.tick + id) % interval === 0;
    if (!due && a.needsDecision[id] === 0) continue;

    input[INPUT.hunger] = a.hunger[id] / 100;
    input[INPUT.thirst] = a.thirst[id] / 100;
    input[INPUT.fatigue] = a.fatigue[id] / 100;
    input[INPUT.curiosity] = a.curiosity[id] / 100;
    input[INPUT.darkness] = ctx.darkness;
    input[INPUT.one] = 1;

    const current = a.goal[id];
    let goal = scoreGoals(ctx.goals, input, current, scores, a.rng[id]);
    // Exhaustion overrides choice: the body falls asleep.
    if (a.fatigue[id] >= critical) goal = ctx.goalIndex.sleep;

    const idle = a.action[id] === Action.NONE;
    if (goal === current && !idle && a.needsDecision[id] === 0) continue;
    a.needsDecision[id] = 0;
    if (goal !== current) a.goalSince[id] = state.tick;
    a.goal[id] = goal;
    planGoal(state, ctx, id, goal, plan);
    a.journal[id].record(state.tick, goal, scores, plan.action, plan.x, plan.y, plan.note);
  }
}
