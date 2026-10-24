import { EventType } from '../core/events.js';
import { isVital, memoryEvent, salienceOf } from './beliefs.js';
import { FORGOTTEN_SLOTS, Remembered, WATER_SUBJECT } from './memory.js';

/**
 * Perception radius of an agent right now (reduced at night, never below the minimum).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {boolean} dark
 * @returns {number}
 */
export function perceptionRadius(ctx, id, dark) {
  const a = ctx.balance.actions;
  const base = ctx.agents.perception[id];
  const r = Math.floor(dark ? base * a.nightPerceptionFactor : base);
  return r < a.minPerception ? a.minPerception : r;
}

/**
 * Stores a sighting and reports a rediscovery of a forgotten place.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} subject
 * @param {number} x
 * @param {number} y
 * @param {number} quantity
 * @returns {void}
 */
function see(state, ctx, id, subject, x, y, quantity) {
  const memory = ctx.agents.memory[id];
  const m = ctx.balance.memory;
  if (memory.count >= memory.capacity && memory.find(subject, x, y, m.sameRadius) < 0) {
    // About to push out the weakest place: report it if it was vital.
    const weakest = memory.weakest(state.tick);
    if (memory.strength(weakest, state.tick) < salienceOf(ctx, subject)) {
      const s = memory.subject[weakest];
      memoryEvent(state, ctx, id, EventType.FORGOT_PLACE, memory.x[weakest], memory.y[weakest], s);
    }
  }
  const result = memory.remember(
    subject,
    x,
    y,
    quantity,
    state.tick,
    salienceOf(ctx, subject),
    ctx.placeTau,
    m.sameRadius,
  );
  if (result !== Remembered.ADDED && result !== Remembered.REPLACED) return;
  if (isVital(ctx, subject) && memory.takeLost(subject, x, y, m.sameRadius) >= 0) {
    memoryEvent(state, ctx, id, EventType.REDISCOVERED, x, y, subject);
  }
}

/**
 * Looks around: prepares the navigation window, marks the area as explored, remembers the
 * nearest reachable place of each subject (water and every resource), and corrects beliefs that
 * what it sees contradicts.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function perceive(state, ctx, id) {
  const agents = ctx.agents;
  const nav = ctx.nav;
  const radius = perceptionRadius(ctx, id, ctx.dark);
  const ax = agents.x[id];
  const ay = agents.y[id];
  nav.prepare(state.world, ax, ay, radius);
  agents.explored[id].markArea(ax - radius, ay - radius, ax + radius, ay + radius, state.tick);

  const water = nav.nearestWaterSide();
  if (water >= 0) see(state, ctx, id, WATER_SUBJECT, nav.cellX(water), nav.cellY(water), 0);

  // Nearest reachable cell of each resource, in one pass over the window.
  const best = ctx.nearestBySubject;
  best.fill(-1);
  const n = nav.side * nav.side;
  for (let i = 0; i < n; i++) {
    const r = nav.resource[i];
    if (r === 0 || nav.quantity[i] === 0 || !nav.reachable(i)) continue;
    if (best[r] < 0 || nav.dist[i] < nav.dist[best[r]]) best[r] = i;
  }
  for (let r = 1; r < best.length; r++) {
    const c = best[r];
    if (c >= 0) see(state, ctx, id, r, nav.cellX(c), nav.cellY(c), nav.quantity[c]);
  }

  // Places it had forgotten and sees again, still valid: rediscovered.
  const memory = agents.memory[id];
  for (let k = 0; k < FORGOTTEN_SLOTS; k++) {
    if (!memory.isLost(k)) continue;
    const subject = memory.lostSubject[k];
    const cell = nav.innerCellAt(memory.lostX[k], memory.lostY[k]);
    if (cell < 0 || !nav.reachable(cell)) continue;
    const valid =
      subject === WATER_SUBJECT
        ? nav.besideWater(cell)
        : nav.resource[cell] === subject && nav.quantity[cell] > 0;
    memory.clearLost(k);
    if (!valid) continue;
    const x = memory.lostX[k];
    const y = memory.lostY[k];
    see(state, ctx, id, subject, x, y, subject === WATER_SUBJECT ? 0 : nav.quantity[cell]);
    memoryEvent(state, ctx, id, EventType.REDISCOVERED, x, y, subject);
  }

  // Correct beliefs against what is fully visible now.
  for (let i = memory.count - 1; i >= 0; i--) {
    const cell = nav.innerCellAt(memory.x[i], memory.y[i]);
    if (cell < 0) continue;
    const subject = memory.subject[i];
    const valid =
      subject === WATER_SUBJECT
        ? nav.besideWater(cell)
        : nav.resource[cell] === subject && nav.quantity[cell] > 0;
    if (valid) {
      // Seeing a remembered place again keeps it alive, even if it is not the nearest.
      const quantity = subject === WATER_SUBJECT ? 0 : nav.quantity[cell];
      memory.refresh(i, state.tick, salienceOf(ctx, subject), quantity);
      continue;
    }
    memoryEvent(state, ctx, id, EventType.WRONG_BELIEF, memory.x[i], memory.y[i], subject);
    memory.remove(i);
  }
}
