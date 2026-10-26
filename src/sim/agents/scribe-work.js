import { campOf } from '../colony/colony-logic.js';
import { DocKind } from '../knowledge/document-store.js';
import {
  carriesWriting,
  libraryBeside,
  nextToWrite,
  wantsMap,
  writable,
} from '../knowledge/writing.js';
import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { explore, moveTo, startHere } from './movement.js';
import { pursue } from './work.js';

// Behaviours of the knowledge goals: writing books and maps, reading in the library.

/**
 * Walks to the nearest standing library of the agent's colony and starts `then` beside it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} then
 * @param {import('./movement.js').Plan} plan
 * @returns {boolean} False if there is no library or no way towards it.
 */
function goToLibrary(state, ctx, id, then, plan) {
  if (libraryBeside(state, ctx, id) >= 0) {
    startHere(ctx, id, then);
    plan.action = then;
    return true;
  }
  const colony = campOf(state, ctx, id);
  if (!colony) return false;
  const a = ctx.agents;
  const li = colony.nearestLibrary(a.x[id], a.y[id]);
  if (li < 0) return false;
  const x = colony.libraryX[li];
  const y = colony.libraryY[li];
  const nav = ctx.nav;
  // In sight: walk onto the library tile itself; else towards it.
  const near = nav.cellAt(x, y);
  const cell = near >= 0 && nav.reachable(near) ? near : nav.toward(x, y);
  if (cell < 0 || !moveTo(ctx, id, cell, cell === near ? then : Action.NONE)) return false;
  plan.action = Action.MOVE;
  plan.x = x;
  plan.y = y;
  return true;
}

/**
 * Writing what it knows (docs/design/05-savoir.md): with a book that has room and a recipe the
 * library lacks (as far as it saw), write it at the library; with nothing left to write, store
 * what it wrote there; without a book, make one (GOAP, with discovery if the recipe is unknown).
 * Once its recipes are written, it may also draw a map of the places it knows.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function writeBehaviour(state, ctx, id, plan) {
  const w = ctx.balance.writing;
  const docs = state.documents;
  plan.note = PlanNote.WRITING;
  const book = writable(state, ctx, id);
  const toWrite = nextToWrite(state, ctx, id, book);
  if (toWrite >= 0) {
    if (book >= 0) {
      if (!goToLibrary(state, ctx, id, Action.WRITE, plan)) explore(state, ctx, id, plan);
      return;
    }
    pursue(state, ctx, id, ctx.bookTarget, plan);
    plan.note = PlanNote.WRITING;
    return;
  }
  if (wantsMap(state, ctx, id)) {
    if (docs.carried(id, DocKind.MAP, w.mapEntries) >= 0) {
      if (!goToLibrary(state, ctx, id, Action.WRITE, plan)) explore(state, ctx, id, plan);
      return;
    }
    pursue(state, ctx, id, ctx.mapTarget, plan);
    plan.note = PlanNote.WRITING;
    return;
  }
  if (carriesWriting(state, id)) {
    if (!goToLibrary(state, ctx, id, Action.STORE, plan)) explore(state, ctx, id, plan);
    return;
  }
  startHere(ctx, id, Action.IDLE);
}

/**
 * Reading in the library what it does not know yet.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function readBehaviour(state, ctx, id, plan) {
  plan.note = PlanNote.READING;
  if (!goToLibrary(state, ctx, id, Action.READ, plan)) explore(state, ctx, id, plan);
}
