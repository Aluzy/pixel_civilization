import { noteRegrowth } from '../colony/harmony.js';
import { PACK } from '../world/chunk-store.js';

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} code - Structure on the tile.
 * @returns {boolean} True if a building stands there (a plot is sown, not built).
 */
function builtOver(ctx, code) {
  return code !== 0 && code !== ctx.plotCode;
}

/**
 * Regrows depleted renewable resources whose time has come. The queue is kept sorted by due
 * tick (stable for equal ticks), so processing order is deterministic.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function worldSystem(state, ctx) {
  const queue = state.regrowth;
  let done = 0;
  while (done < queue.length && queue[done].tick <= state.tick) {
    const g = queue[done];
    const p = state.world.packedAt(g.x, g.y);
    const resource = (p >> PACK.RESOURCE_SHIFT) & PACK.MASK;
    if (g.quantity === 0) {
      // A removal (a carcass that rots away), if it is still there.
      if (resource === g.resource) state.world.setResource(g.x, g.y, 0, 0);
    } else if (resource === 0 && builtOver(ctx, p >>> PACK.STRUCTURE_SHIFT)) {
      // Built over since (a house, a wall): the land is changed for good.
    } else if (resource === 0) {
      state.world.setResource(g.x, g.y, g.resource, g.quantity);
      noteRegrowth(state, ctx, g.x, g.y, g.resource, g.quantity);
    }
    done++;
  }
  if (done > 0) queue.splice(0, done);
}
