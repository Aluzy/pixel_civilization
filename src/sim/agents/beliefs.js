import { EventType } from '../core/events.js';
import { hashCoords } from '../core/hash.js';
import { MEMORY_EVENT_KINDS } from './agent-store.js';
import { WATER_SUBJECT } from './memory.js';

/** Index of each memory event in AgentStore.memoryEventTick (cooldowns). */
const EVENT_SLOT = Object.freeze({
  [EventType.FORGOT_PLACE]: 0,
  [EventType.WRONG_BELIEF]: 1,
  [EventType.SEARCHING]: 2,
  [EventType.REDISCOVERED]: 3,
  [EventType.NOT_FOUND]: 4,
});

/**
 * True for subjects whose memory matters for survival (water and food): only those are reported
 * in the chronicle.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} subject
 * @returns {boolean}
 */
export function isVital(ctx, subject) {
  return subject === WATER_SUBJECT || ctx.edible[subject] === 1 || isStructure(ctx, subject);
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} subject
 * @returns {boolean} True for the memory subject of a structure (station, shelter).
 */
export function isStructure(ctx, subject) {
  return subject > ctx.catalog.resourceCount && subject < ctx.catalog.dangerSubject;
}

/**
 * Time constant of a new memory of `subject`, in ticks (structures last, dangers fade fast).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} subject
 * @returns {number}
 */
export function tauOf(ctx, subject) {
  if (subject === ctx.catalog.dangerSubject) return ctx.dangerTau;
  return isStructure(ctx, subject) ? ctx.structureTau : ctx.placeTau;
}

/**
 * Initial strength of a new memory of `subject`.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} subject
 * @returns {number}
 */
export function salienceOf(ctx, subject) {
  const s = ctx.balance.memory.salience;
  if (subject === WATER_SUBJECT) return s.water;
  if (subject === ctx.catalog.dangerSubject) return s.danger;
  if (isStructure(ctx, subject)) return s.structure;
  return ctx.edible[subject] === 1 ? s.edible : s.other;
}

/**
 * Reports a memory event in the chronicle, at most once per cooldown per agent and kind.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {string} type
 * @param {number} x
 * @param {number} y
 * @param {number} subject
 * @returns {void}
 */
export function memoryEvent(state, ctx, id, type, x, y, subject) {
  if (!isVital(ctx, subject)) return;
  const slot = id * MEMORY_EVENT_KINDS + EVENT_SLOT[type];
  const last = ctx.agents.memoryEventTick[slot];
  if (state.tick - last < ctx.balance.memory.eventCooldown) return;
  ctx.agents.memoryEventTick[slot] = state.tick;
  state.events.push(state.tick, type, id, x, y, subject);
}

/**
 * Strengthens the memory of a place the agent is using right now (drinking, foraging).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} subject
 * @returns {void}
 */
export function consolidate(state, ctx, id, subject) {
  const memory = ctx.agents.memory[id];
  const m = ctx.balance.memory;
  const i = memory.find(subject, ctx.agents.x[id], ctx.agents.y[id], m.sameRadius);
  if (i >= 0) memory.reinforce(i, state.tick, m.consolidation, ctx.maxTau);
}

// Directions for memory blur: 8 compass points scaled to a unit-ish step.
const BLUR_X = Int8Array.from([1, 1, 0, -1, -1, -1, 0, 1]);
const BLUR_Y = Int8Array.from([0, 1, 1, 1, 0, -1, -1, -1]);

/**
 * Where the agent believes a remembered place is. A strong memory is exact; as it fades, the
 * recalled position drifts up to `maxBlur` tiles away, in a direction fixed for this memory
 * (until it is refreshed), so that a weak memory can lead the agent to the wrong spot.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} i - Memory index.
 * @param {number} tick
 * @param {Int32Array} out - Receives x, y.
 * @returns {void}
 */
export function recall(ctx, id, i, tick, out) {
  const memory = ctx.agents.memory[id];
  const s = memory.strength(i, tick);
  const blur = Math.floor((1 - s) * ctx.balance.memory.maxBlur);
  const h = hashCoords(id, memory.x[i], memory.y[i], memory.t0[i]);
  const d = h & 7;
  out[0] = memory.x[i] + BLUR_X[d] * blur;
  out[1] = memory.y[i] + BLUR_Y[d] * blur;
}

/**
 * Drops the memory of a place the agent itself just emptied (it knows; nothing to report).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} subject
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function forgetEmptied(ctx, id, subject, x, y) {
  const memory = ctx.agents.memory[id];
  const i = memory.find(subject, x, y, 0);
  if (i >= 0) memory.remove(i);
}
