import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { EventType } from '../../src/sim/core/events.js';
import { createRng } from '../../src/sim/core/rng.js';
import { DocKind, DocumentStore } from '../../src/sim/knowledge/document-store.js';
import { KnowledgeLog } from '../../src/sim/knowledge/knowledge-log.js';
import {
  collectiveKnowledge,
  libraryBeside,
  readOne,
  storeDocuments,
  writeOne,
} from '../../src/sim/knowledge/writing.js';
import { CATALOG, Simulation } from '../../src/sim/simulation.js';
import { PACK } from '../../src/sim/world/chunk-store.js';
import { knowledgeSystem } from '../../src/sim/systems/knowledge-system.js';

const DAY = balance.time.ticksPerDay;
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
const libraryCode = CATALOG.structures.find((s) => s.kind === 'library').code;

/**
 * A simulation whose first agent stands next to its colony's library.
 * @param {number} [seed]
 * @returns {Simulation}
 */
function withLibrary(seed = 5) {
  const sim = new Simulation({ seed, balance });
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  const x = a.x[0] + 1;
  const y = a.y[0];
  sim.state.world.setStructure(x, y, libraryCode);
  colony.addLibrary(x, y, sim.tick);
  return sim;
}

/**
 * A new member of colony 0 beside the first agent.
 * @param {Simulation} sim
 * @returns {number}
 */
function newcomer(sim) {
  const a = sim.agents;
  return a.create({
    x: a.x[0],
    y: a.y[0] + 1,
    tick: sim.tick,
    attributes: balance.agent.start,
    needs: balance.agent.startNeeds,
    rng: createRng(9),
    colony: 0,
  });
}

/**
 * Gives the agent a blank book to carry.
 * @param {Simulation} sim
 * @param {number} id
 * @returns {number} Document id.
 */
function giveBook(sim, id) {
  const doc = sim.state.documents.create(DocKind.BOOK, id, sim.tick);
  sim.agents.addCarried(id, sim.ctx.docGood[DocKind.BOOK], 1, sim.tick);
  return doc;
}

describe('documents', () => {
  it('creates, finds and destroys books and maps', () => {
    const docs = new DocumentStore(4, 8);
    const book = docs.create(DocKind.BOOK, 3, 10);
    const map = docs.create(DocKind.MAP, 3, 11);
    expect(docs.count).toBe(2);
    expect(docs.carried(3, DocKind.BOOK, 2)).toBe(book);
    expect(docs.carried(3, DocKind.MAP, 2)).toBe(map);
    expect(docs.carried(4, DocKind.BOOK, 2)).toBe(-1);
    // A full book has no room left.
    docs.recipes[book] = 0b11;
    expect(docs.carried(3, DocKind.BOOK, 2)).toBe(-1);
    docs.destroy(book);
    expect(docs.count).toBe(1);
    expect(docs.create(DocKind.BOOK, 1, 12)).toBe(book);
  });

  it('gathers what the documents of a library hold', () => {
    const docs = new DocumentStore(4, 8);
    const out = new Int32Array(2);
    for (const [recipes, wrong] of [
      [0b0110, 0b0100],
      [0b1000, 0],
    ]) {
      const d = docs.create(DocKind.BOOK, -1, 0);
      docs.holder[d] = -1;
      docs.colony[d] = 0;
      docs.library[d] = 2;
      docs.recipes[d] = recipes;
      docs.wrong[d] = wrong;
    }
    expect(docs.libraryContent(0, 2, out)).toBe(2);
    expect([...out]).toEqual([0b1110, 0b0100]);
    expect(docs.libraryContent(0, 1, out)).toBe(0);
  });
});

describe('writing and reading', () => {
  it('writes what it knows, stores the book, and a newcomer reads it', () => {
    const sim = withLibrary();
    const a = sim.agents;
    const docs = sim.state.documents;
    a.recipes[0].learn(recipe('workbench'), sim.tick, 1000);
    a.recipes[0].learn(recipe('spear'), sim.tick, 1000);
    const book = giveBook(sim, 0);
    expect(writeOne(sim.state, sim.ctx, 0)).toBe(true);
    expect(writeOne(sim.state, sim.ctx, 0)).toBe(true);
    expect(writeOne(sim.state, sim.ctx, 0)).toBe(false);
    expect(docs.recipes[book]).toBe((1 << recipe('workbench')) | (1 << recipe('spear')));
    expect(docs.author[book]).toBe(0);
    const li = libraryBeside(sim.state, sim.ctx, 0);
    expect(li).toBe(0);
    expect(storeDocuments(sim.state, sim.ctx, 0, li)).toBe(1);
    expect(docs.holder[book]).toBe(-1);
    expect(docs.library[book]).toBe(li);
    expect(a.carried(0, sim.ctx.docGood[DocKind.BOOK])).toBe(0);
    // It saw its writings there: nothing more to write.
    giveBook(sim, 0);
    expect(writeOne(sim.state, sim.ctx, 0)).toBe(false);

    // Another member of the colony, at the library, learns both recipes by reading.
    const reader = newcomer(sim);
    expect(libraryBeside(sim.state, sim.ctx, reader)).toBe(0);
    expect(readOne(sim.state, sim.ctx, reader, 0)).toBe(true);
    expect(readOne(sim.state, sim.ctx, reader, 0)).toBe(true);
    expect(a.recipes[reader].knows(recipe('workbench'))).toBe(true);
    expect(a.recipes[reader].knows(recipe('spear'))).toBe(true);
    const reads = sim.events.events.filter((e) => e.type === EventType.READ);
    expect(reads.map((e) => e.agent)).toEqual([reader, reader]);
  });

  it('copies a wrong recipe as wrong, and reads it wrong only if no copy is right', () => {
    const sim = withLibrary();
    const a = sim.agents;
    const r = recipe('spear');
    a.recipes[0].learn(r, sim.tick, 1000, 0.5, true);
    const book = giveBook(sim, 0);
    writeOne(sim.state, sim.ctx, 0);
    expect(sim.state.documents.wrong[book]).toBe(1 << r);
    storeDocuments(sim.state, sim.ctx, 0, 0);
    const reader = newcomer(sim);
    readOne(sim.state, sim.ctx, reader, 0);
    expect(a.recipes[reader].wrong[r]).toBe(1);
  });

  it('copies remembered places onto a map', () => {
    const sim = withLibrary();
    const a = sim.agents;
    a.memory[0].remember(0, 7, 9, 0, sim.tick, 1, 1000, 4);
    const map = sim.state.documents.create(DocKind.MAP, 0, sim.tick);
    expect(writeOne(sim.state, sim.ctx, 0)).toBe(true);
    const docs = sim.state.documents;
    const k = map * docs.mapEntries;
    expect([docs.entrySubject[k], docs.entryX[k], docs.entryY[k]]).toEqual([0, 7, 9]);
  });
});

describe('libraries and collective knowledge', () => {
  it('counts what the living know and what is written within reach', () => {
    const sim = withLibrary();
    const a = sim.agents;
    const out = new Int32Array(2);
    a.recipes[0].learn(recipe('spear'), sim.tick, 1000);
    giveBook(sim, 0);
    writeOne(sim.state, sim.ctx, 0);
    storeDocuments(sim.state, sim.ctx, 0, 0);
    collectiveKnowledge(sim.state, sim.ctx, out);
    expect(out[0]).toBe(1 << recipe('spear'));
    expect(out[1]).toBe(1 << recipe('spear'));
    // Abandoned, the library is out of reach.
    sim.state.colonies[0].libraryAbandoned[0] = 1;
    collectiveKnowledge(sim.state, sim.ctx, out);
    expect(out[1]).toBe(0);
  });

  it('abandons a library nobody comes near, and reports knowledge lost then found again', () => {
    const sim = withLibrary();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const r = recipe('spear');
    sim.state.knowledge.noteDiscovery(r, 0, 0);
    a.recipes[0].learn(r, sim.tick, 1000);
    giveBook(sim, 0);
    writeOne(sim.state, sim.ctx, 0);
    storeDocuments(sim.state, sim.ctx, 0, 0);
    a.recipes[0].forget(r);
    // Far from the library for longer than abandonDays.
    a.x[0] += 10 * balance.writing.abandonRadius;
    const w = balance.writing;
    sim.state.tick = (w.abandonDays + 1) * DAY;
    knowledgeSystem(sim.state, sim.ctx);
    expect(colony.libraryAbandoned[0]).toBe(1);
    const k = sim.state.knowledge;
    expect(k.lostMask & (1 << r)).not.toBe(0);
    expect(sim.events.events.some((e) => e.type === EventType.KNOWLEDGE_LOST)).toBe(true);
    // Coming back to the library brings its books back within reach.
    a.x[0] -= 10 * balance.writing.abandonRadius;
    sim.state.tick += w.knowledgeInterval;
    knowledgeSystem(sim.state, sim.ctx);
    expect(colony.libraryAbandoned[0]).toBe(0);
    expect(k.recovered[r]).toBe(sim.state.tick);
    expect(sim.events.events.at(-1).type).toBe(EventType.KNOWLEDGE_RECOVERED);
  });

  it('may burn a library with its books', () => {
    const b = structuredClone(balance);
    b.writing.fireChancePerDay = 1;
    const sim = new Simulation({ seed: 5, balance: b });
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const x = a.x[0] + 1;
    sim.state.world.setStructure(x, a.y[0], libraryCode);
    colony.addLibrary(x, a.y[0], sim.tick);
    a.recipes[0].learn(recipe('spear'), sim.tick, 1000);
    giveBook(sim, 0);
    writeOne(sim.state, sim.ctx, 0);
    storeDocuments(sim.state, sim.ctx, 0, 0);
    sim.state.tick = DAY;
    knowledgeSystem(sim.state, sim.ctx);
    expect(colony.libraryStanding[0]).toBe(0);
    expect(sim.state.world.packedAt(x, a.y[0]) >>> PACK.STRUCTURE_SHIFT).toBe(0);
    expect(sim.state.documents.count).toBe(0);
    const fire = sim.events.events.find((e) => e.type === EventType.FIRE);
    expect(fire.subject).toBe(1);
  });
});

describe('knowledge log', () => {
  it('notes who discovered a recipe and whether a book saved it after their death', () => {
    const log = new KnowledgeLog(4);
    log.noteDiscovery(2, 7, 100);
    log.noteDiscovery(2, 8, 200);
    expect([log.discovered[2], log.discoverer[2]]).toEqual([100, 7]);
    log.noteRead(2, 300);
    expect(log.savedByBook[2]).toBe(-1);
    log.noteDeath(7, 400);
    expect(log.discovererDied[2]).toBe(400);
    log.noteRead(2, 500);
    log.noteRead(2, 600);
    expect(log.savedByBook[2]).toBe(500);
  });
});

describe('ageing', () => {
  it('dies of old age at the end of its lifespan', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const [lo, hi] = balance.agent.lifespanDays;
    expect(a.lifespan[0]).toBeGreaterThanOrEqual(lo * DAY);
    expect(a.lifespan[0]).toBeLessThanOrEqual(hi * DAY);
    a.bornTick[0] = sim.tick - a.lifespan[0] + 1;
    sim.step(2);
    expect(a.alive[0]).toBe(0);
    const death = sim.events.events.find((e) => e.type === EventType.DEATH);
    expect(death.subject).toBe(1);
  });
});

// J6 exit: a recipe survives the death of the one who discovered it thanks to a book, and a game
// shows at least one piece of knowledge lost then found again. Seed 8 tells both: the workbench
// is read in the library on day 59 after its discoverer died, then lost on day 83 (nobody alive
// knows it, no book within reach) and rediscovered by trial on day 119.
describe('written knowledge (J6 exit)', () => {
  it('saves a recipe through a book, and loses then finds knowledge again (seed 8)', () => {
    const sim = new Simulation({ seed: 8, balance });
    const k = sim.state.knowledge;
    const saved = () => k.savedByBook.some((t) => t >= 0);
    const found = () => k.recovered.some((t, r) => t >= 0 && k.lost[r] >= 0 && t > k.lost[r]);
    for (let day = 0; day < 125 && !(saved() && found()); day++) sim.step(DAY);
    expect(saved()).toBe(true);
    const r = k.savedByBook.findIndex((t) => t >= 0);
    expect(k.discovererDied[r]).toBeGreaterThanOrEqual(0);
    expect(k.savedByBook[r]).toBeGreaterThan(k.discovererDied[r]);
    expect(found()).toBe(true);
  }, 300000);
});
