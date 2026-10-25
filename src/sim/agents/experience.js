import { geneLevel } from '../genome/genome.js';

// Learning from experience (docs/design/06-ia.md, couche 7): simple bounded estimates revised
// from the outcome of the agent's own actions, readable in the inspector, lost at death.
// - Danger of a zone: attacks / passes, with a prior whose weight shrinks as the "learning" gene
//   grows (a quick learner trusts a few bad encounters more).
// - Real cost of bringing a good to the camp: moving average of ticks per unit delivered, with a
//   step that grows with the "learning" gene.

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number} The agent's "learning" gene level in [0, 1] (0.5 if absent).
 */
function learning(ctx, id) {
  const k = ctx.genes.index.learning;
  return k === undefined ? 0.5 : geneLevel(ctx.genes, ctx.agents.genes, id, k);
}

/**
 * Index of the agent's danger entry for zone (zx, zy), or -1.
 * @param {import('./agent-store.js').AgentStore} a
 * @param {number} id
 * @param {number} zx
 * @param {number} zy
 * @returns {number}
 */
function findZone(a, id, zx, zy) {
  const base = id * a.dangerSlots;
  for (let i = 0; i < a.dangerCount[id]; i++) {
    if (a.dangerX[base + i] === zx && a.dangerY[base + i] === zy) return base + i;
  }
  return -1;
}

/**
 * The agent was attacked where it stands: one more attack (and pass) in this zone. A new zone
 * takes a free entry or the one with the fewest attacks.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function noteAttack(ctx, id) {
  const a = ctx.agents;
  const size = ctx.balance.learning.zoneSize;
  const zx = Math.floor(a.x[id] / size);
  const zy = Math.floor(a.y[id] / size);
  let e = findZone(a, id, zx, zy);
  if (e < 0) {
    const base = id * a.dangerSlots;
    if (a.dangerCount[id] < a.dangerSlots) {
      e = base + a.dangerCount[id]++;
    } else {
      e = base;
      for (let i = 1; i < a.dangerSlots; i++) {
        if (a.dangerAttacks[base + i] < a.dangerAttacks[e]) e = base + i;
      }
    }
    a.dangerX[e] = zx;
    a.dangerY[e] = zy;
    a.dangerAttacks[e] = 0;
    a.dangerPasses[e] = 1;
  }
  if (a.dangerAttacks[e] < 65535) a.dangerAttacks[e]++;
  // An attack during a pass counts with that pass, never more attacks than passes.
  if (a.dangerPasses[e] < a.dangerAttacks[e]) a.dangerPasses[e] = a.dangerAttacks[e];
}

/**
 * Called when the agent decides: entering a new zone is a pass through it (counted only for
 * zones where it was once attacked).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function notePass(ctx, id) {
  const a = ctx.agents;
  const size = ctx.balance.learning.zoneSize;
  const zx = Math.floor(a.x[id] / size);
  const zy = Math.floor(a.y[id] / size);
  if (zx === a.zoneX[id] && zy === a.zoneY[id]) return;
  a.zoneX[id] = zx;
  a.zoneY[id] = zy;
  const e = findZone(a, id, zx, zy);
  if (e >= 0 && a.dangerPasses[e] < 65535) a.dangerPasses[e]++;
}

/**
 * Estimated chance of being attacked when going through the zone of (x, y).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function dangerAt(ctx, id, x, y) {
  const a = ctx.agents;
  const l = ctx.balance.learning;
  const strength = l.priorMin + (1 - learning(ctx, id)) * (l.priorMax - l.priorMin);
  const e = findZone(a, id, Math.floor(x / l.zoneSize), Math.floor(y / l.zoneSize));
  const attacks = e < 0 ? 0 : a.dangerAttacks[e];
  const passes = e < 0 ? 0 : a.dangerPasses[e];
  return (attacks + l.priorDanger * strength) / (passes + strength);
}

/**
 * True if the agent would rather not go there: the zone's danger is above what its aversion to
 * risk accepts.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function avoids(ctx, id, x, y) {
  const k = ctx.genes.index.risk;
  const risk = k === undefined ? 0.5 : geneLevel(ctx.genes, ctx.agents.genes, id, k);
  const limit = ctx.balance.learning.dangerAvoid * (1.5 - risk);
  return dangerAt(ctx, id, x, y) > limit;
}

/**
 * A delivery to the camp: revise the estimated ticks per unit of that good.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} good
 * @param {number} units
 * @param {number} ticks - Since the task was taken.
 * @returns {void}
 */
export function noteDelivery(ctx, id, good, units, ticks) {
  if (units <= 0) return;
  const a = ctx.agents;
  const l = ctx.balance.learning;
  const step = l.stepMin + learning(ctx, id) * (l.stepMax - l.stepMin);
  const i = id * a.goodSlots + good;
  const seen = ticks / units;
  a.costPerUnit[i] =
    a.costPerUnit[i] === 0 ? seen : a.costPerUnit[i] + step * (seen - a.costPerUnit[i]);
}

/**
 * What the agent has learnt, for the inspector.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {{ costs: { good: number, ticks: number }[],
 *   zones: { x: number, y: number, attacks: number, passes: number, danger: number }[] }}
 */
export function describeExperience(ctx, id) {
  const a = ctx.agents;
  const costs = [];
  for (let g = 1; g < a.goodSlots; g++) {
    const t = a.costPerUnit[id * a.goodSlots + g];
    if (t > 0) costs.push({ good: g, ticks: Math.round(t) });
  }
  const size = ctx.balance.learning.zoneSize;
  const zones = [];
  for (let i = 0; i < a.dangerCount[id]; i++) {
    const e = id * a.dangerSlots + i;
    const x = a.dangerX[e] * size + size / 2;
    const y = a.dangerY[e] * size + size / 2;
    zones.push({
      x,
      y,
      attacks: a.dangerAttacks[e],
      passes: a.dangerPasses[e],
      danger: dangerAt(ctx, id, x, y),
    });
  }
  return { costs, zones };
}
