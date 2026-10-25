import { tauOf } from '../agents/beliefs.js';
import { EventType } from '../core/events.js';
import { DocKind, popcount } from './document-store.js';

// Writing, reading and keeping documents (docs/design/05-savoir.md, « Livres », « Cartes »,
// « Bibliothèques »). One writes only what one believes; one reads only in a library.

/**
 * Library of the agent's colony on or next to its tile (standing and not abandoned), or -1.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function libraryBeside(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return -1;
  const colony = state.colonies[c];
  for (let i = 0; i < colony.libraryCount; i++) {
    if (colony.libraryStanding[i] !== 1) continue;
    if (Math.abs(colony.libraryX[i] - a.x[id]) > 1 || Math.abs(colony.libraryY[i] - a.y[id]) > 1) {
      continue;
    }
    return i;
  }
  return -1;
}

/**
 * At a library: the agent sees what is written there (its belief about the library), and the
 * library is visited (no longer abandoned).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} li - Library index.
 * @returns {void}
 */
export function lookAtLibrary(state, ctx, id, li) {
  const a = ctx.agents;
  const c = a.colony[id];
  const colony = state.colonies[c];
  state.documents.libraryContent(c, li, ctx.contentOut);
  a.librarySeen[id] = ctx.contentOut[0];
  a.mapSeen[id] = ctx.contentOut[2];
  a.libraryVisited[id] = 1;
  colony.libraryVisit[li] = state.tick;
  colony.libraryAbandoned[li] = 0;
}

/**
 * Bit set of recipes the agent believes it knows.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function believedRecipes(ctx, id) {
  return ctx.agents.recipes[id].knownMask();
}

/**
 * Next recipe the agent would write in a book: one it knows, not yet in the book nor (as far as
 * it saw) in its library. -1 if none.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} doc - Book being written, or -1.
 * @returns {number}
 */
export function nextToWrite(state, ctx, id, doc) {
  const inBook = doc >= 0 ? state.documents.recipes[doc] : 0;
  const todo = believedRecipes(ctx, id) & ~ctx.agents.librarySeen[id] & ~inBook;
  if (todo === 0) return -1;
  return 31 - Math.clz32(todo & -todo);
}

/**
 * True if the agent would draw a map for its library: it remembers places, and as far as it saw
 * the library has no map, or only one older than `mapRefreshDays`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
export function wantsMap(state, ctx, id) {
  const a = ctx.agents;
  if (a.libraryVisited[id] === 0) return false;
  const memory = a.memory[id];
  let places = 0;
  for (let i = 0; i < memory.count; i++) {
    if (memory.subject[i] !== ctx.catalog.dangerSubject) places++;
  }
  if (places === 0) return false;
  const age = ctx.balance.writing.mapRefreshDays * ctx.balance.time.ticksPerDay;
  return a.mapSeen[id] < 0 || state.tick - a.mapSeen[id] > age;
}

/**
 * Writes one recipe in the book (or one memory in the map) the agent carries.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} False when there is nothing more to write.
 */
export function writeOne(state, ctx, id) {
  const docs = state.documents;
  const w = ctx.balance.writing;
  const book = docs.carried(id, DocKind.BOOK, w.bookRecipes);
  const r = book >= 0 ? nextToWrite(state, ctx, id, book) : -1;
  if (r >= 0) {
    docs.recipes[book] |= 1 << r;
    if (ctx.agents.recipes[id].wrong[r] === 1) docs.wrong[book] |= 1 << r;
    docs.author[book] = id;
    ctx.agents.recipes[id].use(r, state.tick, ctx.balance.memory.consolidation, ctx.maxTau);
    state.events.push(state.tick, EventType.WRITTEN, id, ctx.agents.x[id], ctx.agents.y[id], r);
    return true;
  }
  const map = docs.carried(id, DocKind.MAP, w.mapEntries);
  if (map < 0) return false;
  return writeEntry(state, ctx, id, map);
}

/**
 * Copies the next remembered place (not a danger, not already on the map) onto the map.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} map
 * @returns {boolean}
 */
function writeEntry(state, ctx, id, map) {
  const docs = state.documents;
  const memory = ctx.agents.memory[id];
  const base = map * docs.mapEntries;
  for (let i = 0; i < memory.count; i++) {
    const subject = memory.subject[i];
    if (subject === ctx.catalog.dangerSubject) continue;
    let present = false;
    for (let k = 0; k < docs.entryCount[map]; k++) {
      if (docs.entrySubject[base + k] === subject && docs.entryX[base + k] === memory.x[i]) {
        present = true;
        break;
      }
    }
    if (present) continue;
    const k = docs.entryCount[map]++;
    docs.entrySubject[base + k] = subject;
    docs.entryX[base + k] = memory.x[i];
    docs.entryY[base + k] = memory.y[i];
    docs.entryTick[base + k] = memory.seen[i];
    docs.author[map] = id;
    return true;
  }
  return false;
}

/**
 * True if the agent carries a document with something written in it.
 * @param {import('../simulation.js').SimState} state
 * @param {number} id
 * @returns {boolean}
 */
export function carriesWriting(state, id) {
  const docs = state.documents;
  for (let d = 0; d < docs.max; d++) {
    if (docs.kind[d] === DocKind.NONE || docs.holder[d] !== id) continue;
    if (docs.recipes[d] !== 0 || docs.entryCount[d] > 0) return true;
  }
  return false;
}

/**
 * Puts the written documents the agent carries in the library beside it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} li
 * @returns {number} Documents stored.
 */
export function storeDocuments(state, ctx, id, li) {
  const docs = state.documents;
  const a = ctx.agents;
  const c = a.colony[id];
  let kept = docs.libraryContent(c, li, ctx.contentOut);
  let stored = 0;
  for (let d = 0; d < docs.max; d++) {
    if (docs.kind[d] === DocKind.NONE || docs.holder[d] !== id) continue;
    if (docs.recipes[d] === 0 && docs.entryCount[d] === 0) continue;
    if (kept >= ctx.balance.writing.libraryCapacity) break;
    docs.holder[d] = -1;
    docs.colony[d] = c;
    docs.library[d] = li;
    a.addCarried(id, ctx.docGood[docs.kind[d]], -1);
    kept++;
    stored++;
  }
  lookAtLibrary(state, ctx, id, li);
  return stored;
}

/**
 * Reads one thing in the library beside the agent: a recipe it does not know (learnt at full
 * strength, wrong if it was only written wrong), else the places of maps for subjects it knows no
 * place of.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} li
 * @returns {boolean} False when there is nothing more to learn there.
 */
export function readOne(state, ctx, id, li) {
  const a = ctx.agents;
  const c = a.colony[id];
  const docs = state.documents;
  docs.libraryContent(c, li, ctx.contentOut);
  const written = ctx.contentOut[0];
  const book = a.recipes[id];
  const todo = written & ~book.knownMask();
  if (todo !== 0) {
    const r = 31 - Math.clz32(todo & -todo);
    // Right if at least one document has it right.
    let right = false;
    for (let d = 0; d < docs.max; d++) {
      if (docs.kind[d] === DocKind.NONE || docs.colony[d] !== c || docs.library[d] !== li) continue;
      if ((docs.recipes[d] & (1 << r)) !== 0 && (docs.wrong[d] & (1 << r)) === 0) right = true;
    }
    book.learn(r, state.tick, ctx.recipeTau, 1, !right);
    state.events.push(state.tick, EventType.READ, id, a.x[id], a.y[id], r);
    state.knowledge.noteRead(r, state.tick);
    return true;
  }
  return readMapEntry(state, ctx, id, c, li);
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} c
 * @param {number} li
 * @returns {boolean}
 */
function readMapEntry(state, ctx, id, c, li) {
  const docs = state.documents;
  const memory = ctx.agents.memory[id];
  const m = ctx.balance.memory;
  const strength = ctx.balance.writing.mapStrength;
  for (let d = 0; d < docs.max; d++) {
    if (docs.kind[d] !== DocKind.MAP || docs.colony[d] !== c || docs.library[d] !== li) continue;
    const base = d * docs.mapEntries;
    for (let k = 0; k < docs.entryCount[d]; k++) {
      const subject = docs.entrySubject[base + k];
      let known = false;
      for (let i = 0; i < memory.count; i++) if (memory.subject[i] === subject) known = true;
      if (known) continue;
      const x = docs.entryX[base + k];
      const y = docs.entryY[base + k];
      memory.remember(subject, x, y, 0, state.tick, strength, tauOf(ctx, subject), m.sameRadius);
      return true;
    }
  }
  return false;
}

/**
 * Recipes written in an accessible library or in a document carried by a living agent, and
 * known (rightly) by a living agent.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Int32Array} out - Receives known, written.
 * @returns {void}
 */
export function collectiveKnowledge(state, ctx, out) {
  const a = ctx.agents;
  let known = 0;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const book = a.recipes[id];
    for (let r = 0; r < book.recipeCount; r++) {
      if (book.known[r] === 1 && book.wrong[r] === 0) known |= 1 << r;
    }
  }
  const docs = state.documents;
  let written = 0;
  for (let d = 0; d < docs.max; d++) {
    if (docs.kind[d] === DocKind.NONE) continue;
    if (docs.holder[d] >= 0) {
      if (a.alive[docs.holder[d]] !== 1) continue;
    } else {
      const colony = state.colonies[docs.colony[d]];
      const li = docs.library[d];
      if (colony.libraryStanding[li] !== 1 || colony.libraryAbandoned[li] === 1) continue;
    }
    written |= docs.recipes[d] & ~docs.wrong[d];
  }
  out[0] = known;
  out[1] = written;
}

/**
 * @param {number} mask
 * @returns {number}
 */
export function countRecipes(mask) {
  return popcount(mask);
}
