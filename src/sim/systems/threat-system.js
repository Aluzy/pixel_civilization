import { agentAttack, agentDefense, killPredator, train } from '../agents/combat.js';
import { noteAttack } from '../agents/experience.js';
import { Action } from '../agents/action-types.js';
import { inShelter, structureAt } from '../agents/equipment.js';
import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';
import { Mood } from '../threats/threat-store.js';
import { insideClosed, noteBreach } from '../colony/fortress.js';

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
 * Nearest alive agent within `radius` that is not inside a shelter, or -1. A pack (`forcing`)
 * also takes an agent inside an isolated shelter: no other shelter within `isolationRadius`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {boolean} [forcing=false]
 * @returns {number}
 */
function nearestPrey(state, ctx, x, y, radius, forcing = false) {
  const a = ctx.agents;
  let best = -1;
  let bestD = Infinity;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const d = Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y));
    if (d > radius || d >= bestD) continue;
    if (inShelter(state, ctx, a.x[id], a.y[id])) {
      if (!forcing || !isolatedShelter(state, ctx, a.x[id], a.y[id])) continue;
    }
    bestD = d;
    best = id;
  }
  return best;
}

/**
 * True if the shelter at (x, y) has no other shelter around it: a pack can force it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isolatedShelter(state, ctx, x, y) {
  const r = ctx.balance.threats.isolationRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (ctx.shelterCodes[structureAt(state, ctx, x + dx, y + dy)] === 1) return false;
    }
  }
  return true;
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
  noteBreach(state, x, y, t.x[p], t.y[p]);
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function passable(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  // Walls and gates stop predators.
  return ctx.biomeSpeed[p & PACK.MASK] > 0 && ctx.blocksPredator[p >>> PACK.STRUCTURE_SHIFT] !== 1;
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
      // Nothing comes out of the ground inside a closed enclosure.
      if (insideClosed(state.colonies, x, y)) continue;
      t.spawn(x, y, cfg.hp);
      break;
    }
  }
}

/**
 * Once a day, a colony large enough draws a den (pack) into the forest or plain around its camp,
 * out of sight, if it has fewer dens near it than its size calls for and none was destroyed
 * lately.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
function placeDens(state, ctx) {
  const cfg = ctx.balance.threats;
  const day = state.balance.time.ticksPerDay;
  if (state.tick === 0 || state.tick % day !== 0) return;
  const t = state.threats;
  const rng = state.rng.threats;
  for (const colony of state.colonies) {
    if (!colony.hasCamp || colony.members < cfg.denMembers) continue;
    if (state.tick < colony.denQuietUntil) continue;
    let near = 0;
    for (let d = 0; d < t.denCount; d++)
      if (t.denAlive[d] === 1 && t.denColony[d] === colony.id) near++;
    const wanted = 1 + Math.floor((colony.members - cfg.denMembers) / cfg.denMembersStep);
    if (near >= Math.min(wanted, cfg.densPerColony)) continue;
    for (let attempt = 0; attempt < 8; attempt++) {
      const h = rng.int(0, 15);
      const dist = rng.int(cfg.denDistance[0], cfg.denDistance[1]);
      const x = colony.campX + Math.round((HEAD_X[h] * dist) / 1000);
      const y = colony.campY + Math.round((HEAD_Y[h] * dist) / 1000);
      const packed = state.world.packedAt(x, y);
      if (ctx.denBiomes[packed & PACK.MASK] !== 1) continue;
      if (((packed >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) continue;
      if (packed >>> PACK.STRUCTURE_SHIFT !== 0) continue;
      if (t.addDen(x, y, cfg.denHp, colony.id) < 0) break;
      state.world.setStructure(x, y, ctx.denCode);
      break;
    }
  }
}

/**
 * At dusk and at night, each den grows its pack, one predator per `spawnInterval`, up to a size
 * that grows with the colony it lives off.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
function spawnPacks(state, ctx) {
  const cfg = ctx.balance.threats;
  if (state.tick % cfg.spawnInterval !== 0 || ctx.predatorPhases[ctx.phase] !== 1) return;
  const t = state.threats;
  for (let d = 0; d < t.denCount; d++) {
    if (t.denAlive[d] !== 1) continue;
    const colony = state.colonies[t.denColony[d]];
    const size = Math.min(cfg.packMax, cfg.packMin + Math.floor(colony.members / cfg.packGrowth));
    if (t.packSize(d) >= size) continue;
    const p = t.spawn(t.denX[d], t.denY[d], cfg.hp);
    if (p >= 0) t.den[p] = d;
  }
}

/**
 * A den is destroyed by agent `id`: its pack scatters and the region stays quiet for a while.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} d
 * @param {number} id
 * @returns {void}
 */
export function destroyDen(state, ctx, d, id) {
  const t = state.threats;
  t.denAlive[d] = 0;
  state.world.setStructure(t.denX[d], t.denY[d], 0);
  for (let p = 0; p < t.highWater; p++) {
    if (t.alive[p] === 1 && t.den[p] === d) {
      t.den[p] = -1;
      t.mood[p] = Mood.FLEE;
    }
  }
  const colony = state.colonies[t.denColony[d]];
  const quiet = ctx.balance.threats.denQuietDays * state.balance.time.ticksPerDay;
  colony.denQuietUntil = state.tick + quiet;
  state.events.push(state.tick, EventType.DEN_DESTROYED, id, t.denX[d], t.denY[d]);
}

/**
 * One exchange of blows between predator `p` and agent `id`, both adjacent. A sleeping agent
 * does not strike back: the blow wakes it up. A predator badly hurt runs away (to its den if it
 * has one); at 0 it dies and leaves a carcass. Both sides learn from the fight.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} p
 * @param {number} id
 * @returns {void}
 */
function fight(state, ctx, p, id) {
  const cfg = ctx.balance.threats;
  const combat = ctx.balance.combat;
  const a = ctx.agents;
  const t = state.threats;
  if (
    inShelter(state, ctx, a.x[id], a.y[id]) &&
    state.tick - a.attackedTick[id] > cfg.attackedEventCooldown
  ) {
    state.events.push(state.tick, EventType.SHELTER_FORCED, id, a.x[id], a.y[id]);
  }
  a.hp[id] = Math.max(0, a.hp[id] - Math.max(1, cfg.attack - agentDefense(ctx, id)));
  if (state.tick - a.attackedTick[id] >= cfg.attackedEventCooldown) {
    state.events.push(state.tick, EventType.ATTACKED, id, a.x[id], a.y[id]);
  }
  a.attackedTick[id] = state.tick;
  a.fear[id] = Math.min(100, a.fear[id] + ctx.balance.safety.fearHit);
  if (a.colony[id] >= 0) {
    const colony = state.colonies[a.colony[id]];
    const r = ctx.balance.harmony.territoryRadius;
    const near = Math.abs(a.x[id] - colony.campX) <= r && Math.abs(a.y[id] - colony.campY) <= r;
    if (colony.hasCamp && near) colony.lastThreat = state.tick;
  }
  noteAttack(ctx, id);
  train(ctx, id, combat.skillPerBlowTaken);
  if (a.asleep[id] === 1) {
    a.asleep[id] = 0;
    a.action[id] = Action.NONE;
    a.thenAction[id] = Action.NONE;
  } else {
    t.hp[p] -= Math.max(1, agentAttack(ctx, id) - cfg.defense);
    train(ctx, id, combat.skillPerBlowGiven);
  }
  a.needsDecision[id] = 1;
  if (t.hp[p] <= 0) killPredator(state, ctx, p, id);
  else if (t.hp[p] < t.maxHp[p] * cfg.fleeBelow) t.mood[p] = Mood.FLEE;
}

/**
 * A pack predator's turn: back to its den by day or when hurt (it heals there), the den defended
 * against those who come near, and at night the hunt, prowling towards the camp it lives off when
 * no prey is in sense, closing in from its own side of the prey (packs surround).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} p
 * @param {boolean} active - Dusk or night.
 * @returns {void}
 */
function packTurn(state, ctx, p, active) {
  const cfg = ctx.balance.threats;
  const t = state.threats;
  const a = ctx.agents;
  const d = t.den[p];
  const dx = t.denX[d];
  const dy = t.denY[d];
  const home = Math.max(Math.abs(t.x[p] - dx), Math.abs(t.y[p] - dy)) <= 1;
  if (home) t.hp[p] = Math.min(t.maxHp[p], t.hp[p] + cfg.denHeal);
  if (t.mood[p] === Mood.FLEE) {
    if (home && t.hp[p] >= t.maxHp[p] * cfg.fleeBelow * 2) t.mood[p] = Mood.PROWL;
    else stepToward(state, ctx, p, dx, dy, false);
    return;
  }
  // By day, only those who come near the den are attacked.
  const reach = active ? cfg.senseRadius : cfg.denGuardRadius;
  let prey = nearestPrey(state, ctx, active ? t.x[p] : dx, active ? t.y[p] : dy, reach, true);
  if (prey !== t.target[p]) t.chase[p] = 0;
  t.target[p] = prey;
  if (prey < 0) {
    t.mood[p] = Mood.PROWL;
    const colony = state.colonies[t.denColony[d]];
    if (active && colony.hasCamp) stepToward(state, ctx, p, colony.campX, colony.campY, false);
    else if (!home) stepToward(state, ctx, p, dx, dy, false);
    return;
  }
  if (t.chase[p] > cfg.packGiveUpTicks) {
    t.mood[p] = Mood.FLEE;
    return;
  }
  t.mood[p] = Mood.HUNT;
  t.chase[p]++;
  const gap = Math.max(Math.abs(a.x[prey] - t.x[p]), Math.abs(a.y[prey] - t.y[p]));
  if (gap <= 1) {
    if (t.cooldown[p] === 0) {
      t.cooldown[p] = cfg.attackInterval;
      t.chase[p] = 0;
      fight(state, ctx, p, prey);
    }
  } else {
    // Each predator aims at its own side of the prey.
    const side = p % 8;
    stepToward(state, ctx, p, a.x[prey] + DX[side], a.y[prey] + DY[side], false);
  }
}

/**
 * Predators: dens and packs, lone prowlers that spawn around unsheltered agents, the hunt, the
 * fights, the flight when wounded, at daybreak or after a chase too long.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function threatSystem(state, ctx) {
  placeDens(state, ctx);
  spawnPacks(state, ctx);
  spawnPredators(state, ctx);
  const t = state.threats;
  if (t.aliveCount === 0) return;
  const cfg = ctx.balance.threats;
  const a = ctx.agents;
  const active = ctx.predatorPhases[ctx.phase] === 1;
  for (let p = 0; p < t.highWater; p++) {
    if (t.alive[p] !== 1) continue;
    if (t.cooldown[p] > 0) t.cooldown[p]--;
    if (t.den[p] >= 0) {
      packTurn(state, ctx, p, active);
      continue;
    }
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
