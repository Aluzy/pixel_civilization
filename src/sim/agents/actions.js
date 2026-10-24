import { EventType } from '../core/events.js';
import { BARE_HANDS, matchRecipe } from '../crafting/catalog.js';
import { PACK } from '../world/chunk-store.js';
import { Action } from './action-types.js';
import { consolidate, forgetEmptied } from './beliefs.js';
import { besideStructure, harvestMultiplier, inShelter, structureAt } from './equipment.js';
import { WATER_SUBJECT } from './memory.js';
import { notice } from './perception.js';

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
  ctx.agents.thenAction[id] = Action.NONE;
  ctx.agents.asleep[id] = 0;
  ctx.agents.needsDecision[id] = 1;
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
      if ((state.world.packedAt(x + dx, y + dy) & PACK.MASK) === ctx.waterBiome) return true;
    }
  }
  return false;
}

/**
 * Eats one carried edible unit, if any.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} False if nothing edible is carried.
 */
function eatCarried(ctx, id) {
  const agents = ctx.agents;
  for (let r = 1; r < ctx.edible.length; r++) {
    if (ctx.edible[r] !== 1 || agents.carried(id, r) === 0) continue;
    agents.addCarried(id, r, -1);
    agents.hunger[id] = Math.max(0, agents.hunger[id] - ctx.nutrition[r]);
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
        agents.actionX[id] = agents.x[id];
        agents.actionY[id] = agents.y[id];
        agents.actionProgress[id] = 0;
        if (then === Action.NONE) agents.needsDecision[id] = 1;
        return;
      }
      const path = agents.path[id];
      const nx = path[index * 2];
      const ny = path[index * 2 + 1];
      const biome = state.world.packedAt(nx, ny) & PACK.MASK;
      const factor = ctx.biomeSpeed[biome];
      if (factor <= 0) {
        finish(ctx, id);
        return;
      }
      agents.moveProgress[id] += (agents.speed[id] * factor) / ctx.ticksPerSecond;
      if (agents.moveProgress[id] >= 1) {
        agents.moveProgress[id] -= 1;
        agents.x[id] = nx;
        agents.y[id] = ny;
        agents.pathIndex[id] = index + 1;
      }
      return;
    }
    case Action.DRINK: {
      if (!besideWater(state, ctx, agents.x[id], agents.y[id])) {
        finish(ctx, id);
        return;
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
      const x = agents.x[id];
      const y = agents.y[id];
      const resource = (state.world.packedAt(x, y) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
      if (ctx.edible[resource] !== 1) {
        finish(ctx, id);
        return;
      }
      const need = ctx.harvestTicks[resource] / (1 + agents.force[id] / ctx.harvestForceScale);
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] < need) return;
      agents.actionProgress[id] -= need;
      const taken = state.world.takeUnit(x, y);
      if (taken === 0) {
        finish(ctx, id);
        return;
      }
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
      const ate = eatCarried(ctx, id);
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
      if (agents.fatigue[id] <= ctx.balance.needs.wakeFatigue) finish(ctx, id);
      return;
    }
    case Action.HARVEST:
      harvest(state, ctx, id);
      return;
    case Action.CRAFT:
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] >= ctx.catalog.recipes[agents.craftRecipe[id]].duration) {
        craft(state, ctx, id);
        finish(ctx, id);
      }
      return;
    case Action.EXPERIMENT:
      agents.actionProgress[id] += 1;
      if (agents.actionProgress[id] >= ctx.balance.actions.experimentTicks) {
        experiment(state, ctx, id);
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
  const x = agents.x[id];
  const y = agents.y[id];
  const resource = (state.world.packedAt(x, y) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
  const wanted = agents.harvestGood[id];
  const loaded = agents.carriedTotal(id) >= ctx.capacity(id);
  if (resource !== wanted || loaded || !canHarvest(ctx, id, wanted)) {
    finish(ctx, id);
    return;
  }
  const speed = (1 + agents.force[id] / ctx.harvestForceScale) * harvestMultiplier(ctx, id, wanted);
  const need = ctx.harvestTicks[resource] / speed;
  agents.actionProgress[id] += 1;
  if (agents.actionProgress[id] < need) return;
  agents.actionProgress[id] -= need;
  const taken = state.world.takeUnit(x, y);
  if (taken === 0) {
    finish(ctx, id);
    return;
  }
  agents.addCarried(id, taken, 1, state.tick);
  if (state.world.lastTakeDepleted) {
    ctx.scheduleRegrowth(state, x, y, taken);
    forgetEmptied(ctx, id, taken, x, y);
  } else {
    consolidate(state, ctx, id, taken);
  }
  const enough = agents.carried(id, wanted) >= agents.harvestUntil[id];
  const full = agents.carriedTotal(id) >= ctx.capacity(id);
  if (enough || full || state.world.lastTakeDepleted) finish(ctx, id);
}

/**
 * True if the agent has what it takes to harvest `resource` (some need a tool).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} resource
 * @returns {boolean}
 */
export function canHarvest(ctx, id, resource) {
  const tool = ctx.catalog.requiredTool[resource];
  return tool === 0 || (tool > 0 && ctx.agents.carried(id, tool) > 0);
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
  if (building) {
    const p = state.world.packedAt(x, y);
    if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0 || structureAt(state, ctx, x, y) !== 0) {
      return;
    }
  }
  for (const input of recipe.inputs) agents.addCarried(id, input.good, -input.count);
  const m = ctx.balance.memory;
  agents.recipes[id].use(r, state.tick, m.consolidation, ctx.maxTau);
  agents.recordMade(id, r, state.tick);
  if (building) {
    state.world.setStructure(x, y, recipe.output);
    notice(state, ctx, id, ctx.catalog.resourceCount + recipe.output, x, y, 0);
    state.events.push(state.tick, EventType.BUILT, id, x, y, r);
  } else {
    agents.addCarried(id, recipe.output, 1, state.tick);
    state.events.push(state.tick, EventType.CRAFTED, id, x, y, r);
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
    if (agents.carried(id, 31 - Math.clz32(m & -m)) === 0) return;
  }
  const book = agents.recipes[id];
  const r = matchRecipe(ctx.catalog, station, mask);
  if (r >= 0) {
    if (book.learn(r, state.tick, ctx.recipeTau)) {
      state.events.push(state.tick, EventType.DISCOVERED, id, agents.x[id], agents.y[id], r);
    }
    return;
  }
  for (let m = mask; m !== 0; m &= m - 1) agents.addCarried(id, 31 - Math.clz32(m & -m), -1);
  book.recordFailure(station, mask, state.tick, ctx.failureTau);
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
    action === Action.CRAFT
  );
}
