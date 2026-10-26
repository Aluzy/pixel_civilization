import { has, withBit, withoutBit } from '../core/bits.js';
import { EventType } from '../core/events.js';
import { DocKind } from '../knowledge/document-store.js';
import { collectiveKnowledge } from '../knowledge/writing.js';

/**
 * Libraries and collective knowledge (docs/design/05-savoir.md), every `knowledgeInterval` ticks:
 * a library nobody came near for `abandonDays` is abandoned (its documents out of reach until
 * someone comes back); once a day, lightning may set a library on fire (`fireChancePerDay`, drawn
 * from the natural hazards stream), destroying it and its documents. Then counts what the
 * colony knows and has written, and reports knowledge lost (neither known by the living nor
 * written anywhere accessible) and knowledge found again.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function knowledgeSystem(state, ctx) {
  const w = ctx.balance.writing;
  if (state.tick % w.knowledgeInterval !== 0) return;
  const a = ctx.agents;
  const day = ctx.balance.time.ticksPerDay;
  const daily = state.tick % day === 0;
  for (const colony of state.colonies) {
    for (let li = 0; li < colony.libraryCount; li++) {
      if (colony.libraryStanding[li] !== 1) continue;
      const lx = colony.libraryX[li];
      const ly = colony.libraryY[li];
      for (let id = 0; id < a.highWater; id++) {
        if (a.alive[id] !== 1 || a.colony[id] !== colony.id) continue;
        if (
          Math.abs(a.x[id] - lx) <= w.abandonRadius &&
          Math.abs(a.y[id] - ly) <= w.abandonRadius
        ) {
          colony.libraryVisit[li] = state.tick;
          colony.libraryAbandoned[li] = 0;
          break;
        }
      }
      if (
        colony.libraryAbandoned[li] === 0 &&
        state.tick - colony.libraryVisit[li] > w.abandonDays * day
      ) {
        colony.libraryAbandoned[li] = 1;
        state.events.push(state.tick, EventType.ABANDONED, -1, lx, ly, colony.id);
      }
      if (daily && state.rng.threats.next() < w.fireChancePerDay) burn(state, colony, li);
    }
  }
  const k = state.knowledge;
  collectiveKnowledge(state, ctx, ctx.contentOut);
  k.known = ctx.contentOut[0];
  k.written = ctx.contentOut[1];
  for (let r = 0; r < k.recipes; r++) {
    if (k.discovered[r] < 0) continue;
    const alive = has(k.known, r) || has(k.written, r);
    if (!alive && !has(k.lostMask, r)) {
      k.lostMask = withBit(k.lostMask, r);
      k.lost[r] = state.tick;
      k.losses[r]++;
      state.events.push(state.tick, EventType.KNOWLEDGE_LOST, -1, 0, 0, r);
    } else if (alive && has(k.lostMask, r)) {
      k.lostMask = withoutBit(k.lostMask, r);
      k.recovered[r] = state.tick;
      state.events.push(state.tick, EventType.KNOWLEDGE_RECOVERED, -1, 0, 0, r);
    }
  }
}

/**
 * A library burns: the building and every document kept there are gone.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} li
 * @returns {void}
 */
function burn(state, colony, li) {
  colony.libraryStanding[li] = 0;
  const x = colony.libraryX[li];
  const y = colony.libraryY[li];
  state.world.setStructure(x, y, 0);
  const docs = state.documents;
  let lost = 0;
  for (let d = 0; d < docs.max; d++) {
    if (docs.kind[d] === DocKind.NONE || docs.colony[d] !== colony.id || docs.library[d] !== li) {
      continue;
    }
    docs.destroy(d);
    lost++;
  }
  state.events.push(state.tick, EventType.FIRE, -1, x, y, lost);
}
