import { Action, isFocused } from './action-types.js';
import { Tier } from './agent-store.js';
import { moveTo, startHere } from './movement.js';
import { inShelter } from './equipment.js';
import { besideDoor, canHarvest } from './actions.js';
import { PACK } from '../world/chunk-store.js';
import { ProjectKind } from '../colony/colony-store.js';
import { has } from '../core/bits.js';
import { atCamp, readyToBuild, releaseTask, remaining, reserve } from '../colony/colony-logic.js';
import { planHouse } from '../colony/house.js';
import { claimBed, releaseBed, townMap } from '../colony/people.js';
import { stockPortions } from '../farming/food.js';
import {
  FarmJob,
  carriedSeeds,
  chooseFarmJob,
  chooseTillSite,
  releaseFarm,
} from '../farming/farm-jobs.js';
import { FALLOW } from '../farming/crop-store.js';

// The routine of a commoner (decision 0030, docs/design/19-grand-essor.md): no goal scoring, no
// planner, no perception of its own. It drinks, eats, sleeps in its bed at night and works by day
// for its town (bringing what the projects need, raising houses its town knows how to build,
// tending the fields, gathering what its town makes for the counter), finding its way and its
// places on the town's map. It decides only when its action ends, and now and then on the way
// (a need, nightfall, a predator).

/** What a commoner is about. */
export const Duty = Object.freeze({
  NONE: 0,
  SLEEP: 1,
  DRINK: 2,
  EAT: 3,
  WORK: 4,
  SHELTER: 5,
  REST: 6,
});

/** Inspector names of the duties. */
export const DUTY_NAMES = Object.freeze([
  'aucune',
  'va dormir',
  'va boire',
  'va manger',
  'travaille pour la ville',
  "se met à l'abri",
  'se repose',
]);

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);

/**
 * One tick of a commoner's mind: it decides when its action is over, or now and then when a need
 * presses, night falls or its action is mere waiting.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function commonerTick(state, ctx, id) {
  const a = ctx.agents;
  if (a.needsDecision[id] === 0) {
    const p = ctx.balance.people;
    // One with nothing to do looks for work less often than one busy checks its needs.
    const every = a.duty[id] === Duty.REST ? p.restTicks : p.checkTicks;
    if ((state.tick + id) % every !== 0) return;
    if (!reconsider(ctx, id)) return;
  }
  a.needsDecision[id] = 0;
  decide(state, ctx, id);
}

/**
 * Whether a commoner busy with something should think again: a vital need on the way to work or
 * in bed, night falling on one still out, a predator near, or nothing to do.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
function reconsider(ctx, id) {
  const a = ctx.agents;
  const act = a.action[id];
  if (act === Action.NONE || act === Action.IDLE) return true;
  const limit = ctx.balance.needs.critical * ctx.balance.needs.wakeOnNeed;
  const pressing = a.hunger[id] >= limit || a.thirst[id] >= limit;
  const duty = a.duty[id];
  if (pressing && duty !== Duty.EAT && duty !== Duty.DRINK) return true;
  if (a.asleep[id] === 1) return false;
  if (ctx.evening && duty !== Duty.SLEEP && duty !== Duty.SHELTER && !isFocused(act)) return true;
  return false;
}

/**
 * Chooses what to do now, by fixed priorities: thirst, hunger, a predator near, night or
 * exhaustion, then work.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function decide(state, ctx, id) {
  const a = ctx.agents;
  const p = ctx.balance.people;
  const c = a.colony[id];
  const colony = c >= 0 ? state.colonies[c] : null;
  const map = colony === null ? null : townMap(state, ctx, colony);
  a.asleep[id] = 0;
  holdTile(state, ctx, id);
  if (colony === null || map === null) {
    // No town to live in: it has to think for itself.
    a.promote(id);
    return;
  }
  // Before the night, one drinks and eats sooner: there is no going out once in bed.
  const night = ctx.evening && a.duty[id] !== Duty.SLEEP;
  const drinkAt = night ? p.bedtimeNeed : p.drinkAt;
  const eatAt = night ? p.bedtimeNeed : p.eatAt;
  if (a.thirst[id] >= drinkAt && drink(state, ctx, colony, map, id)) return;
  if (a.hunger[id] >= eatAt && eat(state, ctx, colony, map, id)) return;
  // Only a predator that hunts it sends it home (the others are watched by the guards).
  const predator = state.threats.nearest(a.x[id], a.y[id], p.fleeRadius);
  const hunted = predator >= 0 && state.threats.target[predator] === id;
  if (hunted && !inShelter(state, ctx, a.x[id], a.y[id])) {
    a.duty[id] = Duty.SHELTER;
    if (goToBed(state, ctx, colony, map, id, Action.IDLE)) return;
  }
  if (ctx.evening || a.fatigue[id] >= p.tiredAt) {
    sleep(state, ctx, colony, map, id);
    return;
  }
  a.duty[id] = Duty.WORK;
  if (work(state, ctx, colony, map, id)) return;
  // Nothing to do: it rests at home, off the lanes (and home already when night falls).
  a.duty[id] = Duty.REST;
  const k = claimBed(colony, a, id);
  if (k >= 0 && !inHouse(colony, k, a.x[id], a.y[id])) {
    if (goToBed(state, ctx, colony, map, id, Action.IDLE)) return;
  }
  startHere(ctx, id, Action.IDLE);
}

/**
 * Takes its tile again before it stops there: a commoner that walked through another (decision
 * 0030) may stand on a tile held by someone else, or by nobody. A tile held by one who stands
 * there it leaves for a free neighbour, if there is one.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function holdTile(state, ctx, id) {
  const a = ctx.agents;
  const world = state.world;
  const x = a.x[id];
  const y = a.y[id];
  const other = world.occupantAt(x, y);
  if (other === id) return;
  // Free, or held by another of the people on its way (who walks on through it): taken.
  if (other < 0 || (a.tier[other] === Tier.COMMONER && a.action[other] === Action.MOVE)) {
    world.setOccupant(x, y, id);
    return;
  }
  for (let k = 0; k < 8; k++) {
    const p = world.packedAt(x + DX[k], y + DY[k]);
    if (world.lastOccupant() >= 0 || ctx.biomeSpeed[p & PACK.MASK] <= 0) continue;
    if (ctx.blocksAgent[p >>> PACK.STRUCTURE_SHIFT] === 1) continue;
    a.place(id, x + DX[k], y + DY[k]);
    return;
  }
}

/** Where a trip may end before its target: anywhere at the camp, anywhere beside water. */
const Stop = Object.freeze({ TARGET: 0, CAMP: 1, WATER: 2 });

/**
 * Starts walking to (x, y), then `then` there: along the town's ways when both ends are on its
 * map, else with a short look around (also when the way was blocked by others last time). A trip
 * to the camp ends as soon as the camp is reached, a trip to drink at the first tile beside water.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {number} then
 * @param {number} [until] - {@link Stop}.
 * @param {import('../colony/colony-store.js').Colony | null} [colony] - For a trip to the camp.
 * @returns {boolean} False if no way was found.
 */
function goTo(state, ctx, map, id, x, y, then, until = Stop.TARGET, colony = null) {
  const a = ctx.agents;
  if (a.x[id] === x && a.y[id] === y) {
    startHere(ctx, id, then);
    return true;
  }
  if (a.blocked[id] < ctx.balance.actions.waitTicks) {
    const path = a.path[id];
    let steps = map.path(a.x[id], a.y[id], x, y, path);
    if (steps > 0) {
      let reached = path[(steps - 1) * 2] === x && path[(steps - 1) * 2 + 1] === y;
      if (until !== Stop.TARGET) {
        const r = ctx.balance.colony.campRadius - 1;
        for (let k = 0; k < steps; k++) {
          const px = path[k * 2];
          const py = path[k * 2 + 1];
          const there =
            until === Stop.CAMP
              ? Math.abs(px - colony.campX) <= r && Math.abs(py - colony.campY) <= r
              : map.wetSide[map.cellAt(px, py)] === 1;
          if (!there) continue;
          steps = k + 1;
          reached = true;
          break;
        }
      }
      a.pathLength[id] = steps;
      a.pathIndex[id] = 0;
      a.blocked[id] = 0;
      a.action[id] = Action.MOVE;
      a.stepFactor[id] = 0;
      a.thenAction[id] = reached ? then : Action.NONE;
      a.actionX[id] = x;
      a.actionY[id] = y;
      a.actionProgress[id] = 0;
      return true;
    }
  }
  return goLocal(state, ctx, id, x, y, then);
}

/**
 * A short look around (`lookRadius`): the way to (x, y), or towards it, going round those who
 * stand still.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {number} then
 * @returns {boolean}
 */
function goLocal(state, ctx, id, x, y, then) {
  const a = ctx.agents;
  const nav = ctx.nav;
  nav.waterSpeed = 0;
  nav.prepare(state.world, a.x[id], a.y[id], ctx.balance.people.lookRadius);
  const cell = nav.cellAt(x, y);
  const onto = cell >= 0 && nav.reachable(cell);
  const step = onto ? cell : nav.toward(x, y);
  return step >= 0 && moveTo(ctx, id, step, onto ? then : Action.NONE);
}

/**
 * A tile near the camp for this commoner, spread so that they do not all crowd its centre.
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @param {number} r - Camp radius.
 * @param {Int32Array} out - Receives x, y.
 * @returns {void}
 */
function campSpot(colony, map, id, r, out) {
  const span = 2 * r - 1;
  for (let k = 0; k < 4; k++) {
    const h = (id * 7 + k * 13) % (span * span);
    const x = colony.campX + (h % span) - (r - 1);
    const y = colony.campY + Math.floor(h / span) - (r - 1);
    if (map.reaches(x, y)) {
      out[0] = x;
      out[1] = y;
      return;
    }
  }
  out[0] = colony.campX;
  out[1] = colony.campY;
}

/**
 * Walks to the camp (a spot of its own there), then `then`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @param {number} then
 * @returns {boolean}
 */
function goToCamp(state, ctx, colony, map, id, then) {
  if (atCamp(ctx, colony, id)) {
    startHere(ctx, id, then);
    return true;
  }
  const out = ctx.spot;
  campSpot(colony, map, id, ctx.balance.colony.campRadius, out);
  return goTo(state, ctx, map, id, out[0], out[1], then, Stop.CAMP, colony);
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True if water or a canal lies beside (x, y).
 */
function besideWater(state, ctx, x, y) {
  for (let k = 0; k < 8; k++) {
    const p = state.world.packedAt(x + DX[k], y + DY[k]);
    if ((p & PACK.MASK) === ctx.waterBiome || ctx.wet[p >>> PACK.STRUCTURE_SHIFT] === 1)
      return true;
  }
  return false;
}

/**
 * True if nobody but `id` stands on (x, y).
 * @param {import('../simulation.js').SimState} state
 * @param {number} x
 * @param {number} y
 * @param {number} id
 * @returns {boolean}
 */
function freeFor(state, x, y, id) {
  state.world.packedAt(x, y);
  const other = state.world.lastOccupant();
  return other < 0 || other === id;
}

/**
 * Drinking: here if beside water, else at the place to drink nearest to it on the town's map
 * (water, a canal, a well).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean}
 */
function drink(state, ctx, colony, map, id) {
  const a = ctx.agents;
  a.duty[id] = Duty.DRINK;
  if (besideWater(state, ctx, a.x[id], a.y[id])) {
    startHere(ctx, id, Action.DRINK);
    return true;
  }
  // Held up on the way (a queue at the water): the nearest free place to drink in sight.
  if (a.blocked[id] >= ctx.balance.actions.waitTicks) {
    const nav = ctx.nav;
    nav.waterSpeed = 0;
    nav.prepare(state.world, a.x[id], a.y[id], ctx.balance.people.lookRadius);
    const cell = nav.nearestWaterSide();
    if (cell >= 0 && moveTo(ctx, id, cell, Action.DRINK)) return true;
  }
  // Along the way to the nearest water from where it stands (else a short look around).
  const path = a.path[id];
  const steps =
    a.blocked[id] < ctx.balance.actions.waitTicks ? map.pathToWater(a.x[id], a.y[id], path) : -1;
  if (steps > 0) {
    a.pathLength[id] = steps;
    a.pathIndex[id] = 0;
    a.blocked[id] = 0;
    a.action[id] = Action.MOVE;
    a.stepFactor[id] = 0;
    const end = map.cellAt(path[(steps - 1) * 2], path[(steps - 1) * 2 + 1]);
    a.thenAction[id] = map.wetSide[end] === 1 ? Action.DRINK : Action.NONE;
    a.actionX[id] = path[(steps - 1) * 2];
    a.actionY[id] = path[(steps - 1) * 2 + 1];
    a.actionProgress[id] = 0;
    return true;
  }
  const n = map.drinkCount;
  if (n === 0) return false;
  const cell = map.drink[id % n];
  return goLocal(state, ctx, id, map.cellX(cell), map.cellY(cell), Action.DRINK);
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if it carries something to eat.
 */
function carriesFood(ctx, id) {
  const order = ctx.foodTables.order;
  for (let k = 0; k < order.length; k++) if (ctx.agents.carried(id, order[k]) > 0) return true;
  return false;
}

/**
 * Eating: what it carries, else food from the pantry (bought, or given to the poor), else picked
 * at the nearest place of food on the town's map.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean}
 */
function eat(state, ctx, colony, map, id) {
  const a = ctx.agents;
  a.duty[id] = Duty.EAT;
  if (carriesFood(ctx, id)) {
    startHere(ctx, id, Action.EAT);
    return true;
  }
  const food = stockPortions(ctx.foodTables, colony.stock, ctx.balance.cooking.portion);
  if (food > 0 && goToCamp(state, ctx, colony, map, id, Action.TAKE)) return true;
  // The nearest food on the map, of any kind.
  let best = -1;
  let bestD = Infinity;
  const edible = ctx.edible;
  for (let g = 1; g < edible.length; g++) {
    if (edible[g] !== 1) continue;
    const cell = source(state, ctx, map, g, id);
    if (cell >= 0 && map.dist[cell] < bestD) {
      bestD = map.dist[cell];
      best = cell;
    }
  }
  return best >= 0 && goTo(state, ctx, map, id, map.cellX(best), map.cellY(best), Action.FORAGE);
}

/**
 * One of the town's nearest places of `good` that still holds some and where nobody stands, the
 * search starting from the commoner's own (they spread); -1 if none.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} good
 * @param {number} id
 * @returns {number} Map cell.
 */
function source(state, ctx, map, good, id) {
  const n = map.sourceCount[good];
  const base = good * map.slots;
  const shore = ctx.fromShore[good] === 1;
  for (let k = 0; k < n; k++) {
    const cell = map.sources[base + ((id + k) % n)];
    const x = map.cellX(cell);
    const y = map.cellY(cell);
    if (!freeFor(state, x, y, id)) continue;
    if (shore ? fishBeside(state, x, y, good) : holds(state, x, y, good)) return cell;
  }
  return -1;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {number} x
 * @param {number} y
 * @param {number} good
 * @returns {boolean} True if the tile still holds some of the resource.
 */
function holds(state, x, y, good) {
  const p = state.world.packedAt(x, y);
  return (
    ((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) === good &&
    ((p >> PACK.QUANTITY_SHIFT) & PACK.MASK) > 0
  );
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {number} x
 * @param {number} y
 * @param {number} good
 * @returns {boolean} True if a neighbouring tile holds some of the resource (fish).
 */
function fishBeside(state, x, y, good) {
  for (let k = 0; k < 8; k++) if (holds(state, x + DX[k], y + DY[k], good)) return true;
  return false;
}

/**
 * To bed: in its house (a bed claimed when it has none), the deepest bed free there; without a
 * bed, at the camp, on the ground.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {void}
 */
function sleep(state, ctx, colony, map, id) {
  const a = ctx.agents;
  a.duty[id] = Duty.SLEEP;
  // To the deepest free bed of its house (asleep here if it is that one): the house fills from
  // the back, so nobody lies between the door and a free bed.
  const k = claimBed(colony, a, id);
  if (goToBed(state, ctx, colony, map, id, Action.SLEEP)) return;
  // Its house taken by strangers: another bed.
  if (k >= 0 && a.bed[id] < 0 && claimBed(colony, a, id) >= 0) {
    if (goToBed(state, ctx, colony, map, id, Action.SLEEP)) return;
  }
  // Never asleep in a doorway or just inside it: the whole house would wait outside. One with a
  // bed out of reach for now waits and tries again rather than lie down in a lane, unless worn out.
  const door = byDoor(state, ctx, a.x[id], a.y[id]);
  const worn = a.fatigue[id] >= ctx.balance.people.wornAt;
  if (door || (a.bed[id] >= 0 && !worn)) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  if (a.bed[id] < 0 && !atCamp(ctx, colony, id)) {
    if (goToCamp(state, ctx, colony, map, id, Action.SLEEP)) return;
  }
  startHere(ctx, id, Action.SLEEP);
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True on a house door or beside one.
 */
function byDoor(state, ctx, x, y) {
  const here = state.world.packedAt(x, y) >>> PACK.STRUCTURE_SHIFT;
  return here === ctx.houseDoorCode || besideDoor(state, ctx, x, y);
}

/**
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} k - A bed.
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True if (x, y) is a bed of the house of bed k.
 */
function inHouse(colony, k, x, y) {
  const first = colony.bedHouse[k];
  const last = first + colony.houseBeds[k];
  for (let b = first; b < last; b++) if (colony.bedX[b] === x && colony.bedY[b] === y) return true;
  return false;
}

/**
 * Walks to its house, to the deepest of its beds nobody lies in (the first beds of a house are
 * the deepest: the house fills from the back).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @param {number} then
 * @returns {boolean} False without a bed (or a way to it).
 */
function goToBed(state, ctx, colony, map, id, then) {
  const a = ctx.agents;
  const k = claimBed(colony, a, id);
  if (k < 0) return false;
  const first = colony.bedHouse[k];
  const last = first + colony.houseBeds[k];
  for (let b = first; b < last; b++) {
    const x = colony.bedX[b];
    const y = colony.bedY[b];
    if (a.x[id] === x && a.y[id] === y) {
      startHere(ctx, id, then);
      return true;
    }
    if (freeFor(state, x, y, id)) return goTo(state, ctx, map, id, x, y, then);
  }
  // Every bed of the house taken (by strangers): this one is not its own any more.
  releaseBed(state, a, id);
  return false;
}

/**
 * Work for the town by day: a task in hand is carried on; else a new one, by the town's needs.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean} False if there is nothing it can do.
 */
function work(state, ctx, colony, map, id) {
  const a = ctx.agents;
  if (a.farmJob[id] !== FarmJob.NONE) return farm(state, ctx, colony, map, id);
  if (carriesHarvest(ctx, id)) return goToCamp(state, ctx, colony, map, id, Action.STOCK);
  if (a.taskProject[id] < 0 && a.saleGood[id] === 0 && !chooseWork(state, ctx, colony, map, id)) {
    return false;
  }
  if (a.farmJob[id] !== FarmJob.NONE) return farm(state, ctx, colony, map, id);
  if (a.taskProject[id] >= 0 && a.taskBuild[id] === 1) {
    return build(state, ctx, colony, map, id);
  }
  const bring = a.taskProject[id] >= 0;
  const good = bring ? a.taskGood[id] : a.saleGood[id];
  const want = bring ? a.taskAmount[id] : a.saleAmount[id];
  const full = a.carriedTotal(id) >= ctx.capacity(id);
  if (a.carried(id, good) >= want || full) {
    if (a.carried(id, good) === 0) {
      drop(state, ctx, id);
      return false;
    }
    return goToCamp(state, ctx, colony, map, id, Action.DEPOSIT);
  }
  const cell = source(state, ctx, map, good, id);
  if (cell < 0) {
    // Nothing of it left on the map: what it has is brought, else the task goes back.
    if (a.carried(id, good) > 0) return goToCamp(state, ctx, colony, map, id, Action.DEPOSIT);
    drop(state, ctx, id);
    return false;
  }
  a.harvestGood[id] = good;
  a.harvestUntil[id] = want;
  return goTo(state, ctx, map, id, map.cellX(cell), map.cellY(cell), Action.HARVEST);
}

/**
 * No seed in the town: wild grain from the town's map until it holds a sample's worth, then a
 * plot sown with it at once, else the grain brought to the stock.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean}
 */
function glean(state, ctx, colony, map, id) {
  const a = ctx.agents;
  const grain = ctx.crops[0].resource;
  if (carriedSeeds(ctx, id) > 0) {
    a.farmJob[id] = FarmJob.TILL;
    return till(state, ctx, colony, map, id);
  }
  const want = ctx.balance.agriculture.gleanUnits;
  const cell = source(state, ctx, map, grain, id);
  if (a.carried(id, grain) >= want || a.carriedTotal(id) >= ctx.capacity(id) || cell < 0) {
    if (a.carried(id, grain) > 0) return goToCamp(state, ctx, colony, map, id, Action.STOCK);
    releaseFarm(state, ctx, id);
    return false;
  }
  a.harvestGood[id] = grain;
  a.harvestUntil[id] = want;
  return goTo(state, ctx, map, id, map.cellX(cell), map.cellY(cell), Action.HARVEST);
}

/**
 * Gives up its task or its sale.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function drop(state, ctx, id) {
  releaseTask(state, ctx, id);
  ctx.agents.saleGood[id] = 0;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if it carries grain or seeds for the stock.
 */
function carriesHarvest(ctx, id) {
  for (const crop of ctx.crops) if (ctx.agents.carried(id, crop.resource) > 0) return true;
  return false;
}

/**
 * A new piece of work, the town's needs first: a house or a well ready to raise (the town knows
 * how), the fields to tend, what its projects lack, then what the town lives from (its
 * vocation), gathered for the counter.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean}
 */
function chooseWork(state, ctx, colony, map, id) {
  const a = ctx.agents;
  for (let s = 0; s < colony.projects.length; s++) {
    const p = colony.projects[s];
    const raise = p.kind === ProjectKind.SHELTER || p.kind === ProjectKind.WELL;
    if (!raise || !readyToBuild(colony, p)) continue;
    if (!has(colony.knowhow, ctx.catalog.knowFor[p.recipe])) continue;
    p.builder = id;
    reserve(state, a, id, s, 0, 0, true);
    return true;
  }
  // The fields first while the pantry is short; else the town's works first.
  const portion = ctx.balance.cooking.portion;
  const fed =
    stockPortions(ctx.foodTables, colony.stock, portion) >=
    colony.members * ctx.balance.people.fedPortions;
  const room = ctx.capacity(id) - a.carriedTotal(id);
  // The fields are the people's: tended while jobs are open, widened while the town knows how.
  const fields = colony.farmOpen > 0 || has(colony.knowhow, ctx.catalog.knowFor[ctx.plotRecipe]);
  if (!fed && fields && chooseFarmJob(state, ctx, colony, id, true)) return true;
  // One in `minerEvery` keeps the town's store of materials before its works: the figures buy
  // them to craft and invent.
  const miner = id % ctx.balance.people.minerEvery === 0;
  if (miner && room > 0 && gatherMaterial(state, ctx, colony, map, id, room)) return true;
  if (room > 0 && bringWork(state, ctx, colony, map, id, room)) return true;
  if (fed && fields && chooseFarmJob(state, ctx, colony, id, true)) return true;
  if (room <= 0) return false;
  // Nothing the town lacks: what the town lives from, for the counter (and the caravans); else
  // the materials.
  const enough = colony.members * ctx.balance.people.vocationStock;
  const vocation = colony.vocation >= 0 ? ctx.vocations[colony.vocation] : null;
  if (vocation !== null) {
    for (const g of vocation.goods) {
      if (!gatherable(ctx, colony, map, id, g, enough)) continue;
      return sell(state, ctx, id, g, room);
    }
  }
  return gatherMaterial(state, ctx, colony, map, id, room);
}

/**
 * A few of each material in store (`materialStock` per member): the dearest at the counter that
 * is short, gathered for sale.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @param {number} room
 * @returns {boolean}
 */
function gatherMaterial(state, ctx, colony, map, id, room) {
  const store = colony.members * ctx.balance.people.materialStock;
  let best = 0;
  let bestRatio = 0;
  for (let g = 1; g <= ctx.catalog.resourceCount; g++) {
    // Food is the fields' work (and the vocation's): here, the materials of the crafts.
    if (ctx.edible[g] === 1 || !gatherable(ctx, colony, map, id, g, store)) continue;
    const ratio = colony.price[g] / ctx.basePrices[g];
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = g;
    }
  }
  return best > 0 && sell(state, ctx, id, best, room);
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @param {number} g - A resource.
 * @param {number} enough - Stock beyond which the town has enough of it.
 * @returns {boolean} True if it can gather `g` on the town's map for the counter.
 */
function gatherable(ctx, colony, map, id, g, enough) {
  if (map.sourceCount[g] === 0 || ctx.cropOfResource[g] >= 0) return false;
  return colony.stock[g] < enough && canHarvest(ctx, id, g);
}

/**
 * Sets off to gather `g` and sell it at the counter.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} g
 * @param {number} room
 * @returns {boolean}
 */
function sell(state, ctx, id, g, room) {
  const a = ctx.agents;
  a.saleGood[id] = g;
  a.saleAmount[id] = Math.max(1, Math.floor(room));
  a.saleTick[id] = state.tick;
  return true;
}

/**
 * What the town's projects lack, by urgency and nearness of a source on its map: reserved.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @param {number} room - Units it can still carry.
 * @returns {boolean}
 */
function bringWork(state, ctx, colony, map, id, room) {
  const a = ctx.agents;
  const cfg = ctx.balance.colony;
  const food = ctx.foodTables;
  const portion = ctx.balance.cooking.portion;
  let bestScore = 0;
  let bestSlot = -1;
  let bestGood = 0;
  for (let s = 0; s < colony.projects.length; s++) {
    const p = colony.projects[s];
    if (p.kind === ProjectKind.NONE) continue;
    const urgency =
      p.kind === ProjectKind.PANTRY ? 1 : p.kind === ProjectKind.WORKS ? cfg.worksUrgency : 1.2;
    for (let g = 1; g <= ctx.catalog.resourceCount; g++) {
      if (map.sourceCount[g] === 0 || !canHarvest(ctx, id, g)) continue;
      if (remaining(colony, p, g, colony.members, cfg, food, portion) <= 0) continue;
      const first = map.sources[g * map.slots];
      const score = urgency / (1 + map.dist[first] / 32);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = s;
        bestGood = g;
      }
    }
  }
  if (bestSlot < 0) return false;
  const p = colony.projects[bestSlot];
  const want = remaining(colony, p, bestGood, colony.members, cfg, food, portion);
  const amount = Math.min(want, room, ctx.balance.people.taskChunk);
  p.reserved[bestGood] += amount;
  reserve(state, a, id, bestSlot, bestGood, amount, false);
  return true;
}

/**
 * Raising a house or digging a well: the materials taken at the camp, then on the site the town
 * plans for it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean}
 */
function build(state, ctx, colony, map, id) {
  const a = ctx.agents;
  const project = colony.projects[a.taskProject[id]];
  const r = project.recipe;
  const holds = ctx.catalog.recipes[r].inputs.every((i) => a.carried(id, i.good) >= i.count);
  if (!holds) return goToCamp(state, ctx, colony, map, id, Action.DEPOSIT);
  a.craftRecipe[id] = r;
  if (project.kind === ProjectKind.WELL) {
    // The well's spot, chosen with the project; dug where the digger stands.
    return goTo(state, ctx, map, id, project.tileX[0], project.tileY[0], Action.CRAFT);
  }
  const site = ctx.siteOut;
  if (!planHouse(state, ctx, colony, site, ctx.catalog.recipes[r].output)) return false;
  return goTo(state, ctx, map, id, site[0], site[1], Action.CRAFT);
}

/**
 * Tending the town's fields: water a plot, sow it (the seed taken from the stock), harvest it and
 * bring the crop to the stock, or make a new plot. A job it cannot get on with is given back.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean}
 */
function farm(state, ctx, colony, map, id) {
  if (tend(state, ctx, colony, map, id)) return true;
  releaseFarm(state, ctx, id);
  return false;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean} False if the farm job cannot be done (now).
 */
function tend(state, ctx, colony, map, id) {
  const a = ctx.agents;
  const crops = state.crops;
  const job = a.farmJob[id];
  if (job === FarmJob.GLEAN) return glean(state, ctx, colony, map, id);
  if (job === FarmJob.TILL) return till(state, ctx, colony, map, id);
  const p = a.farmPlot[id];
  if (p < 0) return false;
  const x = crops.x[p];
  const y = crops.y[p];
  if (job === FarmJob.HARVEST) {
    const crop = ctx.crops[crops.crop[p]];
    if (!holds(state, x, y, crop.resource) || a.carriedTotal(id) >= ctx.capacity(id)) {
      releaseFarm(state, ctx, id);
      return carriesHarvest(ctx, id) && goToCamp(state, ctx, colony, map, id, Action.STOCK);
    }
    a.harvestGood[id] = crop.resource;
    a.harvestUntil[id] = ctx.capacity(id);
    return goTo(state, ctx, map, id, x, y, Action.HARVEST);
  }
  if (job === FarmJob.SOW && (crops.stage[p] !== FALLOW || carriedSeeds(ctx, id) === 0)) {
    return false;
  }
  const then = job === FarmJob.SOW ? Action.SOW : Action.WATER;
  if (Math.abs(a.x[id] - x) <= 1 && Math.abs(a.y[id] - y) <= 1) {
    startHere(ctx, id, then);
    return true;
  }
  return goTo(state, ctx, map, id, x, y, then);
}

/**
 * A new plot, with a seed it carries: the best spot it sees near the town's fields (by water),
 * else back towards the camp to look from there.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/town-map.js').TownMap} map
 * @param {number} id
 * @returns {boolean}
 */
function till(state, ctx, colony, map, id) {
  const a = ctx.agents;
  if (carriedSeeds(ctx, id) === 0 || !has(colony.knowhow, ctx.plotRecipe)) return false;
  const nav = ctx.nav;
  nav.waterSpeed = 0;
  nav.prepare(state.world, a.x[id], a.y[id], ctx.balance.people.tillRadius);
  const cell = chooseTillSite(state, ctx, colony);
  a.craftRecipe[id] = ctx.plotRecipe;
  if (cell === nav.center) {
    startHere(ctx, id, Action.CRAFT);
    return true;
  }
  if (cell >= 0) return moveTo(ctx, id, cell, Action.CRAFT);
  return !atCamp(ctx, colony, id) && goToCamp(state, ctx, colony, map, id, Action.IDLE);
}
