import { Action } from '../agents/action-types.js';
import { attackMultiplier, inShelter } from '../agents/equipment.js';
import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';
import { Mood } from '../threats/threat-store.js';

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);
// 16 headings for spawning, as integer offsets scaled by 1000 (no trigonometry, decision 0005).
const HEAD_X = Int16Array.from([
  1000, 924, 707, 383, 0, -383, -707, -924, -1000, -924, -707, -383, 0, 383, 707, 924,
]);
const HEAD_Y = Int16Array.from([
  0, 383, 707, 924, 1000, 924, 707, 383, 0, -383, -707, -924, -1000, -924, -707, -383,
]);

/**
 * Nearest alive agent within `radius` that is not inside a shelter, or -1.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @returns {number}
 */
function nearestPrey(state, ctx, x, y, radius) {
  const a = ctx.agents;
  let best = -1;
  let bestD = Infinity;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const d = Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y));
    if (d > radius || d >= bestD) continue;
    if (inShelter(state, ctx, a.x[id], a.y[id])) continue;
    bestD = d;
    best = id;
  }
  return best;
}

/**
 * Moves predator `p` one step towards (or away from) a point, on passable ground, without
 * cutting corners. Ties keep the first direction in a fixed order.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} p
 * @param {number} tx
 * @param {number} ty
 * @param {boolean} away
 * @returns {void}
 */
function stepToward(state, ctx, p, tx, ty, away) {
  const t = state.threats;
  const x = t.x[p];
  const y = t.y[p];
  const here = (x - tx) * (x - tx) + (y - ty) * (y - ty);
  let best = -1;
  let bestScore = away ? -here : here;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (!passable(state, ctx, nx, ny)) continue;
    if (k >= 4 && (!passable(state, ctx, nx, y) || !passable(state, ctx, x, ny))) continue;
    const d = (nx - tx) * (nx - tx) + (ny - ty) * (ny - ty);
    const score = away ? -d : d;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0) return;
  const biome = state.world.packedAt(x + DX[best], y + DY[best]) & PACK.MASK;
  t.moveProgress[p] += (ctx.balance.threats.speed * ctx.biomeSpeed[biome]) / ctx.ticksPerSecond;
  if (t.moveProgress[p] < 1) return;
  t.moveProgress[p] -= 1;
  t.x[p] = x + DX[best];
  t.y[p] = y + DY[best];
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function passable(state, ctx, x, y) {
  return ctx.biomeSpeed[state.world.packedAt(x, y) & PACK.MASK] > 0;
}

/**
 * New predators appear at dusk and at night, out of sight of each unsheltered agent, in the
 * biomes where they live, never more than `maxPerAgent` around one agent.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
function spawnPredators(state, ctx) {
  const cfg = ctx.balance.threats;
  if (state.tick % cfg.spawnInterval !== 0 || ctx.predatorPhases[ctx.phase] !== 1) return;
  if (state.tick < (cfg.startDay - 1) * state.balance.time.ticksPerDay) return;
  const a = ctx.agents;
  const t = state.threats;
  const rng = state.rng.threats;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1 || inShelter(state, ctx, a.x[id], a.y[id])) continue;
    if (t.countNear(a.x[id], a.y[id], cfg.despawnDistance) >= cfg.maxPerAgent) continue;
    if (rng.next() >= cfg.spawnChance) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
      const h = rng.int(0, 15);
      const d = rng.int(cfg.spawnDistance[0], cfg.spawnDistance[1]);
      const x = a.x[id] + Math.round((HEAD_X[h] * d) / 1000);
      const y = a.y[id] + Math.round((HEAD_Y[h] * d) / 1000);
      const p = state.world.packedAt(x, y);
      if (ctx.predatorBiomes[p & PACK.MASK] !== 1) continue;
      if (((p >>> PACK.STRUCTURE_SHIFT) & PACK.MASK) !== 0) continue;
      t.spawn(x, y, cfg.hp);
      break;
    }
  }
}

/**
 * One exchange of blows between predator `p` and agent `id`, both adjacent. A sleeping agent
 * does not strike back: the blow wakes it up. A predator badly hurt runs away; at 0 it dies.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} p
 * @param {number} id
 * @returns {void}
 */
function fight(state, ctx, p, id) {
  const cfg = ctx.balance.threats;
  const a = ctx.agents;
  const t = state.threats;
  a.hp[id] = Math.max(0, a.hp[id] - Math.max(1, cfg.attack - a.defense[id]));
  if (state.tick - a.attackedTick[id] >= cfg.attackedEventCooldown) {
    state.events.push(state.tick, EventType.ATTACKED, id, a.x[id], a.y[id]);
  }
  a.attackedTick[id] = state.tick;
  if (a.asleep[id] === 1) {
    a.asleep[id] = 0;
    a.action[id] = Action.NONE;
    a.thenAction[id] = Action.NONE;
  } else {
    const blow = a.attack[id] * attackMultiplier(ctx, id) - cfg.defense;
    t.hp[p] -= Math.max(1, blow);
  }
  a.needsDecision[id] = 1;
  if (t.hp[p] <= 0) {
    a.kills[id]++;
    state.events.push(state.tick, EventType.PREDATOR_KILLED, id, t.x[p], t.y[p]);
    t.remove(p);
  } else if (t.hp[p] < t.maxHp[p] * cfg.fleeBelow) {
    t.mood[p] = Mood.FLEE;
  }
}

/**
 * Predators: spawn, hunt the nearest unsheltered agent they sense, fight when adjacent, run away
 * when wounded, at daybreak or after chasing a prey too long without reaching it, and leave once
 * far from everyone.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function threatSystem(state, ctx) {
  spawnPredators(state, ctx);
  const t = state.threats;
  if (t.aliveCount === 0) return;
  const cfg = ctx.balance.threats;
  const a = ctx.agents;
  const active = ctx.predatorPhases[ctx.phase] === 1;
  for (let p = 0; p < t.highWater; p++) {
    if (t.alive[p] !== 1) continue;
    if (t.cooldown[p] > 0) t.cooldown[p]--;
    const x = t.x[p];
    const y = t.y[p];
    if (t.mood[p] === Mood.FLEE) {
      const from = t.target[p];
      if (from >= 0 && a.alive[from] === 1) stepToward(state, ctx, p, a.x[from], a.y[from], true);
      const near = nearestPrey(state, ctx, x, y, cfg.despawnDistance);
      if (near < 0 || from < 0) t.remove(p);
      continue;
    }
    const prey = nearestPrey(state, ctx, x, y, cfg.senseRadius);
    if (prey !== t.target[p]) t.chase[p] = 0;
    t.target[p] = prey;
    if (prey < 0) {
      t.mood[p] = Mood.PROWL;
      if (!active) t.remove(p);
      continue;
    }
    // Daylight, or a prey it cannot catch: it goes away.
    if (!active || t.chase[p] > cfg.giveUpTicks) {
      t.mood[p] = Mood.FLEE;
      continue;
    }
    t.mood[p] = Mood.HUNT;
    t.chase[p]++;
    const gap = Math.max(Math.abs(a.x[prey] - x), Math.abs(a.y[prey] - y));
    if (gap <= 1) {
      if (t.cooldown[p] === 0) {
        t.cooldown[p] = cfg.attackInterval;
        t.chase[p] = 0;
        fight(state, ctx, p, prey);
      }
    } else {
      stepToward(state, ctx, p, a.x[prey], a.y[prey], false);
    }
  }
}
