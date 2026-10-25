import { releaseTask } from '../colony/colony-logic.js';
import { EventType } from '../core/events.js';

/**
 * Removes agents whose health reached zero or who reached their lifespan (old age): their task is
 * freed, their colony counts the loss, what they carried is lost, and the others forget them.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function lifecycleSystem(state, ctx) {
  const a = ctx.agents;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const old = state.tick - a.bornTick[id] >= a.lifespan[id];
    if (a.hp[id] > 0 && !old) continue;
    // Subject 1: died of old age.
    state.events.push(
      state.tick,
      EventType.DEATH,
      id,
      a.x[id],
      a.y[id],
      old && a.hp[id] > 0 ? 1 : 0,
    );
    state.knowledge.noteDeath(id, state.tick);
    // What it carried is lost with it, its writings too.
    const docs = state.documents;
    for (let d = 0; d < docs.max; d++) if (docs.holder[d] === id) docs.destroy(d);
    releaseTask(state, ctx, id);
    if (a.colony[id] >= 0) {
      const colony = state.colonies[a.colony[id]];
      colony.deaths++;
      colony.members--;
    }
    a.kill(id);
    // The others forget the dead (its id may be reused).
    for (let other = 0; other < a.highWater; other++) {
      if (a.alive[other] === 1) a.social[other].remove(id);
    }
  }
}
