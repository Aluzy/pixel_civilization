import { learnTick, teachTick } from './teach-work.js';
import { groundSpeed } from './sailing.js';
import { refresh, tire } from '../ai/weariness.js';
import { has, withBit } from '../core/bits.js';
import { Tier } from './agent-store.js';
import { EventType } from '../core/events.js';
import { BARE_HANDS, lowestIngredient, matchRecipe } from '../crafting/catalog.js';
import { PACK } from '../world/chunk-store.js';
import { Action } from './action-types.js';
import { consolidate, forgetEmptied } from './beliefs.js';
import {
  besideStructure,
  harvestMultiplier,
  inShelter,
  quarterBonus,
  structureAt,
} from './equipment.js';
import { WATER_SUBJECT } from './memory.js';
import { MAX_RADIUS } from './navigation.js';
import { craftOfTown } from '../colony/vocation.js';
import { notice, perceptionRadius } from './perception.js';
import {
  atCamp,
  campOf,
  deposit,
  onBuilt,
  releaseTask,
  takeMaterials,
} from '../colony/colony-logic.js';
import { plant } from '../colony/field.js';
import { noteHarvest } from '../colony/harmony.js';
import { destroyDen } from '../systems/threat-system.js';
import { Mood } from '../threats/threat-store.js';
import { agentAttack, killPredator, train } from './combat.js';
import { replicate } from '../colony/replication.js';
import { DocKind } from '../knowledge/document-store.js';
import { noteMeal, stockPortions } from '../farming/food.js';
import { buyFood, sell } from '../economy/market.js';
import { canHarvestOrTool } from '../economy/jobs.js';
import { noteDelivery } from './experience.js';
import { researcher } from './work.js';
import { harvestedPlot } from '../systems/farm-system.js';
import { fetchInputs, stockProduce, tillDone, waterPlot, sowPlot } from '../farming/farm-jobs.js';
import { buildSegment } from '../colony/fortress.js';
import { houseDir, raiseHouse } from '../colony/house.js';
import { digCanal } from '../colony/canal.js';
import { WORKS_RECIPE, exhausted, layTile, worksTicks } from '../colony/works.js';
import { Expedition } from '../colony/colony-store.js';
import {
  libraryBeside,
  lookAtLibrary,
  nextToWrite,
  readOne,
  storeDocuments,
  writeOne,
  writable,
} from '../knowledge/writing.js';

/** Bits of AgentStore.flags: first experiences, reported once each in the chronicle. */
export const Flag = Object.freeze({
  DRANK: 1,
  ATE: 2,
  SLEPT: 4,
  CRITICAL: 8,
  SHELTERED: 16,
  PROJECT: 32, // First project completed.
});

/**
 * True if the commoner's town knows how to make recipe `r` (one of its figures knows it).
 * @param {import('../simulation.js').SimState} state
 * @param {number} c - Colony.
 * @param {number} r
 * @returns {boolean}
 */
function commonerKnows(state, c, r) {
  return c >= 0 && has(state.colonies[c].knowhow, r);
}

/**
 * Records a first experience once.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} flag
 * @param {string} type
 * @returns {void}
 */
function firstTime(state, ctx, id, flag, type) {
  const agents = ctx.agents;
  if ((agents.flags[id] & flag) !== 0) return;
  agents.flags[id] |= flag;
  state.events.push(state.tick, type, id, agents.x[id], agents.y[id]);
}

/**
 * Ends the current action and asks for a new decision.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function finish(ctx, id) {
  ctx.agents.action[id] = Action.NONE;
  ctx.agents.actionNeed[id] = 0;
  ctx.agents.thenAction[id] = Action.NONE;
  ctx.agents.asleep[id] = 0;
  ctx.agents.needsDecision[id] = 1;
}

/**
 * True if agent `other` is walking and its next step is (x, y): it and the agent on (x, y) want
 * each other's tile.
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} other
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function headOn(agents, other, x, y) {
  if (agents.action[other] !== Action.MOVE) return false;
  const k = agents.pathIndex[other];
  if (k >= agents.pathLength[other]) return false;
  const path = agents.path[other];
  return path[k * 2] === x && path[k * 2 + 1] === y;
}

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);

/**
 * True if a commoner on its way slips past the one in front (decision 0030): one waiting or
 * eating, or one coming its way (they cross), not one asleep nor at work on its tile. In a town's
 * crowd, one tile per pixel would otherwise jam every lane.
 * @param {import('./agent-store.js').AgentStore} agents
 * @param {number} id
 * @param {number} other
 * @returns {boolean}
 */
function slips(agents, id, other) {
  if (agents.tier[id] !== Tier.COMMONER || agents.asleep[other] === 1) return false;
  const act = agents.action[other];
  if (act === Action.MOVE) {
    const k = agents.pathIndex[other];
    if (k >= agents.pathLength[other]) return false;
    const path = agents.path[other];
    const x = path[k * 2];
    const y = path[k * 2 + 1];
    return Math.abs(x - agents.x[id]) <= 1 && Math.abs(y - agents.y[id]) <= 1;
  }
  return act === Action.IDLE || act === Action.NONE || act === Action.EAT;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True beside a house door: a sleeper moved there would shut the house.
 */
export function besideDoor(state, ctx, x, y) {
  for (let d = 0; d < 4; d++) {
    if (structureAt(state, ctx, x + DX[d], y + DY[d]) === ctx.houseDoorCode) return true;
  }
  return false;
}

/**
 * Steps round the tile of its path at `index` (someone stands there) onto a free tile next to the
 * following one, if there is one; the path goes on from there.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} index
 * @returns {boolean} True if it stepped round.
 */
function goRound(state, ctx, id, index) {
  const a = ctx.agents;
  if (index + 1 >= a.pathLength[id]) return false;
  const path = a.path[id];
  const tx = path[(index + 1) * 2];
  const ty = path[(index + 1) * 2 + 1];
  const x = a.x[id];
  const y = a.y[id];
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    if (Math.abs(nx - tx) > 1 || Math.abs(ny - ty) > 1 || (nx === tx && ny === ty)) continue;
    if (nx === path[index * 2] && ny === path[index * 2 + 1]) continue;
    if (!walkable(state, ctx, nx, ny) || state.world.lastOccupant() >= 0) continue;
    // No squeezing between two walls.
    if (k >= 4 && (!walkable(state, ctx, nx, y) || !walkable(state, ctx, x, ny))) continue;
    a.place(id, nx, ny);
    a.pathIndex[id] = index + 1;
    a.moveProgress[id] = 0;
    a.stepFactor[id] = 0;
    a.blocked[id] = 0;
    return true;
  }
  return false;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True if one can stand on (x, y) on foot (water only on a pier).
 */
function walkable(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  const code = p >>> PACK.STRUCTURE_SHIFT;
  if (ctx.blocksAgent[code] === 1) return false;
  return groundSpeed(ctx, p & PACK.MASK, code, 0) > 0;
}

/**
 * An agent standing still in someone's way moves to a free neighbouring tile (not back onto the
 * one who waits), preferring one that is not a passage (gate, door): one who stands about, or
 * anyone in a passage. Not one asleep in a bed.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} other
 * @param {number} wx - Tile of the one who waits.
 * @param {number} wy
 * @returns {boolean} True if it moved.
 */
export function stepAside(state, ctx, other, wx, wy) {
  const a = ctx.agents;
  const ox = a.x[other];
  const oy = a.y[other];
  // Only one who stands about, or who blocks a passage: not one at work on its tile.
  const idle = a.action[other] === Action.NONE || a.action[other] === Action.IDLE;
  if (a.action[other] === Action.MOVE) return false;
  if (!idle && ctx.passage[structureAt(state, ctx, ox, oy)] !== 1) return false;
  if (a.asleep[other] === 1 && inShelter(state, ctx, ox, oy)) return false;
  let best = -1;
  for (let k = 0; k < 8; k++) {
    const x = ox + DX[k];
    const y = oy + DY[k];
    if (x === wx && y === wy) continue;
    const p = state.world.packedAt(x, y);
    if (state.world.lastOccupant() >= 0 || ctx.biomeSpeed[p & PACK.MASK] <= 0) continue;
    const code = p >>> PACK.STRUCTURE_SHIFT;
    if (ctx.blocksAgent[code] === 1) continue;
    if (k >= 4) {
      // No squeezing between two walls.
      const c1 = state.world.packedAt(ox + DX[k], oy) >>> PACK.STRUCTURE_SHIFT;
      const c2 = state.world.packedAt(ox, oy + DY[k]) >>> PACK.STRUCTURE_SHIFT;
      if (ctx.blocksAgent[c1] === 1 || ctx.blocksAgent[c2] === 1) continue;
    }
    if (ctx.passage[code] !== 1) {
      best = k;
      break;
    }
    if (best < 0) best = k;
  }
  if (best < 0) return false;
  a.place(other, ox + DX[best], oy + DY[best]);
  a.actionX[other] = a.x[other];
  a.actionY[other] = a.y[other];
  return true;
}

/**
 * The tile to take a resource flagged in `wanted` from: the agent's own, else (a resource taken
 * from the shore, fish) the first neighbour holding one, in a fixed order.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Uint8Array} wanted - 1 per wanted resource id.
 * @param {Int32Array} out - Receives x, y (the agent's tile when none is found).
 * @returns {boolean} True if a tile holds one.
 */
function sourceTile(state, ctx, id, wanted, out) {
  const x = ctx.agents.x[id];
  const y = ctx.agents.y[id];
  out[0] = x;
  out[1] = y;
  const here = (state.world.packedAt(x, y) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
  if (wanted[here] === 1) return true;
  for (let k = 0; k < 8; k++) {
    const nx = x + DX[k];
    const ny = y + DY[k];
    const p = state.world.packedAt(nx, ny);
    const r = (p >> PACK.RESOURCE_SHIFT) & PACK.MASK;
    if (
      wanted[r] !== 1 ||
      ctx.fromShore[r] !== 1 ||
      ((p >> PACK.QUANTITY_SHIFT) & PACK.MASK) === 0
    ) {
      continue;
    }
    out[0] = nx;
    out[1] = ny;
    return true;
  }
  return false;
}

/**
 * True if one of the 8 neighbours of (x, y) is water.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function besideWater(state, ctx, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const p = state.world.packedAt(x + dx, y + dy);
      if ((p & PACK.MASK) === ctx.waterBiome) return true;
      if (ctx.wet[p >>> PACK.STRUCTURE_SHIFT] === 1) return true;
    }
  }
  return false;
}

/**
 * Eats one carried food unit, the most nourishing first (a dish before berries), if any.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} False if nothing edible is carried.
 */
function eatCarried(state, ctx, id) {
  const agents = ctx.agents;
  const t = ctx.foodTables;
  for (let k = 0; k < t.order.length; k++) {
    const g = t.order[k];
    if (agents.carried(id, g) === 0) continue;
    agents.addCarried(id, g, -1);
    agents.hunger[id] = Math.max(0, agents.hunger[id] - t.nutrition[g]);
    noteMeal(state, ctx, id, g);
    return true;
  }
  return false;
}

/**
 * Advances the current action of one agent by one tick.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function stepAction(state, ctx, id) {
  const agents = ctx.agents;
  switch (agents.action[id]) {
    case Action.MOVE: {
      const index = agents.pathIndex[id];
      if (index >= agents.pathLength[id]) {
        const then = agents.thenAction[id];
        agents.thenAction[id] = Action.NONE;
        agents.action[id] = then;
        agents.actionNeed[id] = 0;
        agents.actionX[id] = agents.x[id];
        agents.actionY[id] = agents.y[id];
        agents.actionProgress[id] = 0;
        if (then === Action.NONE) agents.needsDecision[id] = 1;
        return;
      }
      const path = agents.path[id];
      const nx = path[index * 2];
      const ny = path[index * 2 + 1];
      // The ground of the next tile is read when the step begins, the way at its end.
      if (agents.stepFactor[id] === 0) {
        const packed = state.world.packedAt(nx, ny);
        const trail = state.world.lastWear() >= ctx.trailSteps;
        const code = packed >>> PACK.STRUCTURE_SHIFT;
        const biome = packed & PACK.MASK;
        const ground = groundSpeed(ctx, biome, code, agents.sail[id]);
        // An expedition that crosses water founds overseas.
        if (biome === ctx.waterBiome && agents.colony[id] >= 0) {
          const home = state.colonies[agents.colony[id]];
          if (home.inExpedition(id)) home.expSailed = true;
        }
        const factor = ground * (trail ? ctx.trailSpeed : 1) * ctx.structureSpeed[code];
        if (factor <= 0 || ctx.blocksAgent[code] === 1) {
          finish(ctx, id);
          return;
        }
        agents.stepFactor[id] = factor;
      }
      agents.moveProgress[id] += (agents.speed[id] * agents.stepFactor[id]) / ctx.ticksPerSecond;
      if (agents.moveProgress[id] < 1) return;
      const packed = state.world.packedAt(nx, ny);
      const other = state.world.lastOccupant();
      // A wall built across the path since it was planned: replan.
      if (ctx.blocksAgent[packed >>> PACK.STRUCTURE_SHIFT] === 1) {
        finish(ctx, id);
        return;
      }
      // Two agents never share a tile: one in the way is passed head-on, else waited for, and
      // after a while gone round (the new path avoids those who stand still).
      // In a town's crowd, a commoner on its way walks through another on its way (decision
      // 0030): only one who stands, works or sleeps holds its tile. It never ends its way there.
      if (
        other >= 0 &&
        other !== id &&
        agents.tier[id] === Tier.COMMONER &&
        agents.tier[other] === Tier.COMMONER &&
        agents.action[other] === Action.MOVE &&
        index + 1 < agents.pathLength[id]
      ) {
        agents.moveProgress[id] -= 1;
        agents.blocked[id] = 0;
        agents.through(id, nx, ny);
        agents.pathIndex[id] = index + 1;
        agents.stepFactor[id] = 0;
        state.world.tread(nx, ny, ctx.trailSteps);
        return;
      }
      if (other >= 0 && other !== id) {
        // Inside a house, past a sleeper: they swap beds, the sleeper still asleep.
        const facing = headOn(agents, other, agents.x[id], agents.y[id]);
        // One that walked through the crowd may stand on a tile held by another: no swap from there.
        const held = state.world.occupantAt(agents.x[id], agents.y[id]) === id;
        const swap =
          held &&
          (facing ||
            (agents.asleep[other] === 1 &&
              inShelter(state, ctx, nx, ny) &&
              inShelter(state, ctx, agents.x[id], agents.y[id]) &&
              !besideDoor(state, ctx, agents.x[id], agents.y[id])) ||
            slips(agents, id, other));
        if (!swap) {
          agents.moveProgress[id] = 1;
          // A commoner goes round one who stands in its way, back onto its path beyond it.
          if (agents.tier[id] === Tier.COMMONER && goRound(state, ctx, id, index)) return;
          // One who stands in the way (not asleep in its bed) steps aside after a moment.
          const wait = ctx.balance.actions.waitTicks;
          const waited = ++agents.blocked[id];
          if (waited === wait >> 1 && stepAside(state, ctx, other, agents.x[id], agents.y[id])) {
            return;
          }
          // A commoner in a crowd waits longer before looking for another way.
          const patience = agents.tier[id] === Tier.COMMONER ? wait * 3 : wait;
          if (waited >= patience) finish(ctx, id);
          return;
        }
        // Head-on, in a gate or a lane: they slip past each other, both stepping at once.
        const x0 = agents.x[id];
        const y0 = agents.y[id];
        agents.place(id, nx, ny);
        agents.place(other, x0, y0);
        agents.stepFactor[other] = 0;
        if (agents.action[other] === Action.MOVE) {
          // Head-on, the other has taken its next step; crossing, it is next to it still.
          if (facing) agents.pathIndex[other]++;
          agents.moveProgress[other] = 0;
        } else {
          agents.actionX[other] = x0;
          agents.actionY[other] = y0;
        }
        agents.blocked[other] = 0;
      }
      agents.moveProgress[id] -= 1;
      agents.blocked[id] = 0;
      agents.place(id, nx, ny);
      agents.pathIndex[id] = index + 1;
      agents.stepFactor[id] = 0;
      // The ways most walked wear into trails.
      state.world.tread(nx, ny, ctx.trailSteps);
      return;
    }
    case Action.DRINK: {
      // Water beside it, looked at when it began to drink.
      if (agents.actionNeed[id] === 0) {
        if (!besideWater(state, ctx, agents.x[id], agents.y[id])) {
          finish(ctx, id);
          return;
        }
        agents.actionNeed[id] = 1;
      }
      firstTime(state, ctx, id, Flag.DRANK, EventType.FIRST_DRINK);
      agents.thirst[id] = Math.max(0, agents.thirst[id] - ctx.balance.actions.drinkPerTick);
      if (agents.thirst[id] === 0) {
        consolidate(state, ctx, id, WATER_SUBJECT);
        finish(ctx, id);
      }
      return;
    }
    case Action.FORAGE: {
      // The food it picks is looked at when it begins a unit, and again when it takes it.
      if (agents.actionNeed[id] === 0) {
        if (!sourceTile(state, ctx, id, ctx.edible, ctx.spot)) {
          finish(ctx, id);
          return;
        }
        const res =
          (state.world.packedAt(ctx.spot[0], ctx.spot[1]) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
        agents.actionNeed[id] =
          ctx.harvestTicks[res] / (1 + agents.force[id] / ctx.harvestForceScale);
      }
      const need = agents.actionNeed[id];
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] < need) return;
      agents.actionProgress[id] -= need;
      agents.actionNeed[id] = 0;
      if (!sourceTile(state, ctx, id, ctx.edible, ctx.spot)) {
        finish(ctx, id);
        return;
      }
      const x = ctx.spot[0];
      const y = ctx.spot[1];
      const taken = state.world.takeUnit(x, y);
      if (taken === 0) {
        finish(ctx, id);
        return;
      }
      noteHarvest(state, ctx, id, x, y, taken);
      if (state.world.lastTakeDepleted && taken === ctx.carcass)
        agents.addCarried(id, ctx.hideGood, 1);
      if (state.world.lastTakeDepleted) {
        ctx.scheduleRegrowth(state, x, y, taken);
        forgetEmptied(ctx, id, taken, x, y);
      } else {
        consolidate(state, ctx, id, taken);
      }
      const nutrition = ctx.nutrition[taken];
      const full = agents.hunger[id] < nutrition / 2;
      if (!full) {
        agents.hunger[id] = Math.max(0, agents.hunger[id] - nutrition);
        noteMeal(state, ctx, id, taken);
        firstTime(state, ctx, id, Flag.ATE, EventType.FIRST_MEAL);
      } else if (agents.carriedTotal(id) < ctx.capacity(id)) {
        agents.addCarried(id, taken, 1, state.tick);
      }
      // Fed and carrying a reserve, or the bush is empty: done here.
      const reserve = agents.carried(id, taken) >= ctx.balance.actions.carryReserve;
      if ((full && reserve) || state.world.lastTakeDepleted) finish(ctx, id);
      return;
    }
    case Action.EAT: {
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] < ctx.balance.actions.eatTicksPerUnit) return;
      agents.actionProgress[id] = 0;
      const ate = eatCarried(state, ctx, id);
      if (ate) firstTime(state, ctx, id, Flag.ATE, EventType.FIRST_MEAL);
      if (!ate || agents.hunger[id] < ctx.balance.actions.eatUntilHunger) finish(ctx, id);
      return;
    }
    case Action.SLEEP: {
      if (agents.asleep[id] === 0) {
        agents.asleep[id] = 1;
        firstTime(state, ctx, id, Flag.SLEPT, EventType.FIRST_SLEEP);
        if (inShelter(state, ctx, agents.x[id], agents.y[id])) {
          firstTime(state, ctx, id, Flag.SHELTERED, EventType.SHELTERED_SLEEP);
        }
      }
      // Rested, it wakes, but not before the night is over (a commoner, gone to bed at dusk,
      // not before dawn).
      const night = agents.tier[id] === Tier.COMMONER ? ctx.evening : ctx.dark;
      if (agents.fatigue[id] <= ctx.balance.needs.wakeFatigue && !night) finish(ctx, id);
      return;
    }
    case Action.HARVEST:
      harvest(state, ctx, id);
      return;
    case Action.CRAFT: {
      // At a station among others of its kind (a quarter), the work goes faster.
      if (agents.actionProgress[id] === 0) {
        const station = ctx.catalog.recipes[agents.craftRecipe[id]].station;
        agents.craftSpeed[id] = station > 0 ? quarterBonus(state, ctx, id, station) : 1;
      }
      agents.actionProgress[id] += agents.craftSpeed[id];
      if (agents.actionProgress[id] >= ctx.catalog.recipes[agents.craftRecipe[id]].duration) {
        craft(state, ctx, id);
        finish(ctx, id);
      }
      return;
    }
    case Action.BUILD: {
      const r = agents.craftRecipe[id];
      const works = r === WORKS_RECIPE;
      agents.actionProgress[id] += 1;
      const need = works ? worksTicks(state, ctx, id) : ctx.catalog.recipes[r].duration;
      if (agents.actionProgress[id] >= need) {
        if (works) {
          layTile(state, ctx, id);
        } else if (ctx.catalog.recipes[r].output === ctx.canalCode) {
          digCanal(state, ctx, id);
        } else {
          buildSegment(state, ctx, id);
        }
        finish(ctx, id);
      }
      return;
    }
    case Action.EXPERIMENT:
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] >= ctx.balance.actions.experimentTicks) {
        experiment(state, ctx, id);
        finish(ctx, id);
      }
      return;
    case Action.DEPOSIT: {
      // At the camp: bring the task's goods to the stock, or (builder) take the materials.
      const colony = campOf(state, ctx, id);
      if (colony && atCamp(ctx, colony, id) && agents.taskProject[id] >= 0) {
        if (agents.taskBuild[id] === 1) {
          if (!takeMaterials(colony, ctx, id)) releaseTask(state, ctx, id);
        } else if (deposit(state, ctx, colony, id) > 0 && agents.delivers[id] === 1) {
          state.events.push(state.tick, EventType.FIRST_DELIVERY, id, agents.x[id], agents.y[id]);
        }
      } else if (colony && atCamp(ctx, colony, id) && agents.saleGood[id] > 0) {
        // A load gathered to sell: the counter buys it.
        const g = agents.saleGood[id];
        const units = agents.carried(id, g);
        noteDelivery(ctx, id, g, units, state.tick - agents.saleTick[id]);
        sell(state, ctx, colony, id, g, units);
        agents.saleGood[id] = 0;
      }
      finish(ctx, id);
      return;
    }
    case Action.TAKE: {
      // Food from the pantry, up to a meal's reserve, bought at the counter (or given).
      const colony = campOf(state, ctx, id);
      if (colony && atCamp(ctx, colony, id)) {
        const t = ctx.foodTables;
        const portion = ctx.balance.cooking.portion;
        buyFood(state, ctx, colony, id, ctx.balance.actions.carryReserve * portion);
        agents.pantrySeen[id] = Math.min(65535, stockPortions(t, colony.stock, portion));
      }
      finish(ctx, id);
      return;
    }
    case Action.TEACH:
      if (!teachTick(state, ctx, id)) finish(ctx, id);
      return;
    case Action.LEARN:
      if (!learnTick(state, ctx, id)) finish(ctx, id);
      return;
    case Action.WRITE:
    case Action.READ: {
      // One recipe (or map entry) at a time, at the library.
      const li = libraryBeside(state, ctx, id);
      if (li < 0) {
        finish(ctx, id);
        return;
      }
      const w = ctx.balance.writing;
      const writing = agents.action[id] === Action.WRITE;
      const book = writable(state, ctx, id);
      const onMap = writing && (book < 0 || nextToWrite(state, ctx, id, book) < 0);
      const need = writing ? (onMap ? w.writeEntryTicks : w.writeRecipeTicks) : w.readRecipeTicks;
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] < need) return;
      agents.actionProgress[id] = 0;
      const more = writing ? writeOne(state, ctx, id) : readOne(state, ctx, id, li);
      if (!more) {
        if (writing) storeDocuments(state, ctx, id, li);
        else lookAtLibrary(state, ctx, id, li);
        finish(ctx, id);
      }
      return;
    }
    case Action.STORE: {
      const li = libraryBeside(state, ctx, id);
      if (li >= 0) storeDocuments(state, ctx, id, li);
      finish(ctx, id);
      return;
    }
    case Action.ATTACK:
      strike(state, ctx, id);
      return;
    case Action.PLANT:
      plant(state, ctx, id);
      finish(ctx, id);
      return;
    case Action.WATER:
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] >= ctx.balance.agriculture.waterTicks) {
        waterPlot(state, ctx, id);
        finish(ctx, id);
      }
      return;
    case Action.SOW:
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] >= ctx.balance.agriculture.sowTicks) {
        sowPlot(state, ctx, id);
        finish(ctx, id);
      }
      return;
    case Action.STOCK:
      stockProduce(state, ctx, id);
      finish(ctx, id);
      return;
    case Action.FETCH:
      fetchInputs(state, ctx, id);
      finish(ctx, id);
      return;
    case Action.REPLICATE:
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] >= ctx.balance.replication.durationTicks) {
        replicate(state, ctx, id);
        finish(ctx, id);
      }
      return;
    default:
      return;
  }
}

/**
 * Harvests the resource under the agent into its inventory, until it carries `harvestUntil`
 * units of it, its load is full or the tile is empty.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function harvest(state, ctx, id) {
  const agents = ctx.agents;
  // What it harvests and how fast, looked at when it begins a unit, the tile again at the end.
  if (agents.actionNeed[id] === 0) {
    if (!harvestable(state, ctx, id)) {
      finish(ctx, id);
      return;
    }
    const wanted = agents.harvestGood[id];
    // The people of a town are quicker at what their town lives from (decision 0030).
    const town = agents.tier[id] === Tier.COMMONER ? craftOfTown(state, ctx, id, wanted) : 1;
    const speed =
      (1 + agents.force[id] / ctx.harvestForceScale) * harvestMultiplier(ctx, id, wanted) * town;
    agents.actionNeed[id] = ctx.harvestTicks[wanted] / speed;
  }
  const need = agents.actionNeed[id];
  agents.actionProgress[id] += 1;
  if (agents.actionProgress[id] < need) return;
  agents.actionProgress[id] -= need;
  agents.actionNeed[id] = 0;
  if (!harvestable(state, ctx, id)) {
    finish(ctx, id);
    return;
  }
  const wanted = agents.harvestGood[id];
  const x = ctx.spot[0];
  const y = ctx.spot[1];
  const taken = state.world.takeUnit(x, y);
  if (taken === 0) {
    finish(ctx, id);
    return;
  }
  noteHarvest(state, ctx, id, x, y, taken);
  agents.addCarried(id, taken, 1, state.tick);
  // Grain gives a seed now and then.
  const crop = ctx.cropOfResource[taken];
  if (crop >= 0 && agents.rng[id].next() < ctx.crops[crop].seedChance) {
    const seed = ctx.crops[crop].seed;
    agents.addCarried(id, seed, 1, state.tick);
    // A seed in wild grain: it may guess that seeds make plants (docs/design/13, « Découvrir »).
    const wild = state.crops.at(x, y) < 0;
    const sower = ctx.plotRecipe >= 0 && agents.recipes[id].knows(ctx.plotRecipe);
    if (wild && !sower && agents.rng[id].next() < ctx.crops[crop].hintChance)
      agents.hint[id] = seed;
  }
  // The last of a carcass leaves its hide.
  if (state.world.lastTakeDepleted && taken === ctx.carcass) agents.addCarried(id, ctx.hideGood, 1);
  const habit = id * agents.goodSlots + taken;
  if (agents.gathered[habit] < 65535) agents.gathered[habit]++;
  if (state.world.lastTakeDepleted) {
    harvestedPlot(state, x, y, id);
    if (!exhausted(state, ctx, id, x, y, taken)) ctx.scheduleRegrowth(state, x, y, taken);
    forgetEmptied(ctx, id, taken, x, y);
  } else {
    consolidate(state, ctx, id, taken);
  }
  const enough = agents.carried(id, wanted) >= agents.harvestUntil[id];
  const full = agents.carriedTotal(id) >= ctx.capacity(id);
  if (enough || full || state.world.lastTakeDepleted) finish(ctx, id);
}

/**
 * True if the agent can go on harvesting: the resource it wants beside it (its tile in
 * `ctx.spot`), room in its load, the tool it takes.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
function harvestable(state, ctx, id) {
  const agents = ctx.agents;
  const wanted = agents.harvestGood[id];
  ctx.wantedOne[wanted] = 1;
  sourceTile(state, ctx, id, ctx.wantedOne, ctx.spot);
  ctx.wantedOne[wanted] = 0;
  const p = state.world.packedAt(ctx.spot[0], ctx.spot[1]);
  if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== wanted) return false;
  if (agents.carriedTotal(id) >= ctx.capacity(id)) return false;
  return canHarvest(ctx, id, wanted);
}

/**
 * True if the agent has what it takes to harvest `resource` (some need a tool, which one of the
 * people has when its town knows how to make it).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} resource
 * @returns {boolean}
 */
export function canHarvest(ctx, id, resource) {
  const tool = ctx.catalog.requiredTool[resource];
  if (tool === 0) return true;
  if (tool < 0) return false;
  const a = ctx.agents;
  if (a.carried(id, tool) > 0) return true;
  // The people work with the town's tools: those its figures know how to make (decision 0030).
  if (a.tier[id] !== Tier.COMMONER || a.colony[id] < 0) return false;
  const r = ctx.catalog.recipeForGood[tool];
  return r >= 0 && has(ctx.colonies[a.colony[id]].knowhow, ctx.catalog.knowFor[r]);
}

/**
 * True if the agent can use `station` where it stands (bare hands always).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} station
 * @returns {boolean}
 */
function canUse(state, ctx, id, station) {
  return station === BARE_HANDS || besideStructure(state, ctx, id, station);
}

/**
 * The agent strikes what it fights, every `attackInterval` ticks while it is adjacent: a predator
 * (which may flee or die and leave a carcass) or a den (destroyed at 0). The fight teaches it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function strike(state, ctx, id) {
  const agents = ctx.agents;
  if (agents.attackCooldown[id] > 0) {
    agents.attackCooldown[id]--;
    return;
  }
  const t = state.threats;
  const cfg = ctx.balance.threats;
  const target = agents.attackTarget[id];
  const x = agents.x[id];
  const y = agents.y[id];
  const blow = Math.max(1, agentAttack(ctx, id) - cfg.defense);
  if (target >= 0 && t.alive[target] === 1) {
    if (Math.abs(t.x[target] - x) > 1 || Math.abs(t.y[target] - y) > 1) {
      finish(ctx, id);
      return;
    }
    t.hp[target] -= blow;
    train(ctx, id, ctx.balance.combat.skillPerBlowGiven);
    if (t.hp[target] <= 0) {
      killPredator(state, ctx, target, id);
      finish(ctx, id);
    } else if (t.hp[target] < t.maxHp[target] * cfg.fleeBelow) {
      t.mood[target] = Mood.FLEE;
    }
  } else if (target <= -2 && t.denAlive[-2 - target] === 1) {
    const d = -2 - target;
    if (Math.abs(t.denX[d] - x) > 1 || Math.abs(t.denY[d] - y) > 1) {
      finish(ctx, id);
      return;
    }
    t.denHp[d] -= blow;
    train(ctx, id, ctx.balance.combat.skillPerBlowGiven);
    if (t.denHp[d] <= 0) {
      destroyDen(state, ctx, d, id);
      finish(ctx, id);
    }
  } else {
    finish(ctx, id);
    return;
  }
  agents.attackCooldown[id] = ctx.balance.combat.attackInterval;
}

/**
 * Completes a recipe: consumes the inputs and produces the item, or builds the structure on the
 * agent's tile. Does nothing if a precondition no longer holds (the agent will replan).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function craft(state, ctx, id) {
  const agents = ctx.agents;
  const r = agents.craftRecipe[id];
  const recipe = ctx.catalog.recipes[r];
  const x = agents.x[id];
  const y = agents.y[id];
  if (!canUse(state, ctx, id, recipe.station)) return;
  for (const input of recipe.inputs) if (agents.carried(id, input.good) < input.count) return;
  const building = recipe.outputKind === 'structure';
  const house = building && ctx.shelterCodes[recipe.output] === 1;
  let dir = -1;
  if (house) {
    // A house rises around its door, where the builder stands, if it fits there.
    // Within its colony's walls, unless it founds a new colony far away.
    const c = agents.colony[id];
    let colony = c >= 0 && state.colonies[c].hasCamp ? state.colonies[c] : null;
    if (colony && colony.expState === Expedition.TRAVELLING && colony.inExpedition(id)) {
      colony = null;
    }
    dir = houseDir(state, ctx, x, y, colony, recipe.output);
    if (dir < 0) return;
  } else if (building) {
    const p = state.world.packedAt(x, y);
    if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0 || structureAt(state, ctx, x, y) !== 0) {
      return;
    }
  }
  const book = agents.recipes[id];
  // One makes only what one believes one knows (it may have just turned out wrong); a commoner,
  // what its town knows how to make.
  const commoner = agents.tier[id] === Tier.COMMONER;
  const known = ctx.catalog.knowFor[r];
  if (commoner ? !commonerKnows(state, agents.colony[id], known) : !book.knows(known)) return;
  if (!commoner && book.wrong[known] === 1) {
    // A recipe heard with an error: half the ingredients are wasted, the belief is dropped and
    // the attempt is remembered as a failure.
    for (const input of recipe.inputs)
      agents.addCarried(id, input.good, -Math.ceil(input.count / 2));
    book.forget(known);
    book.recordFailure(recipe.station, recipe.mask, state.tick, ctx.failureTau);
    state.events.push(state.tick, EventType.MISTAKEN, id, x, y, known);
    return;
  }
  for (const input of recipe.inputs) agents.addCarried(id, input.good, -input.count);
  const m = ctx.balance.memory;
  if (!commoner) book.use(known, state.tick, m.consolidation, ctx.maxTau);
  agents.recordMade(id, r, state.tick);
  if (building && recipe.output === ctx.plotCode) {
    // Sowing: a plot, its seed already in the ground.
    state.world.setStructure(x, y, recipe.output);
    tillDone(state, ctx, id, x, y);
  } else if (house) {
    raiseHouse(state, ctx, x, y, dir, recipe.output);
    const bx = ctx.newBeds[0];
    const by = ctx.newBeds[1];
    notice(state, ctx, id, ctx.catalog.resourceCount + recipe.output, bx, by, 0);
    state.events.push(state.tick, EventType.BUILT, id, x, y, r);
    agents.builds[id]++;
    onBuilt(state, ctx, id, recipe.output, x, y);
    inspire(state, ctx, id, -1, recipe.output);
  } else if (building) {
    state.world.setStructure(x, y, recipe.output);
    notice(state, ctx, id, ctx.catalog.resourceCount + recipe.output, x, y, 0);
    state.events.push(state.tick, EventType.BUILT, id, x, y, r);
    agents.builds[id]++;
    onBuilt(state, ctx, id, recipe.output, x, y);
    inspire(state, ctx, id, -1, recipe.output);
  } else {
    agents.addCarried(id, recipe.output, 1, state.tick);
    // A book or a map is an object with its own (blank) content.
    if (recipe.output === ctx.docGood[DocKind.BOOK])
      state.documents.create(DocKind.BOOK, id, state.tick);
    if (recipe.output === ctx.docGood[DocKind.TABLET])
      state.documents.create(DocKind.TABLET, id, state.tick);
    if (recipe.output === ctx.docGood[DocKind.MAP])
      state.documents.create(DocKind.MAP, id, state.tick);
    state.events.push(state.tick, EventType.CRAFTED, id, x, y, r);
    inspire(state, ctx, id, recipe.output, 0);
  }
  imitate(state, ctx, id, r);
}

/**
 * A researcher who makes something new to it (a material no recipe it knows uses, a station it
 * knows nothing to make at), or tries a material alone at such a station, sometimes has an idea
 * of what it is for (docs/design/14-economie.md,
 * « Arbre technologique »): one of the recipes that use it, which it will try first.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} good - Good made, or -1.
 * @param {number} station - Station built, or 0.
 * @returns {void}
 */
function inspire(state, ctx, id, good, station) {
  const a = ctx.agents;
  const catalog = ctx.catalog;
  if (!researcher(state, ctx, id) || a.ideaStation[id] >= 0) return;
  if (station > 0 && catalog.structures[station - 1].kind !== 'station') return;
  if (good > 0 && catalog.ingredientBit[good] < 0) return;
  const book = a.recipes[id];
  // Only a use it could try: every ingredient carried, harvestable or made with a known recipe.
  const reachable = (g) =>
    a.carried(id, g) > 0 ||
    (g <= catalog.resourceCount
      ? canHarvestOrTool(ctx, id, g)
      : catalog.recipeForGood[g] >= 0 && book.knows(catalog.recipeForGood[g]));
  const uses = (r) =>
    (station > 0
      ? catalog.recipes[r].station === station
      : catalog.recipes[r].inputs.some((i) => i.good === good)) &&
    catalog.recipes[r].inputs.every((i) => reachable(i.good));
  let unknown = 0;
  for (let r = 0; r < catalog.recipes.length; r++) {
    if (!uses(r)) continue;
    if (book.knows(r)) return;
    unknown++;
  }
  if (unknown === 0 || a.rng[id].next() >= ctx.balance.crafting.inspiration) return;
  let pick = Math.floor(a.rng[id].next() * unknown);
  for (let r = 0; r < catalog.recipes.length; r++) {
    if (!uses(r) || pick-- > 0) continue;
    a.ideaStation[id] = catalog.recipes[r].station;
    a.ideaMask[id] = catalog.recipes[r].mask;
    a.ideaTick[id] = state.tick;
    return;
  }
}

/**
 * Those who watched a recipe being made (awake, within their perception) note the maker's skill
 * and may learn it (docs/design/04-fabrication.md, « Imitation »).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} maker
 * @param {number} r
 * @returns {void}
 */
function imitate(state, ctx, maker, r) {
  const a = ctx.agents;
  const cfg = ctx.balance.social;
  // Nobody sees farther than the largest window from a tower.
  const n = a.near(a.x[maker], a.y[maker], MAX_RADIUS + ctx.balance.fortress.towerSight);
  const found = ctx.watchers;
  found.set(a.grid.found.subarray(0, n));
  for (let k = 0; k < n; k++) {
    const id = found[k];
    // Commoners do not learn by watching (decision 0030).
    if (id === maker || a.asleep[id] === 1 || a.tier[id] === Tier.COMMONER) continue;
    const radius = perceptionRadius(ctx, id, ctx.dark);
    if (Math.abs(a.x[id] - a.x[maker]) > radius || Math.abs(a.y[id] - a.y[maker]) > radius) {
      continue;
    }
    const model = a.social[id];
    const sheet = model.sheet(maker, state.tick);
    model.skills[sheet] = withBit(model.skills[sheet], r);
    const book = a.recipes[id];
    if (book.knows(r) || a.rng[id].next() >= cfg.imitationChance) continue;
    book.learn(r, state.tick, ctx.recipeTau, cfg.imitationStrength);
    state.events.push(state.tick, EventType.IMITATED, id, a.x[id], a.y[id], r);
  }
}

/**
 * Completes a trial: a combination that matches a recipe teaches it (the sample is kept); any
 * other costs one unit of each ingredient and is remembered as a failure.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function experiment(state, ctx, id) {
  const agents = ctx.agents;
  const station = agents.trialStation[id];
  const mask = agents.trialMask[id];
  if (!canUse(state, ctx, id, station)) return;
  for (let m = mask; m !== 0; m &= m - 1) {
    if (agents.carried(id, lowestIngredient(ctx.catalog, m)) === 0) return;
  }
  const book = agents.recipes[id];
  const r = matchRecipe(ctx.catalog, station, mask);
  if (r >= 0) {
    if (book.learn(r, state.tick, ctx.recipeTau)) {
      state.events.push(state.tick, EventType.DISCOVERED, id, agents.x[id], agents.y[id], r);
      state.knowledge.noteDiscovery(r, id, state.tick);
    }
    agents.hint[id] = 0;
    refresh(ctx, id, agents.goal[id]);
    if (station === agents.ideaStation[id] && mask === agents.ideaMask[id]) {
      agents.ideaStation[id] = -1;
      agents.ideaMask[id] = 0;
    }
    return;
  }
  for (let m = mask; m !== 0; m &= m - 1) {
    agents.addCarried(id, lowestIngredient(ctx.catalog, m), -1);
  }
  book.recordFailure(station, mask, state.tick, ctx.failureTau);
  tire(ctx, id, agents.goal[id], state.tick);
  // A material alone at a station: watching what the station does to it may give an idea.
  if (station !== BARE_HANDS && (mask & (mask - 1)) === 0) inspire(state, ctx, id, -1, station);
  // A researcher notes it in the colony's notebook, for itself and those after it.
  if (researcher(state, ctx, id)) state.colonies[agents.colony[id]].notebook.record(station, mask);
}

/**
 * True if the action makes the agent spend more energy (needs rise faster).
 * @param {number} action
 * @returns {boolean}
 */
export function isEffort(action) {
  return (
    action === Action.MOVE ||
    action === Action.FORAGE ||
    action === Action.HARVEST ||
    action === Action.CRAFT ||
    action === Action.BUILD
  );
}
