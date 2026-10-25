import { Flag } from '../agents/actions.js';
import { Action, isFocused } from '../agents/action-types.js';
import { planGoal } from '../agents/behaviors.js';
import { carriesKind, inShelter } from '../agents/equipment.js';
import { perceptionRadius } from '../agents/perception.js';
import { fillBeliefs } from '../agents/work.js';
import { PlanStatus, Step } from '../ai/planner.js';
import { imagineFight } from '../ai/imagination.js';
import { INPUT, scoreGoals } from '../ai/utility.js';
import { geneLevel, goalWeights } from '../genome/genome.js';
import { agentAttack, agentDefense } from '../agents/combat.js';
import { knownDen } from '../agents/guard-work.js';
import { MAX_GUARDS } from '../colony/colony-store.js';
import { notePass } from '../agents/experience.js';
import { Component } from '../colony/harmony.js';
import { atCamp, campOf, shareBoard } from '../colony/colony-logic.js';
import { roomToReplicate } from '../colony/replication.js';
import { carriesWriting, wantsMap } from '../knowledge/writing.js';
import { senseCooking } from '../agents/cook-work.js';
import { FarmJob } from '../farming/farm-jobs.js';
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
  // A predator in sight frightens, the more the closer.
  a.fear[id] = Math.min(100, a.fear[id] + input[INPUT.danger] * ctx.balance.safety.fearSight);
  // Fight or flee: imagined fights against the predators in sight, with the armed members around.
  if (input[INPUT.danger] > 0) {
    const self = ctx.imagined;
    self.hp = a.hp[id];
    self.maxHp = a.maxHp[id];
    self.attack = agentAttack(ctx, id);
    self.defense = agentDefense(ctx, id);
    const enemies = state.threats.countNear(a.x[id], a.y[id], radius);
    const allies = alliesAround(ctx, id);
    const cfg = ctx.balance.imagination;
    const risk = imagineFight(self, ctx.balance.threats, cfg, a.rng[id], allies, enemies);
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
  senseSafety(state, ctx, id, home);
  // Farming: a job in hand, or free jobs seen on the blackboard, for those who know how to sow.
  const sower = home !== null && ctx.plotRecipe >= 0 && a.recipes[id].knows(ctx.plotRecipe);
  const farming = a.farmJob[id] !== FarmJob.NONE;
  input[INPUT.farmWork] = sower ? (farming ? 1 : a.farmSeen[id] === 1 ? 0.8 : 0) : 0;
  input[INPUT.cookDuty] = senseCooking(state, ctx, id, home) ? 1 : 0;
  // One inventor at a time, once the colony is large enough to spare one: the first member at the
  // camp claims it, for a while (it remembers its failed trials).
  if (
    home !== null &&
    home.members >= ctx.balance.colony.inventorMembers &&
    atCamp(ctx, home, id) &&
    opensMaterials(ctx, id)
  ) {
    const current = home.inventor >= 0 && a.alive[home.inventor] === 1 ? home.inventor : -1;
    if (current < 0 || state.tick - home.inventorTick > ctx.balance.colony.inventorTicks) {
      home.inventor = id;
      home.inventorTick = state.tick;
    }
  }
  const young =
    state.tick - a.bornTick[id] < ctx.balance.writing.youngDays * ctx.balance.time.ticksPerDay;
  const unread =
    a.libraryVisited[id] === 0 || (a.librarySeen[id] & ~a.recipes[id].knownMask()) !== 0;
  input[INPUT.unread] = library && unread ? (young ? 1 : 0.7) : 0;
}

/**
 * Armed, awake members within `allyRadius`: they would fight alongside.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
function alliesAround(ctx, id) {
  const a = ctx.agents;
  const r = ctx.balance.safety.allyRadius;
  let n = 0;
  for (let other = 0; other < a.highWater; other++) {
    if (other === id || a.alive[other] !== 1 || a.asleep[other] === 1) continue;
    if (Math.abs(a.x[other] - a.x[id]) > r || Math.abs(a.y[other] - a.y[id]) > r) continue;
    if (carriesKind(ctx, other, 'weapon')) n++;
  }
  return n;
}

/**
 * Safety inputs (docs/design/16-guerre-et-forteresses.md): fear; the guard posts of the colony —
 * as many as its size calls for while it feels threatened (an attack near the camp lately, or a
 * den it knows of), taken by armed members at the camp not averse to risk; a guard keeps watch at
 * night and hunts a den it knows of by day, with enough guards to go together.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('../colony/colony-store.js').Colony | null} home
 * @returns {void}
 */
function senseSafety(state, ctx, id, home) {
  const a = ctx.agents;
  const input = ctx.inputs;
  const s = ctx.balance.safety;
  input[INPUT.fear] = a.fear[id] / 100;
  input[INPUT.guardDuty] = 0;
  input[INPUT.huntDuty] = 0;
  if (home === null) return;
  const day = state.balance.time.ticksPerDay;
  const den = knownDen(state, ctx, id, ctx.exploreTarget);
  const threatened = state.tick - home.lastThreat < s.threatDays * day || den;
  const wanted = threatened ? Math.min(MAX_GUARDS, Math.ceil(home.members / s.membersPerGuard)) : 0;
  let slot = -1;
  let guards = 0;
  for (let k = 0; k < MAX_GUARDS; k++) {
    const g = home.guards[k];
    if (g >= 0 && a.alive[g] !== 1) home.guards[k] = -1;
    if (home.guards[k] >= 0) guards++;
    if (home.guards[k] === id) slot = k;
  }
  if (slot >= 0 && (guards > wanted || state.tick - home.guardTick[slot] > s.guardTicks)) {
    home.guards[slot] = -1;
    slot = -1;
    guards--;
  }
  if (slot < 0 && guards < wanted && atCamp(ctx, home, id) && fitToGuard(state, ctx, id, home)) {
    slot = home.guards.indexOf(-1);
    home.guards[slot] = id;
    home.guardTick[slot] = state.tick;
    guards++;
    state.events.push(state.tick, EventType.GUARD, id, a.x[id], a.y[id]);
  }
  if (slot < 0) return;
  if (ctx.darkness > s.watchDarkness || needsGear(ctx, id)) input[INPUT.guardDuty] = 1;
  else if (den && guards >= s.huntGroup && a.hp[id] >= a.maxHp[id] * s.huntHealth) {
    input[INPUT.huntDuty] = 1;
  }
}

/**
 * A guard without a weapon, or with a hide or an armour recipe but no armour, equips itself by day.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
export function needsGear(ctx, id) {
  if (!carriesKind(ctx, id, 'weapon')) return true;
  if (carriesKind(ctx, id, 'armor')) return false;
  if (ctx.agents.carried(id, ctx.hideGood) > 0) return true;
  const book = ctx.agents.recipes[id];
  return ctx.catalog.items.some(
    (item) => item.kind === 'armor' && book.knows(ctx.catalog.recipeForGood[item.good]),
  );
}

/**
 * A member fit to guard: armed or able to make a weapon, not the scribe nor the inventor, and not
 * too averse to risk.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('../colony/colony-store.js').Colony} home
 * @returns {boolean}
 */
function fitToGuard(state, ctx, id, home) {
  if (home.scribe === id || home.inventor === id) return false;
  // Armed, or able to make a weapon.
  const book = ctx.agents.recipes[id];
  const armed =
    carriesKind(ctx, id, 'weapon') ||
    ctx.catalog.items.some(
      (item) => item.kind === 'weapon' && book.knows(ctx.catalog.recipeForGood[item.good]),
    );
  if (!armed) return false;
  const k = ctx.genes.index.risk;
  const risk = k === undefined ? 0.5 : geneLevel(ctx.genes, ctx.agents.genes, id, k);
  return risk <= ctx.balance.safety.guardRiskMax;
}

/**
 * True if the agent knows how to make a tool that opens a material (a pickaxe for coal, copper):
 * only such a member can become the colony's inventor.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
function opensMaterials(ctx, id) {
  const catalog = ctx.catalog;
  for (let g = 1; g <= catalog.resourceCount; g++) {
    const tool = catalog.requiredTool[g];
    if (tool <= 0) continue;
    const r = catalog.recipeForGood[tool];
    if (r >= 0 && ctx.agents.recipes[id].knows(r)) return true;
  }
  return false;
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
    notePass(ctx, id);
    senseInputs(state, ctx, id);
    const favoured = projectGoal(state, ctx, id);
    const current = a.goal[id];
    goalWeights(ctx.genes, a.genes, id, ctx.goalWeights);
    const weights = ctx.goalWeights;
    // The colony lacks knowledge most (as read on the blackboard): writing and reading matter more.
    if (a.focusSeen[id] === Component.KNOWLEDGE) {
      const boost = 1 + ctx.balance.harmony.focusKnowledge;
      weights[ctx.goalIndex.write] *= boost;
      weights[ctx.goalIndex.read] *= boost;
    }
    let goal = scoreGoals(ctx.goals, input, current, scores, a.rng[id], favoured, bonus, weights);
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
