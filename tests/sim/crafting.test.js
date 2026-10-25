import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Action } from '../../src/sim/agents/action-types.js';
import { stepAction } from '../../src/sim/agents/actions.js';
import { EventType } from '../../src/sim/core/events.js';
import { BARE_HANDS } from '../../src/sim/crafting/catalog.js';
import { CATALOG, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { PACK } from '../../src/sim/world/chunk-store.js';

const DAY = balance.time.ticksPerDay;
const good = (id) => {
  const item = CATALOG.items.find((i) => i.id === id);
  return item ? item.good : WORLD_TABLES.resources.findIndex((r) => r.id === id) + 1;
};
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);

/**
 * Finds a free tile near the agent (no resource, no structure, passable) and puts it there.
 * @param {Simulation} sim
 * @returns {number} Agent id.
 */
function placeOnFreeTile(sim) {
  const a = sim.agents;
  for (let r = 0; r < 30; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = a.x[0] + dx;
      const y = a.y[0] + r;
      const p = sim.world.packedAt(x, y);
      const biome = p & PACK.MASK;
      if (sim.ctx.biomeSpeed[biome] <= 0) continue;
      if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) continue;
      if (((p >>> PACK.STRUCTURE_SHIFT) & PACK.MASK) !== 0) continue;
      a.x[0] = x;
      a.y[0] = y;
      return 0;
    }
  }
  throw new Error('no free tile');
}

/**
 * Runs the agent's current action until it ends.
 * @param {Simulation} sim
 * @param {number} id
 * @returns {void}
 */
function runAction(sim, id) {
  for (let t = 0; t < 1000 && sim.agents.action[id] !== Action.NONE; t++) {
    sim.state.tick++;
    stepAction(sim.state, sim.ctx, id);
  }
}

/**
 * @param {Simulation} sim
 * @param {number} id
 * @param {number} action
 * @returns {void}
 */
function start(sim, id, action) {
  sim.agents.action[id] = action;
  sim.agents.actionProgress[id] = 0;
}

describe('crafting', () => {
  it('builds a structure on its tile with the recipe, and remembers it', () => {
    const sim = new Simulation({ seed: 5, balance });
    const id = placeOnFreeTile(sim);
    const a = sim.agents;
    a.addCarried(id, good('wood'), 4);
    a.addCarried(id, good('fiber'), 2);
    a.recipes[id].learn(recipe('workbench'), sim.tick, 1000);
    a.craftRecipe[id] = recipe('workbench');
    start(sim, id, Action.CRAFT);
    runAction(sim, id);
    const code = CATALOG.structures.find((s) => s.id === 'workbench').code;
    expect(sim.world.tileAt(a.x[id], a.y[id]).structure).toBe(code);
    expect(a.carried(id, good('wood'))).toBe(0);
    const subject = CATALOG.resourceCount + code;
    expect(a.memory[id].find(subject, a.x[id], a.y[id], 0)).toBeGreaterThan(-1);
    expect(a.madeAt(id, recipe('workbench'))).toBeGreaterThan(0);
    expect(sim.events.events.at(-1).type).toBe(EventType.BUILT);
  });

  it('crafts an item only beside its station', () => {
    const sim = new Simulation({ seed: 5, balance });
    const id = placeOnFreeTile(sim);
    const a = sim.agents;
    a.addCarried(id, good('wood'), 2);
    a.addCarried(id, good('fiber'), 1);
    a.recipes[id].learn(recipe('spear'), sim.tick, 1000);
    a.craftRecipe[id] = recipe('spear');
    start(sim, id, Action.CRAFT);
    runAction(sim, id);
    expect(a.carried(id, good('spear'))).toBe(0);
    sim.world.setStructure(a.x[id] + 1, a.y[id], 1);
    start(sim, id, Action.CRAFT);
    runAction(sim, id);
    expect(a.carried(id, good('spear'))).toBe(1);
    expect(a.carried(id, good('wood'))).toBe(0);
  });

  it('learns a recipe from a matching trial and pays for a failed one', () => {
    const sim = new Simulation({ seed: 5, balance });
    const id = placeOnFreeTile(sim);
    const a = sim.agents;
    a.addCarried(id, good('wood'), 3);
    a.addCarried(id, good('fiber'), 3);
    a.trialStation[id] = BARE_HANDS;
    a.trialMask[id] = (1 << good('wood')) | (1 << good('fiber'));
    start(sim, id, Action.EXPERIMENT);
    runAction(sim, id);
    expect(a.recipes[id].knows(recipe('workbench'))).toBe(true);
    expect(a.carried(id, good('wood'))).toBe(3);
    a.trialMask[id] = 1 << good('wood');
    start(sim, id, Action.EXPERIMENT);
    runAction(sim, id);
    expect(a.carried(id, good('wood'))).toBe(2);
    expect(a.recipes[id].hasFailed(BARE_HANDS, 1 << good('wood'))).toBe(true);
  });

  it('cannot harvest ore without a pickaxe', () => {
    const copper = good('copper');
    expect(CATALOG.requiredTool[copper]).toBe(good('stone_pickaxe'));
    expect(CATALOG.requiredTool[good('wood')]).toBe(0);
    expect(CATALOG.requiredTool[good('iron')]).toBe(-1);
  });

  // J4 exit: alone, the pixel discovers the workbench, a weapon, a tool and builds a shelter
  // before day 5 on at least 8 seeds out of 10.
  it('discovers the workbench, a weapon, a tool and builds a shelter before day 5', () => {
    const made = (sim, ids) => ids.some((rid) => sim.agents.madeAt(0, recipe(rid)) >= 0);
    let settled = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = new Simulation({ seed, balance });
      sim.step(4 * DAY);
      const ok =
        sim.agents.alive[0] === 1 &&
        made(sim, ['workbench']) &&
        made(sim, ['spear']) &&
        made(sim, ['stone_axe', 'stone_pickaxe']) &&
        made(sim, ['shelter']);
      if (ok) settled++;
    }
    expect(settled).toBeGreaterThanOrEqual(8);
  }, 60000);

  it('plans with a cache that never changes the outcome', () => {
    const a = new Simulation({ seed: 3, balance });
    const b = new Simulation({ seed: 3, balance });
    for (let t = 0; t < 2 * DAY; t++) {
      a.step(1);
      b.ctx.planner.cache.clear();
      b.step(1);
    }
    expect(b.hash()).toBe(a.hash());
    expect(a.ctx.planner.hits).toBeGreaterThan(0);
  });
});
