import { Flag, isEffort } from '../agents/actions.js';
import { EventType } from '../core/events.js';

/**
 * Needs drift every tick: hunger, thirst and fatigue rise (faster during effort), fatigue falls
 * while asleep, curiosity rises when idle and falls while exploring. Critical needs hurt;
 * satisfied needs heal.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function needsSystem(state, ctx) {
  const a = ctx.agents;
  const r = ctx.rates;
  const n = ctx.balance.needs;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const effort = isEffort(a.action[id]) ? n.effortMultiplier : 1;
    a.hunger[id] = Math.min(n.critical, a.hunger[id] + r.hunger * effort);
    a.thirst[id] = Math.min(n.critical, a.thirst[id] + r.thirst * effort);
    if (a.asleep[id] === 1) {
      a.fatigue[id] = Math.max(0, a.fatigue[id] - r.fatigueRecovery);
    } else {
      a.fatigue[id] = Math.min(n.critical, a.fatigue[id] + r.fatigue * effort);
    }
    if (a.exploring[id] === 1 && isEffort(a.action[id])) {
      a.curiosity[id] = Math.max(0, a.curiosity[id] - r.curiosityRelief);
    } else if (a.asleep[id] === 0) {
      a.curiosity[id] = Math.min(n.critical, a.curiosity[id] + r.curiosity);
    }

    let critical = 0;
    if (a.hunger[id] >= n.critical) critical++;
    if (a.thirst[id] >= n.critical) critical++;
    if (critical > 0) {
      a.hp[id] = Math.max(0, a.hp[id] - r.damage * critical);
    } else if (a.hunger[id] < n.regenBelowNeed && a.thirst[id] < n.regenBelowNeed) {
      a.hp[id] = Math.min(a.maxHp[id], a.hp[id] + r.regen);
    }

    const threshold = (a.maxHp[id] * n.healthCriticalEvent) / 100;
    if (a.hp[id] < threshold && (a.flags[id] & Flag.CRITICAL) === 0) {
      a.flags[id] |= Flag.CRITICAL;
      state.events.push(state.tick, EventType.HEALTH_CRITICAL, id, a.x[id], a.y[id]);
    } else if (a.hp[id] >= threshold * 2) {
      a.flags[id] &= ~Flag.CRITICAL;
    }
  }
}
