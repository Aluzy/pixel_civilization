import { PACK } from '../world/chunk-store.js';

// What carried items and nearby structures do for an agent (docs/design/04-fabrication.md).

/**
 * Attack multiplier of the best weapon carried (1 without a weapon).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function attackMultiplier(ctx, id) {
  let best = 1;
  for (const item of ctx.catalog.items) {
    if (item.kind === 'weapon' && item.attack > best && ctx.agents.carried(id, item.good) > 0) {
      best = item.attack;
    }
  }
  return best;
}

/**
 * Harvest speed multiplier of the best tool carried for a resource (1 without a tool).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} resource
 * @returns {number}
 */
export function harvestMultiplier(ctx, id, resource) {
  let best = 1;
  for (const item of ctx.catalog.items) {
    const m = item.harvest[resource];
    if (m > best && ctx.agents.carried(id, item.good) > 0) best = m;
  }
  return best;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {string} kind - Item kind ("weapon", "tool").
 * @returns {boolean} True if the agent carries an item of that kind.
 */
export function carriesKind(ctx, id, kind) {
  for (const item of ctx.catalog.items) {
    if (item.kind === kind && ctx.agents.carried(id, item.good) > 0) return true;
  }
  return false;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {number} Structure code on the tile, 0 if none.
 */
export function structureAt(state, ctx, x, y) {
  return (state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT) & PACK.MASK;
}

/**
 * True if the tile holds a shelter: predators cannot reach whoever is inside.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function inShelter(state, ctx, x, y) {
  return ctx.shelterCodes[structureAt(state, ctx, x, y)] === 1;
}

/**
 * True if a structure of `code` is on the agent's tile or one of its 8 neighbours.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} code
 * @returns {boolean}
 */
export function besideStructure(state, ctx, id, code) {
  const x = ctx.agents.x[id];
  const y = ctx.agents.y[id];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (structureAt(state, ctx, x + dx, y + dy) === code) return true;
    }
  }
  return false;
}
