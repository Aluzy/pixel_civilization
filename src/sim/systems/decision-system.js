import { Flag } from '../agents/actions.js';
import { Action, isFocused } from '../agents/action-types.js';
import { planGoal } from '../agents/behaviors.js';
import { attackMultiplier, carriesKind, inShelter } from '../agents/equipment.js';
import { perceptionRadius } from '../agents/perception.js';
import { fillBeliefs } from '../agents/work.js';
import { PlanStatus, Step } from '../ai/planner.js';
import { imagineFight } from '../ai/imagination.js';
import { INPUT, scoreGoals } from '../ai/utility.js';
import { atCamp, campOf, shareBoard } from '../colony/colony-logic.js';
import { roomToReplicate } from '../colony/replication.js';
import { carriesWriting, wantsMap } from '../knowledge/writing.js';
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
  // A colony member knows its home: the camp's shelters are its beds.
  const home = campOf(state, ctx, id);
  const sheltered = home !== null || memory.nearest(ctx.shelterSubjects, 0, 0) >= 0;
  input[INPUT.needShelter] = sheltered ? 0 : 1;
  // In a colony of several, personal equipment is less pressing than the common work.
  const crowd = home !== null && home.members >= 2 ? ctx.balance.colony.equipmentInColony : 1;
  input[INPUT.needWeapon] = carriesKind(ctx, id, 'weapon') ? 0 : crowd;
  input[INPUT.needTool] = carriesKind(ctx, id, 'tool') ? 0 : crowd;
  // Danger: the nearest predator in sight, unless the agent is safe in its shelter.
  const radius = perceptionRadius(ctx, id, ctx.dark);
  const p = state.threats.nearest(a.x[id], a.y[id], radius);
  const safe = p < 0 || inShelter(state, ctx, a.x[id], a.y[id]);
  input[INPUT.danger] = safe ? 0 : 1 - state.threats.lastDistance / (radius + 1);
  // Fight or flee: imagined fights against the predator in sight (only when one is there).
  if (input[INPUT.danger] > 0) {
    const self = ctx.imagined;
    self.hp = a.hp[id];
    self.maxHp = a.maxHp[id];
    self.attack = a.attack[id] * attackMultiplier(ctx, id);
    self.defense = a.defense[id];
    const risk = imagineFight(self, ctx.balance.threats, ctx.balance.imagination, a.rng[id]);
    a.fightRisk[id] = risk;
    input[INPUT.vulnerability] = 0.15 + 0.85 * risk;
  } else {
    input[INPUT.vulnerability] = 0;
  }
  // Colony: a task in hand, or open tasks seen on the blackboard; room for a replica.
  const researching = home !== null && home.projects.some((p) => p.researcher === id);
  const hasTask = a.taskProject[id] >= 0 || researching;
  input[INPUT.colonyTask] = hasTask ? 1 : a.tasksSeen[id] === 1 ? 0.8 : 0;
  input[INPUT.canReplicate] = roomToReplicate(state, ctx, id) ? 1 : 0;
  // Writing and reading: only with a library at home, and from what the agent saw there.
  const library = home !== null && home.librariesStanding() > 0;
  const unwritten = (a.recipes[id].knownMask() & ~a.librarySeen[id]) !== 0;
  // One scribe at a time: the first member at the camp with something to write takes the task.
  let scribe = false;
  if (library && (unwritten || carriesWriting(state, id) || wantsMap(state, ctx, id))) {
    const expired = state.tick - home.scribeTick > ctx.balance.writing.scribeTicks;
    // The scribe keeps the pen for a while: it remembers what it already tried.
    const current = home.scribe >= 0 && a.alive[home.scribe] === 1 ? home.scribe : -1;
    if (home.scribe === id) scribe = true;
    else if ((current < 0 || expired) && atCamp(ctx, home, id)) {
      home.scribe = id;
      home.scribeTick = state.tick;
      scribe = true;
    }
  } else if (home !== null && home.scribe === id) {
    home.scribe = -1;
  }
  input[INPUT.unwritten] = scribe ? 1 : 0;
  const young =
    state.tick - a.bornTick[id] < ctx.balance.writing.youngDays * ctx.balance.time.ticksPerDay;
  const unread =
    a.libraryVisited[id] === 0 || (a.librarySeen[id] & ~a.recipes[id].knownMask()) !== 0;
  input[INPUT.unread] = library && unread ? (young ? 1 : 0.7) : 0;
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

    // At the camp, the blackboard is read and written from time to time.
    const colony = campOf(state, ctx, id);
    const boardDue = state.tick - a.boardTick[id] >= ctx.balance.colony.boardInterval;
    if (colony && boardDue && atCamp(ctx, colony, id)) shareBoard(state, ctx, colony, id);
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
