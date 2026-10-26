import { Flag, isEffort } from '../agents/actions.js';
import { inShelter, structureAt } from '../agents/equipment.js';
import { atCamp, campOf } from '../colony/colony-logic.js';
import { EventType } from '../core/events.js';

/**
 * Fear (the need for safety) fades with time, faster in a shelter or among others at the camp,
 * and creeps up at night outside the camp. Attacks, deaths and predators in sight raise it
 * elsewhere (threat, lifecycle and decision systems).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function fearDrift(state, ctx, id) {
  const a = ctx.agents;
  const s = ctx.balance.safety;
  const day = state.balance.time.ticksPerDay;
  let calm = s.fearDecayPerDay;
  const colony = campOf(state, ctx, id);
  const home = colony !== null && atCamp(ctx, colony, id);
  if (home || inShelter(state, ctx, a.x[id], a.y[id])) calm = s.fearCalmPerDay;
  else if (ctx.darkness > 0.5) calm = -s.fearNightPerDay;
  a.fear[id] = Math.max(0, Math.min(100, a.fear[id] - calm / day));
}

/**
 * Needs drift every tick: hunger, thirst and fatigue rise (faster during effort), fatigue falls
 * while asleep, curiosity rises when idle and falls while exploring. Critical needs hurt, and so
 * does going long without a meal; satisfied needs heal, if the last meal is recent.
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
      // A shelter makes sleep more restful.
      const code = structureAt(state, ctx, a.x[id], a.y[id]);
      const rest = code === 0 ? 1 : ctx.catalog.structures[code - 1].sleepRecovery;
      a.fatigue[id] = Math.max(0, a.fatigue[id] - r.fatigueRecovery * rest);
    } else {
      a.fatigue[id] = Math.min(n.critical, a.fatigue[id] + r.fatigue * effort);
    }
    // Only walking into the unknown for its own sake satisfies curiosity, not errands.
    if (a.goal[id] === ctx.goalIndex.explore && a.exploring[id] === 1 && isEffort(a.action[id])) {
      a.curiosity[id] = Math.max(0, a.curiosity[id] - r.curiosityRelief);
    } else if (a.asleep[id] === 0) {
      a.curiosity[id] = Math.min(n.critical, a.curiosity[id] + r.curiosity);
    }

    fearDrift(state, ctx, id);

    let critical = 0;
    if (a.hunger[id] >= n.critical) critical++;
    if (a.thirst[id] >= n.critical) critical++;
    // Health holds with regular meals: long without one, the body weakens; it heals only fed.
    const fasting = state.tick - a.mealTick[id];
    if (critical > 0) {
      a.hp[id] = Math.max(0, a.hp[id] - r.damage * critical);
    } else if (fasting > r.fastTicks) {
      a.hp[id] = Math.max(0, a.hp[id] - r.fastDamage);
    } else if (
      a.hunger[id] < n.regenBelowNeed &&
      a.thirst[id] < n.regenBelowNeed &&
      fasting <= r.mealTicks
    ) {
      // A fresh wound heals slowly.
      const s = ctx.balance.safety;
      const wounded =
        state.tick - a.attackedTick[id] < s.woundDays * state.balance.time.ticksPerDay;
      a.hp[id] = Math.min(a.maxHp[id], a.hp[id] + r.regen * (wounded ? s.woundRegen : 1));
    }

    // Replication conditions: fed for a while, unhurt for days.
    if (a.hunger[id] >= ctx.balance.replication.fedBelow) a.hungryTick[id] = state.tick;
    if (a.hp[id] < a.prevHp[id]) a.hurtTick[id] = state.tick;
    a.prevHp[id] = a.hp[id];

    const threshold = (a.maxHp[id] * n.healthCriticalEvent) / 100;
    if (a.hp[id] < threshold && (a.flags[id] & Flag.CRITICAL) === 0) {
      a.flags[id] |= Flag.CRITICAL;
      state.events.push(state.tick, EventType.HEALTH_CRITICAL, id, a.x[id], a.y[id]);
    } else if (a.hp[id] >= threshold * 2) {
      a.flags[id] &= ~Flag.CRITICAL;
    }
  }
}
