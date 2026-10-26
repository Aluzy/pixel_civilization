import { PACK } from '../world/chunk-store.js';
import { andNot, lowest, withBit } from '../core/bits.js';
import { EventType } from '../core/events.js';
import { geneLevel } from '../genome/genome.js';
import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { explore, moveTo, startHere } from './movement.js';

// Masters and pupils (docs/design/18-expansion-et-commerce.md, « Le savoir durable »): the member
// who masters a recipe best teaches at the school (else at the library); members who do not know
// a recipe the master teaches come and learn it there instead of reading. A good master, fond of
// teaching, passes on a stronger memory.

/**
 * Where the colony teaches: its school if it stands, else its first standing library.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {Int32Array} out - Receives x, y.
 * @returns {boolean} False if the colony has neither.
 */
export function teachPlace(state, ctx, colony, out) {
  if (colony.hasSchool) {
    const code = state.world.packedAt(colony.schoolX, colony.schoolY) >>> PACK.STRUCTURE_SHIFT;
    if (code === ctx.schoolCode) {
      out[0] = colony.schoolX;
      out[1] = colony.schoolY;
      return true;
    }
    colony.hasSchool = false;
  }
  for (let i = 0; i < colony.libraryCount; i++) {
    if (colony.libraryStanding[i] !== 1) continue;
    out[0] = colony.libraryX[i];
    out[1] = colony.libraryY[i];
    return true;
  }
  return false;
}

/**
 * The strongest memory the agent has of a recipe it knows rightly, 0 to 1: its mastery.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function mastery(state, ctx, id) {
  const book = ctx.agents.recipes[id];
  let best = 0;
  for (let r = 0; r < book.recipeCount; r++) {
    if (book.known[r] !== 1 || book.wrong[r] === 1) continue;
    const s = book.strength(r, state.tick);
    if (s > best) best = s;
  }
  return best;
}

/**
 * True if a lesson is given now in the agent's colony with a recipe it does not know.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony | null} colony
 * @param {number} id
 * @returns {boolean}
 */
export function lessonFor(state, ctx, colony, id) {
  if (colony === null || colony.teacher < 0 || colony.teacher === id) return false;
  if (state.tick - colony.teachTick > 1) return false;
  return andNot(colony.lessonMask, ctx.agents.recipes[id].knownMask()) !== 0;
}

/**
 * Behaviour of the goal Enseigner: to the teaching place, then teaching there.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function teachBehaviour(state, ctx, id, plan) {
  plan.note = PlanNote.TEACHING;
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0 || !teachPlace(state, ctx, state.colonies[c], ctx.siteOut)) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  goBeside(ctx, id, ctx.siteOut[0], ctx.siteOut[1], 1, Action.TEACH, plan);
  if (plan.action === Action.IDLE) explore(state, ctx, id, plan);
}

/**
 * The pupil goes to the master (beside it), then learns.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function learnBehaviour(state, ctx, id, plan) {
  plan.note = PlanNote.TEACHING;
  const colony = state.colonies[ctx.agents.colony[id]];
  goBeside(ctx, id, colony.teachX, colony.teachY, ctx.balance.teaching.reach, Action.LEARN, plan);
}

/**
 * Starts `then` within `reach` of (x, y), or walks there.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {number} reach
 * @param {number} then
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function goBeside(ctx, id, x, y, reach, then, plan) {
  const a = ctx.agents;
  plan.action = Action.IDLE;
  if (Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y)) <= reach) {
    startHere(ctx, id, then);
    plan.action = then;
    return;
  }
  const nav = ctx.nav;
  // The nearest reachable cell within reach of the place.
  let best = -1;
  const n = nav.side * nav.side;
  for (let i = 0; i < n; i++) {
    if (!nav.reachable(i)) continue;
    if (Math.max(Math.abs(nav.cellX(i) - x), Math.abs(nav.cellY(i) - y)) > reach) continue;
    if (best < 0 || nav.dist[i] < nav.dist[best]) best = i;
  }
  const cell = best >= 0 ? best : nav.toward(x, y);
  if (cell >= 0 && moveTo(ctx, id, cell, best >= 0 ? then : Action.NONE)) {
    plan.action = Action.MOVE;
    plan.x = x;
    plan.y = y;
  }
}

/**
 * One tick of teaching: the lesson is posted (the recipes the master knows rightly), at its place.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} False when the session is over (or the master is no longer the teacher).
 */
export function teachTick(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return false;
  const colony = state.colonies[c];
  if (colony.teacher !== id) return false;
  const book = a.recipes[id];
  let mask = 0;
  for (let r = 0; r < book.recipeCount; r++) {
    if (book.known[r] === 1 && book.wrong[r] === 0) mask = withBit(mask, r);
  }
  colony.lessonMask = mask;
  colony.teachTick = state.tick;
  colony.teachX = a.x[id];
  colony.teachY = a.y[id];
  a.actionProgress[id] += 1;
  return a.actionProgress[id] < ctx.balance.teaching.sessionTicks;
}

/**
 * One tick of learning beside the master: after a lesson, the pupil knows one recipe it lacked,
 * remembered as strongly as the master remembers it, more with a master fond of teaching, longer
 * at a school.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} False when there is nothing more to learn here.
 */
export function learnTick(state, ctx, id) {
  const a = ctx.agents;
  const colony = state.colonies[a.colony[id]];
  if (!lessonFor(state, ctx, colony, id)) return false;
  const cfg = ctx.balance.teaching;
  if (Math.max(Math.abs(a.x[id] - colony.teachX), Math.abs(a.y[id] - colony.teachY)) > cfg.reach) {
    return false;
  }
  a.actionProgress[id] += 1;
  if (a.actionProgress[id] < cfg.lessonTicks) return true;
  a.actionProgress[id] = 0;
  const book = a.recipes[id];
  const r = lowest(andNot(colony.lessonMask, book.knownMask()));
  if (r < 0) return false;
  const master = colony.teacher;
  const k = ctx.genes.index.teaching;
  const fond = k === undefined ? 0.5 : geneLevel(ctx.genes, a.genes, master, k);
  const strength = Math.min(1, a.recipes[master].strength(r, state.tick) * (0.5 + 0.5 * fond));
  const tau = ctx.recipeTau * (colony.hasSchool ? cfg.schoolTau : 1);
  book.learn(r, state.tick, tau, strength);
  // Teaching it, the master remembers it better too.
  a.recipes[master].use(r, state.tick, ctx.balance.memory.consolidation, ctx.maxTau);
  state.events.push(state.tick, EventType.TAUGHT, id, a.x[id], a.y[id], r, master);
  return true;
}
