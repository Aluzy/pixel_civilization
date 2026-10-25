import { computeHarmony } from '../colony/harmony.js';
import { geneStats } from '../colony/history.js';

/**
 * Once a day: each colony's harmony and its weakest component (docs/design/07-harmonie.md), then
 * a line of history for the dashboard (harmony of the first colony, population, genes).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function harmonySystem(state, ctx) {
  if (state.tick === 0 || state.tick % ctx.balance.time.ticksPerDay !== 0) return;
  for (const colony of state.colonies) {
    if (colony.hasCamp && colony.members > 0) computeHarmony(state, ctx, colony);
  }
  geneStats(ctx.agents, ctx.geneMean, ctx.geneSpread);
  const first = state.colonies[0];
  state.history.record(
    state.tick,
    first.harmony,
    ctx.agents.aliveCount,
    ctx.geneMean,
    ctx.geneSpread,
  );
}
