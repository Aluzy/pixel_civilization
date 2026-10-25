import { EventType } from '../core/events.js';
import { geneLevel } from '../genome/genome.js';
import { PACK } from '../world/chunk-store.js';
import { attackMultiplier, defenseBonus } from './equipment.js';

// Fighting (docs/design/16-guerre-et-forteresses.md, « Des combattants »): blows depend on the
// attributes, the weapon and armour carried, and a combat skill learnt by fighting (bounded,
// shown in the inspector). A predator killed leaves a carcass: meat, and a hide.

/**
 * Skill multiplier: 1 for a novice, 1 + `skillBonus` for a seasoned fighter.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function skillFactor(ctx, id) {
  return 1 + ctx.agents.combatSkill[id] * ctx.balance.combat.skillBonus;
}

/**
 * Strength of one blow struck by the agent, before the target's defense.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function agentAttack(ctx, id) {
  return ctx.agents.attack[id] * attackMultiplier(ctx, id) * skillFactor(ctx, id);
}

/**
 * Defense of the agent against a blow: attribute and armour, sharpened by skill.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function agentDefense(ctx, id) {
  return (ctx.agents.defense[id] + defenseBonus(ctx, id)) * skillFactor(ctx, id);
}

/**
 * Fighting teaches: the skill grows by `amount`, faster for a quick learner, up to 1.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} amount
 * @returns {void}
 */
export function train(ctx, id, amount) {
  const k = ctx.genes.index.learning;
  const pace = 0.5 + (k === undefined ? 0.5 : geneLevel(ctx.genes, ctx.agents.genes, id, k));
  const a = ctx.agents;
  a.combatSkill[id] = Math.min(1, a.combatSkill[id] + amount * pace);
}

/**
 * Predator `p` dies, killed by agent `id`: the kill is counted and told, and a carcass is left
 * on the spot if the ground is free (it rots away after `carcassDays`).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} p
 * @param {number} id
 * @returns {void}
 */
export function killPredator(state, ctx, p, id) {
  const t = state.threats;
  const x = t.x[p];
  const y = t.y[p];
  ctx.agents.kills[id]++;
  state.events.push(state.tick, EventType.PREDATOR_KILLED, id, x, y);
  t.remove(p);
  const carcass = ctx.carcass;
  if (carcass <= 0) return;
  const packed = state.world.packedAt(x, y);
  if (((packed >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) return;
  if (packed >>> PACK.STRUCTURE_SHIFT !== 0) return;
  state.world.setResource(x, y, carcass, ctx.carcassUnits);
  // Rotting: a regrowth entry of quantity 0 clears the carcass if it is still there.
  const due = state.tick + ctx.balance.combat.carcassDays * ctx.balance.time.ticksPerDay;
  const queue = state.regrowth;
  let i = queue.length;
  while (i > 0 && queue[i - 1].tick > due) i--;
  queue.splice(i, 0, { tick: due, x, y, resource: carcass, quantity: 0 });
}
