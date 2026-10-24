import { Flag } from '../agents/actions.js';
import { Action, isFocused } from '../agents/action-types.js';
import { planGoal } from '../agents/behaviors.js';
import { attackMultiplier, carriesKind, inShelter } from '../agents/equipment.js';
import { perceptionRadius } from '../agents/perception.js';
import { fillBeliefs } from '../agents/work.js';
import { PlanStatus, Step } from '../ai/planner.js';
import { INPUT, scoreGoals } from '../ai/utility.js';
import { EventType } from '../core/events.js';

/**
 * True if the plan needs to look for a resource first (its place is unknown).
 * @param {import('../ai/planner.js').PlanResult} result
 * @returns {boolean}
 */
function needsSearch(result) {
  if (result.status !== PlanStatus.OK) return true;
  for (const step of result.steps) if (step.kind === Step.EXPLORE) return true;
  return false;
}

/**
 * Long-term project (HTN, docs/design/06-ia.md, couche 5): the current step is the first one not
 * done yet, unless it needs a search while a later step can be done with what is known (the
 * agent makes its spear while it has not found stone). Returns the goal to favour, or -1.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
function projectGoal(state, ctx, id) {
  const a = ctx.agents;
  if (a.project[id] < 0) {
    if ((a.flags[id] & Flag.PROJECT) !== 0) return -1;
    a.project[id] = 0;
  }
  const project = ctx.projects.projects[a.project[id]];
  const planner = fillBeliefs(ctx, id);
  let current = -1;
  let fallback = -1;
  for (let s = 0; s < project.steps.length; s++) {
    const result = planner.plan(ctx.targets[project.steps[s].goal]);
    if (result.status === PlanStatus.DONE) continue;
    if (fallback < 0) fallback = s;
    if (!needsSearch(result)) {
      current = s;
      break;
    }
  }
  if (current < 0) current = fallback;
  if (current < 0) {
    state.events.push(state.tick, EventType.PROJECT_DONE, id, a.x[id], a.y[id], a.project[id]);
    a.flags[id] |= Flag.PROJECT;
    a.project[id] = -1;
    a.projectStep[id] = -1;
    return -1;
  }
  a.projectStep[id] = current;
  return project.steps[current].goal;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if hunger or thirst is close to critical (enough to wake up).
 */
function starving(ctx, id) {
  const limit = ctx.balance.needs.critical * ctx.balance.needs.wakeOnNeed;
  return ctx.agents.hunger[id] >= limit || ctx.agents.thirst[id] >= limit;
}

/**
 * Fills the utility inputs of one agent from its body, its belongings and what it perceives.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function senseInputs(state, ctx, id) {
  const a = ctx.agents;
  const input = ctx.inputs;
  input[INPUT.hunger] = a.hunger[id] / 100;
  input[INPUT.thirst] = a.thirst[id] / 100;
  input[INPUT.fatigue] = a.fatigue[id] / 100;
  input[INPUT.curiosity] = a.curiosity[id] / 100;
  input[INPUT.darkness] = ctx.darkness;
  input[INPUT.one] = 1;
  const memory = a.memory[id];
  input[INPUT.needShelter] = memory.nearest(ctx.shelterSubjects, 0, 0) < 0 ? 1 : 0;
  input[INPUT.needWeapon] = carriesKind(ctx, id, 'weapon') ? 0 : 1;
  input[INPUT.needTool] = carriesKind(ctx, id, 'tool') ? 0 : 1;
  // Danger: the nearest predator in sight, unless the agent is safe in its shelter.
  const radius = perceptionRadius(ctx, id, ctx.dark);
  const p = state.threats.nearest(a.x[id], a.y[id], radius);
  const safe = p < 0 || inShelter(state, ctx, a.x[id], a.y[id]);
  input[INPUT.danger] = safe ? 0 : 1 - state.threats.lastDistance / (radius + 1);
  const health = a.hp[id] / a.maxHp[id];
  const strong = attackMultiplier(ctx, id) > 1;
  input[INPUT.vulnerability] = strong ? 0.1 + 0.8 * (1 - health) : 0.5 + 0.5 * (1 - health);
}

/**
 * Chooses a goal for each agent with the utility AI, then plans it. Agents re-evaluate every
 * `decisionInterval` ticks, staggered by id to spread the load, or at once when their action
 * ends or something interrupts them (an attack). A journal entry is written whenever the goal or
 * the plan changes.
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
  const bonus = ctx.projects.bonus;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    // Sleep and focused work (harvesting, making, trying) are not reconsidered every few ticks:
    // only an attack, the end of the action or a vital need interrupts them.
    const busy = a.asleep[id] === 1 || isFocused(a.action[id]);
    const due = (state.tick + id) % interval === 0 && (!busy || starving(ctx, id));
    if (!due && a.needsDecision[id] === 0) continue;

    senseInputs(state, ctx, id);
    const favoured = projectGoal(state, ctx, id);
    const current = a.goal[id];
    let goal = scoreGoals(ctx.goals, input, current, scores, a.rng[id], favoured, bonus);
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
