import { EventType } from '../core/events.js';
import { mint, payWages, roleOf } from '../economy/market.js';
import { updatePrices } from '../economy/prices.js';
import { ProjectKind } from '../colony/colony-store.js';

/**
 * Units of each good the colony waits for: what its building projects still lack, and what its
 * researchers asked for (a demand is met once the stock holds it).
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {Int32Array} out
 * @returns {Int32Array}
 */
function colonyNeeds(colony, out) {
  out.fill(0);
  for (const p of colony.projects) {
    if (p.kind === ProjectKind.NONE || p.kind === ProjectKind.PANTRY) continue;
    for (let g = 1; g < p.needs.length; g++) {
      const held = Math.min(p.delivered[g], colony.stock[g]);
      if (p.needs[g] > held) out[g] += p.needs[g] - held;
    }
  }
  for (let g = 1; g < out.length; g++) {
    if (colony.demand[g] > 0 && colony.stock[g] >= colony.demand[g]) colony.demand[g] = 0;
    out[g] += colony.demand[g];
  }
  return out;
}

/**
 * The economy's day (docs/design/14-economie.md), at dawn: each counter revises its prices from
 * the day's use of its stock, mints what its colony's money lacks and pays the posts their wage; each member's observed income in its
 * job is revised from what it earned yesterday, net of the inputs it bought; jobs are counted, and the first holder of a job in
 * a colony is a chronicle event.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function economySystem(state, ctx) {
  const perDay = ctx.balance.time.ticksPerDay;
  if (state.tick === 0 || state.tick % perDay !== 0) return;
  const cfg = ctx.balance.economy;
  const a = ctx.agents;
  const J = ctx.jobs.jobs.length;
  for (const colony of state.colonies) {
    if (!colony.hasCamp) continue;
    updatePrices(colony, ctx.basePrices, colonyNeeds(colony, ctx.wantedGoods), cfg);
    colony.jobHolders.fill(0);
  }
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const c = a.colony[id];
    const colony = c >= 0 && state.colonies[c].hasCamp ? state.colonies[c] : null;
    const role = roleOf(ctx, colony, id);
    if (role >= 0) {
      // What the job brought in yesterday, net of what its inputs cost.
      const net = a.earnedToday[id] - a.spentToday[id];
      const i = id * J + role;
      const days = a.jobDays[i];
      a.jobIncome[i] = days === 0 ? net : a.jobIncome[i] + (net - a.jobIncome[i]) * cfg.incomeStep;
      if (days < 65535) a.jobDays[i] = days + 1;
      if (colony !== null) {
        colony.jobHolders[role]++;
        if (colony.jobFirst[role] === 0) {
          colony.jobFirst[role] = 1;
          state.events.push(state.tick, EventType.FIRST_JOB, id, a.x[id], a.y[id], role);
        }
      }
    }
    a.earnedToday[id] = 0;
    a.spentToday[id] = 0;
  }
  for (let c = 0; c < state.colonies.length; c++) {
    const colony = state.colonies[c];
    if (!colony.hasCamp) continue;
    mint(ctx, colony, c);
    payWages(ctx, colony);
  }
}
