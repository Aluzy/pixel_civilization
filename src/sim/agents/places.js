import { PLACE_KINDS } from './action-types.js';

// Minimal memory of useful places (J2): a few slots per kind, replaced oldest first, never
// forgotten with time. J3 replaces it with the full memory model (strength, decay, capacity).

/** Places closer than this (in tiles, Chebyshev) are considered the same place. */
const SAME_PLACE = 4;

/**
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @returns {number} Index of the first slot of this kind in `places`.
 */
function base(agents, id, kind) {
  return (id * PLACE_KINDS + kind) * agents.placesPerKind * 3;
}

/**
 * Remembers (or refreshes) a place.
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @param {number} x
 * @param {number} y
 * @param {number} tick
 * @returns {void}
 */
export function rememberPlace(agents, id, kind, x, y, tick) {
  const p = agents.places;
  const b = base(agents, id, kind);
  const countIndex = id * PLACE_KINDS + kind;
  const count = agents.placeCount[countIndex];
  let oldest = 0;
  for (let s = 0; s < count; s++) {
    const o = b + s * 3;
    if (Math.max(Math.abs(p[o] - x), Math.abs(p[o + 1] - y)) <= SAME_PLACE) {
      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = tick;
      return;
    }
    if (p[o + 2] < p[b + oldest * 3 + 2]) oldest = s;
  }
  const slot = count < agents.placesPerKind ? count : oldest;
  if (count < agents.placesPerKind) agents.placeCount[countIndex] = count + 1;
  const o = b + slot * 3;
  p[o] = x;
  p[o + 1] = y;
  p[o + 2] = tick;
}

/**
 * Nearest remembered place of a kind, or -1.
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @returns {number} Slot index.
 */
export function nearestPlace(agents, id, kind) {
  const p = agents.places;
  const b = base(agents, id, kind);
  const count = agents.placeCount[id * PLACE_KINDS + kind];
  let best = -1;
  let bestD2 = Infinity;
  for (let s = 0; s < count; s++) {
    const dx = p[b + s * 3] - agents.x[id];
    const dy = p[b + s * 3 + 1] - agents.y[id];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = s;
    }
  }
  return best;
}

/**
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @param {number} slot
 * @returns {{ x: number, y: number }} Coordinates of a remembered place (inspector, tests).
 */
export function placeAt(agents, id, kind, slot) {
  const o = base(agents, id, kind) + slot * 3;
  return { x: agents.places[o], y: agents.places[o + 1] };
}

/**
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @param {number} slot
 * @returns {number} World x of the slot.
 */
export function placeX(agents, id, kind, slot) {
  return agents.places[base(agents, id, kind) + slot * 3];
}

/**
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @param {number} slot
 * @returns {number} World y of the slot.
 */
export function placeY(agents, id, kind, slot) {
  return agents.places[base(agents, id, kind) + slot * 3 + 1];
}

/**
 * Forgets a place (it turned out to be wrong).
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @param {number} slot
 * @returns {void}
 */
export function forgetPlace(agents, id, kind, slot) {
  const p = agents.places;
  const b = base(agents, id, kind);
  const countIndex = id * PLACE_KINDS + kind;
  const last = agents.placeCount[countIndex] - 1;
  if (slot < last) p.copyWithin(b + slot * 3, b + last * 3, b + last * 3 + 3);
  agents.placeCount[countIndex] = last;
}

/**
 * Number of places of a kind currently remembered.
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} kind
 * @returns {number}
 */
export function placeCount(agents, id, kind) {
  return agents.placeCount[id * PLACE_KINDS + kind];
}
