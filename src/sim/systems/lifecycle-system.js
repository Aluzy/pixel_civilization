import { releaseTask } from '../colony/colony-logic.js';
import { releaseBed } from '../colony/people.js';
import { EventType } from '../core/events.js';
import { bequeath } from '../economy/market.js';

/**
 * A member killed by a predator frightens those who were near enough to see or hear it, and
 * marks a threat for its colony.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function frighten(state, ctx, id) {
  const a = ctx.agents;
  const s = ctx.balance.safety;
  if (a.colony[id] >= 0) state.colonies[a.colony[id]].lastThreat = state.tick;
  const n = a.near(a.x[id], a.y[id], s.deathRadius);
  const found = a.grid.found;
  for (let k = 0; k < n; k++) {
    const other = found[k];
    if (other !== id) a.fear[other] = Math.min(100, a.fear[other] + s.fearDeath);
  }
}

/**
 * Removes agents whose health reached zero or who reached their lifespan (old age): their task is
 * freed, their colony counts the loss, what they carried is lost (their écus go to their
 * children), and the others forget them.
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
    // Subject 1: died of old age; 2: killed by a predator (struck this very tick).
    const killed = a.hp[id] <= 0 && state.tick - a.attackedTick[id] <= 1;
    const cause = old && a.hp[id] > 0 ? 1 : killed ? 2 : 0;
    state.events.push(state.tick, EventType.DEATH, id, a.x[id], a.y[id], cause);
    if (killed) frighten(state, ctx, id);
    state.knowledge.noteDeath(id, state.tick);
    // A death of hunger or thirst is a famine for the colony's stability.
    const critical = ctx.balance.needs.critical;
    const starved = !old && (a.hunger[id] >= critical || a.thirst[id] >= critical);
    if (starved && a.colony[id] >= 0) {
      const colony = state.colonies[a.colony[id]];
      colony.lastStarvation = state.tick;
      colony.starvedToday++;
    }
    // What it carried is lost with it, its writings too.
    const docs = state.documents;
    for (let d = 0; d < docs.max; d++) if (docs.holder[d] === id) docs.destroy(d);
    releaseTask(state, ctx, id);
    releaseBed(state, a, id);
    bequeath(state, ctx, id);
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
