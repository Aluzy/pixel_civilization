import { tauOf } from '../agents/beliefs.js';
import { harvestMultiplier } from '../agents/equipment.js';
import { noteDelivery } from '../agents/experience.js';
import { EventType } from '../core/events.js';
import { ProjectKind } from './colony-store.js';
import { stockPortions } from '../farming/food.js';

// Rules of collective work (docs/design/06-ia.md, couche 4): the blackboard is read and written
// at the camp only; projects are split into tasks ("bring 10 wood"), reserved by members, and
// fulfilled by depositing goods in the stock.

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {import('./colony-store.js').Colony | null} The agent's colony, if it has a camp.
 */
export function campOf(state, ctx, id) {
  const c = ctx.agents.colony[id];
  if (c < 0) return null;
  const colony = state.colonies[c];
  return colony.hasCamp ? colony : null;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} id
 * @returns {boolean} True if the agent is at its camp (within `campRadius`).
 */
export function atCamp(ctx, colony, id) {
  const r = ctx.balance.colony.campRadius;
  const a = ctx.agents;
  return Math.abs(a.x[id] - colony.campX) <= r && Math.abs(a.y[id] - colony.campY) <= r;
}

/**
 * Units of `good` still to bring for a project (needed − delivered − reserved).
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} project
 * @param {number} good
 * @param {number} members
 * @param {object} cfg - balance.colony.
 * @param {import('../farming/food.js').FoodTables} food
 * @param {number} portion - Nutrition of a portion.
 * @returns {number}
 */
export function remaining(colony, project, good, members, cfg, food, portion) {
  if (project.kind === ProjectKind.PANTRY) {
    if (project.needs[good] === 0) return 0;
    // Enough for every member and for one more, in portions of any food (a loaf of bread counts
    // for several): food to spare is what allows a birth.
    const target = Math.round((members + 1) * cfg.foodPerMember * colony.pantryBoost);
    const missing = target - stockPortions(food, colony.stock, portion);
    if (missing <= 0) return 0;
    return Math.max(
      0,
      Math.ceil((missing * portion) / food.nutrition[good]) - project.reserved[good],
    );
  }
  // What was brought for this project and is still in the stock (projects do not share).
  const held = Math.min(project.delivered[good], colony.stock[good]);
  return Math.max(0, project.needs[good] - held - project.reserved[good]);
}

/**
 * A new project takes for itself what lies in the stock unclaimed by the other projects (left
 * over from finished ones), up to what it needs.
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} project
 * @returns {void}
 */
export function claimFreeStock(colony, project) {
  for (let g = 1; g < project.needs.length; g++) {
    if (project.needs[g] === 0) continue;
    let claimed = 0;
    for (const p of colony.projects) {
      if (p !== project && p.kind !== ProjectKind.NONE && p.kind !== ProjectKind.PANTRY) {
        claimed += p.delivered[g];
      }
    }
    const free = Math.max(0, colony.stock[g] - claimed);
    project.delivered[g] = Math.min(project.needs[g], free);
  }
}

/**
 * True if the stock holds all the materials of a shelter project and nobody builds it yet.
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('./colony-store.js').Project} project
 * @returns {boolean}
 */
export function readyToBuild(colony, project) {
  if ((project.recipe < 0 && project.kind !== ProjectKind.FIELD) || project.builder >= 0) {
    return false;
  }
  for (let g = 1; g < project.needs.length; g++) {
    const held = Math.min(project.delivered[g], colony.stock[g]);
    if (held < project.needs[g]) return false;
  }
  return true;
}

/**
 * Reading and writing the blackboard at the camp: the agent posts the places it remembers, and
 * learns where to find what it knows no place of (water, food, materials, stations), at the
 * strength of hearsay. Entries older than `boardMaxAgeDays` are not trusted.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} id
 * @returns {number} Places learnt.
 */
export function shareBoard(state, ctx, colony, id) {
  const a = ctx.agents;
  const memory = a.memory[id];
  const m = ctx.balance.memory;
  const danger = ctx.catalog.dangerSubject;
  a.boardTick[id] = state.tick;
  const food = stockPortions(ctx.foodTables, colony.stock, ctx.balance.cooking.portion);
  a.pantrySeen[id] = Math.min(65535, food);
  a.tasksSeen[id] = colony.open > 0 ? 1 : 0;
  a.farmSeen[id] = colony.farmOpen > 0 ? 1 : 0;
  a.pantryFalling[id] = colony.pantryFalling() ? 1 : 0;
  a.focusSeen[id] = colony.focus;
  for (let i = 0; i < memory.count; i++) {
    if (memory.subject[i] === danger) continue;
    colony.post(memory.subject[i], memory.x[i], memory.y[i], memory.seen[i], m.sameRadius);
  }
  const maxAge = ctx.balance.colony.boardMaxAgeDays * ctx.balance.time.ticksPerDay;
  const heard = ctx.balance.social.heardStrength;
  let learnt = 0;
  for (let i = 0; i < colony.boardCount; i++) {
    const subject = colony.boardSubject[i];
    if (state.tick - colony.boardTick[i] > maxAge || knowsSubject(memory, subject)) continue;
    const x = colony.boardX[i];
    const y = colony.boardY[i];
    memory.remember(subject, x, y, 0, state.tick, heard, tauOf(ctx, subject), m.sameRadius);
    learnt++;
  }
  return learnt;
}

/**
 * @param {import('../agents/memory.js').Memory} memory
 * @param {number} subject
 * @returns {boolean}
 */
function knowsSubject(memory, subject) {
  for (let i = 0; i < memory.count; i++) if (memory.subject[i] === subject) return true;
  return false;
}

/**
 * Open tasks of a colony: units still to bring, plus a shelter ready to build.
 * @param {import('./colony-store.js').Colony} colony
 * @param {object} cfg - balance.colony.
 * @param {import('../farming/food.js').FoodTables} food
 * @param {number} portion
 * @returns {number}
 */
export function openTasks(colony, cfg, food, portion) {
  let n = 0;
  for (const p of colony.projects) {
    if (p.kind === ProjectKind.NONE) continue;
    if (readyToBuild(colony, p)) n++;
    for (let g = 1; g < p.needs.length; g++) {
      if (remaining(colony, p, g, colony.members, cfg, food, portion) > 0) n++;
    }
  }
  return n;
}

/**
 * Chooses and reserves a task for an agent at the camp. Building comes first (only for those who
 * know the recipe); then bringing goods, scored by how fast the agent harvests them (force, tool,
 * habit: roles emerge from what one has already done) and by how close a known place is.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} id
 * @returns {boolean} True if a task was reserved.
 */
export function chooseTask(state, ctx, colony, id) {
  const a = ctx.agents;
  const cfg = ctx.balance.colony;
  const book = a.recipes[id];
  const food = ctx.foodTables;
  const portion = ctx.balance.cooking.portion;
  for (let s = 0; s < colony.projects.length; s++) {
    const p = colony.projects[s];
    // Anyone can plant; only those who know the recipe build.
    if (!readyToBuild(colony, p)) continue;
    if (p.kind !== ProjectKind.FIELD && !book.knows(p.recipe)) continue;
    p.builder = id;
    reserve(state, a, id, s, 0, 0, true);
    return true;
  }
  const memory = a.memory[id];
  const room = ctx.capacity(id) - a.carriedTotal(id);
  if (room <= 0) return false;
  let bestScore = 0;
  let bestSlot = -1;
  let bestGood = 0;
  let total = 0;
  for (let g = 1; g < a.goodSlots; g++) total += a.gathered[id * a.goodSlots + g];
  for (let s = 0; s < colony.projects.length; s++) {
    const p = colony.projects[s];
    if (p.kind === ProjectKind.NONE) continue;
    for (let g = 1; g <= ctx.catalog.resourceCount; g++) {
      if (remaining(colony, p, g, colony.members, cfg, food, portion) <= 0) continue;
      const tool = ctx.catalog.requiredTool[g];
      if (tool < 0 || (tool > 0 && a.carried(id, tool) === 0)) continue;
      const i = memory.nearest(ctx.subjectMasks[g], colony.campX, colony.campY);
      if (i < 0 && a.carried(id, g) === 0) continue;
      const d =
        i < 0
          ? 0
          : Math.max(Math.abs(memory.x[i] - colony.campX), Math.abs(memory.y[i] - colony.campY));
      const speed = (1 + a.force[id] / ctx.harvestForceScale) * harvestMultiplier(ctx, id, g);
      const habit = total > 0 ? a.gathered[id * a.goodSlots + g] / total : 0;
      const urgency = p.kind === ProjectKind.PANTRY ? 1 : 1.2;
      // What it learnt a unit of this good really costs it, once it has brought some.
      const learnt = a.costPerUnit[id * a.goodSlots + g] / ctx.balance.learning.costScale;
      const score = (urgency * speed * (1 + cfg.habitBonus * habit)) / (1 + d / 32) / (1 + learnt);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = s;
        bestGood = g;
      }
    }
  }
  if (bestSlot < 0) return false;
  const p = colony.projects[bestSlot];
  const want = remaining(colony, p, bestGood, colony.members, cfg, food, portion);
  const amount = Math.min(want, room, cfg.taskChunk);
  p.reserved[bestGood] += amount;
  reserve(state, a, id, bestSlot, bestGood, amount, false);
  return true;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {number} id
 * @param {number} slot
 * @param {number} good
 * @param {number} amount
 * @param {boolean} build
 * @returns {void}
 */
function reserve(state, a, id, slot, good, amount, build) {
  a.taskProject[id] = slot;
  a.taskGood[id] = good;
  a.taskAmount[id] = amount;
  a.taskTick[id] = state.tick;
  a.taskBuild[id] = build ? 1 : 0;
}

/**
 * Gives up an agent's task (expired, done, or the agent died).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function releaseTask(state, ctx, id) {
  const a = ctx.agents;
  const slot = a.taskProject[id];
  if (slot < 0) return;
  const c = a.colony[id];
  if (c >= 0) {
    const p = state.colonies[c].projects[slot];
    if (a.taskBuild[id] === 1) {
      if (p.builder === id) p.builder = -1;
    } else {
      p.reserved[a.taskGood[id]] = Math.max(0, p.reserved[a.taskGood[id]] - a.taskAmount[id]);
    }
  }
  a.taskProject[id] = -1;
  a.taskAmount[id] = 0;
  a.taskBuild[id] = 0;
}

/**
 * Deposits the carried units of the task's good in the stock (at the camp) and completes the
 * task. Returns the units deposited.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @param {number} id
 * @returns {number}
 */
export function deposit(state, ctx, colony, id) {
  const a = ctx.agents;
  const slot = a.taskProject[id];
  if (slot < 0 || a.taskBuild[id] === 1) return 0;
  const p = colony.projects[slot];
  const g = a.taskGood[id];
  const units = Math.min(a.carried(id, g), a.taskAmount[id]);
  if (units > 0) {
    noteDelivery(ctx, id, g, units, state.tick - a.taskTick[id]);
    a.addCarried(id, g, -units);
    colony.stock[g] += units;
    if (p.kind !== ProjectKind.PANTRY) p.delivered[g] += units;
    p.addContributor(id);
    a.delivers[id]++;
  }
  releaseTask(state, ctx, id);
  return units;
}

/**
 * The builder takes the materials of its project from the stock.
 * @param {import('./colony-store.js').Colony} colony
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} False if the stock no longer has them.
 */
export function takeMaterials(colony, ctx, id) {
  const a = ctx.agents;
  const p = colony.projects[a.taskProject[id]];
  for (let g = 1; g < p.needs.length; g++) if (colony.stock[g] < p.needs[g]) return false;
  for (let g = 1; g < p.needs.length; g++) {
    if (p.needs[g] === 0) continue;
    colony.stock[g] -= p.needs[g];
    // Taken: if the building fails, these materials will have to be brought again.
    p.delivered[g] = Math.max(0, p.delivered[g] - p.needs[g]);
    a.addCarried(id, g, p.needs[g]);
  }
  return true;
}

/**
 * A structure was built by a member: a shelter becomes a bed of the colony, and if it was the
 * agent's task, the project is complete (reported with its contributors).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} code - Structure code.
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function onBuilt(state, ctx, id, code, x, y) {
  const c = ctx.agents.colony[id];
  if (c < 0) return;
  const colony = state.colonies[c];
  if (ctx.shelterCodes[code] === 1) {
    colony.addShelter(x, y);
    colony.sheltersBuilt++;
  } else if (ctx.catalog.structures[code - 1].kind === 'library') {
    colony.addLibrary(x, y, state.tick);
  }
  const a = ctx.agents;
  const slot = a.taskProject[id];
  if (slot < 0 || a.taskBuild[id] !== 1) return;
  const p = colony.projects[slot];
  if (p.recipe < 0 || ctx.catalog.recipes[p.recipe].output !== code) return;
  p.addContributor(id);
  let helpers = 0;
  for (const other of p.contributors) {
    if (other < 0) continue;
    helpers++;
    // Everyone who worked on it remembers having worked with the others.
    if (a.alive[other] !== 1) continue;
    for (const peer of p.contributors) {
      if (peer < 0 || peer === other) continue;
      const sheet = a.social[other].sheet(peer, state.tick);
      a.social[other].shared[sheet]++;
      a.social[other].affinity[sheet] += ctx.balance.social.sharedAffinity;
    }
  }
  // Subject: helpers × 16 + project kind, so the chronicle can name what was built.
  state.events.push(state.tick, EventType.COLONY_PROJECT, id, x, y, helpers * 16 + p.kind);
  colony.lastProject.set(p.contributors);
  releaseTask(state, ctx, id);
  p.clear();
}
