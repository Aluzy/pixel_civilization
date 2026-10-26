import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Action } from '../../src/sim/agents/action-types.js';
import { stepAction } from '../../src/sim/agents/actions.js';
import { quarterBonus } from '../../src/sim/agents/equipment.js';
import { groundSpeed, sailSpeed } from '../../src/sim/agents/sailing.js';
import { learnTick, teachTick } from '../../src/sim/agents/teach-work.js';
import { tire, wearyWeights } from '../../src/sim/ai/weariness.js';
import { roomForColony } from '../../src/sim/colony/migration.js';
import { EventType } from '../../src/sim/core/events.js';
import { createRng } from '../../src/sim/core/rng.js';
import { DocKind } from '../../src/sim/knowledge/document-store.js';
import { libraryBeside, writable, writeOne } from '../../src/sim/knowledge/writing.js';
import { CATALOG, GOAL_TABLE, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { knowledgeSystem } from '../../src/sim/systems/knowledge-system.js';
import { PACK } from '../../src/sim/world/chunk-store.js';

// Expansion and commerce (decision 0029): fish, boats and piers, weariness, colony places,
// tablets, great libraries, masters, quarters and ships.

const DAY = balance.time.ticksPerDay;
const good = (id) => {
  const item = CATALOG.items.find((i) => i.id === id);
  return item ? item.good : WORLD_TABLES.resources.findIndex((r) => r.id === id) + 1;
};
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
const code = (id) => CATALOG.structures.find((s) => s.id === id).code;
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * A free land tile beside water holding fish, near the first agent.
 * @param {Simulation} sim
 * @returns {number[]} x, y of the shore tile, then of the fish.
 */
function shoreWithFish(sim) {
  const fish = good('fish');
  const a = sim.agents;
  for (let r = 0; r < 200; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = a.x[0] + dx;
        const y = a.y[0] + dy;
        const p = sim.world.packedAt(x, y);
        if (sim.ctx.biomeSpeed[p & PACK.MASK] <= 0 || p >>> PACK.STRUCTURE_SHIFT !== 0) continue;
        if (sim.world.lastOccupant() >= 0) continue;
        for (const [ex, ey] of N4) {
          const q = sim.world.packedAt(x + ex, y + ey);
          if (((q >> PACK.RESOURCE_SHIFT) & PACK.MASK) === fish) return [x, y, x + ex, y + ey];
        }
      }
    }
  }
  throw new Error('no fish in reach');
}

/**
 * Another agent of colony 0 on a free tile near (x, y).
 * @param {Simulation} sim
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function another(sim, x, y) {
  for (let r = 1; r < 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const p = sim.world.packedAt(x + dx, y - r);
      if (sim.ctx.biomeSpeed[p & PACK.MASK] <= 0 || sim.world.lastOccupant() >= 0) continue;
      if (p >>> PACK.STRUCTURE_SHIFT !== 0) continue;
      const id = sim.agents.create({
        x: x + dx,
        y: y - r,
        tick: sim.tick,
        attributes: balance.agent.start,
        needs: 10,
        rng: createRng(99),
        colony: 0,
      });
      sim.state.colonies[0].members++;
      return id;
    }
  }
  throw new Error('no room for an agent');
}

describe('the sea', () => {
  it('catches fish from the shore beside it', () => {
    const sim = new Simulation({ seed: 1, balance });
    const a = sim.agents;
    const [x, y, fx, fy] = shoreWithFish(sim);
    a.place(0, x, y);
    a.harvestGood[0] = good('fish');
    a.harvestUntil[0] = 1;
    a.action[0] = Action.HARVEST;
    a.actionProgress[0] = 0;
    for (let t = 0; t < 200 && a.action[0] !== Action.NONE; t++) {
      sim.state.tick++;
      stepAction(sim.state, sim.ctx, 0);
    }
    expect(a.carried(0, good('fish'))).toBe(1);
    // The fish was taken from the water, not from the shore.
    expect(sim.ctx.fromShore[good('fish')]).toBe(1);
    expect(sim.world.packedAt(fx, fy) & PACK.MASK).toBe(sim.ctx.waterBiome);
  });

  it('opens the water to one with a boat, and walks a pier like land', () => {
    const sim = new Simulation({ seed: 1, balance });
    const ctx = sim.ctx;
    expect(sailSpeed(sim.state, ctx, 0)).toBe(0);
    expect(groundSpeed(ctx, ctx.waterBiome, 0, 0)).toBe(0);
    sim.agents.addCarried(0, good('boat'), 1);
    expect(sailSpeed(sim.state, ctx, 0)).toBe(balance.sailing.boatSpeed);
    expect(groundSpeed(ctx, ctx.waterBiome, 0, balance.sailing.boatSpeed)).toBeGreaterThan(0);
    expect(groundSpeed(ctx, ctx.waterBiome, code('pier'), 0)).toBe(1);
  });

  it('sails the voyages of a colony whose ship lies at its quay', () => {
    const sim = new Simulation({ seed: 1, balance });
    const [x, y] = shoreWithFish(sim);
    const colony = sim.state.colonies[0];
    sim.world.setStructure(x, y, code('ship'));
    colony.hasShip = true;
    colony.shipX = x;
    colony.shipY = y;
    colony.scout = 0;
    expect(sailSpeed(sim.state, sim.ctx, 0)).toBe(balance.sailing.shipSpeed);
    // Burnt or gone: no more voyages by sea.
    sim.world.setStructure(x, y, 0);
    expect(sailSpeed(sim.state, sim.ctx, 0)).toBe(0);
  });
});

describe('fixes', () => {
  it('tires of a goal whose trials keep failing, and gets over it', () => {
    const sim = new Simulation({ seed: 1, balance });
    const ctx = sim.ctx;
    const equip = GOAL_TABLE.goals.findIndex((g) => g.id === 'equip');
    const weights = new Float64Array(GOAL_TABLE.goals.length);
    // The first failures are the cost of trying.
    for (let k = 0; k < balance.ai.weariness.grace; k++) tire(ctx, 0, equip, 0);
    weights.fill(1);
    wearyWeights(ctx, 0, 0, weights);
    expect(weights[equip]).toBe(1);
    for (let k = 0; k < 20; k++) tire(ctx, 0, equip, 0);
    weights.fill(1);
    wearyWeights(ctx, 0, 0, weights);
    expect(weights[equip]).toBeLessThan(0.25);
    weights.fill(1);
    wearyWeights(ctx, 0, 20 * DAY, weights);
    expect(weights[equip]).toBe(1);
  });

  it('frees the place of a dead colony', () => {
    const sim = new Simulation({ seed: 1, balance });
    const colonies = sim.state.colonies;
    const living = colonies[0];
    living.members = 3;
    while (colonies.length < balance.migration.maxColonies) colonies.push(living);
    expect(roomForColony(sim.state, balance.migration)).toBe(false);
    const dead = Object.create(living);
    dead.members = 0;
    colonies[colonies.length - 1] = dead;
    expect(roomForColony(sim.state, balance.migration)).toBe(true);
  });
});

describe('lasting knowledge', () => {
  it('writes recipes on a clay tablet when it has no book', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const docs = sim.state.documents;
    const tablet = docs.create(DocKind.TABLET, 0, sim.tick);
    a.addCarried(0, sim.ctx.docGood[DocKind.TABLET], 1, sim.tick);
    for (const r of ['workbench', 'spear', 'shelter', 'campfire']) {
      a.recipes[0].learn(recipe(r), sim.tick, 1000);
    }
    expect(writable(sim.state, sim.ctx, 0)).toBe(tablet);
    let written = 0;
    while (writeOne(sim.state, sim.ctx, 0)) written++;
    expect(written).toBe(balance.writing.tabletRecipes);
  });

  it('keeps a great library from the fire, read from two tiles away', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const li = colony.addLibrary(a.x[0] + 2, a.y[0], sim.tick, true);
    expect(libraryBeside(sim.state, sim.ctx, 0)).toBe(li);
    const chance = balance.writing.fireChancePerDay;
    balance.writing.fireChancePerDay = 1;
    try {
      sim.state.tick = DAY;
      knowledgeSystem(sim.state, sim.ctx);
    } finally {
      balance.writing.fireChancePerDay = chance;
    }
    expect(colony.libraryStanding[li]).toBe(1);
  });

  it('teaches a recipe at the school: the pupil remembers it as well as its master', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const pupil = another(sim, a.x[0], a.y[0]);
    a.place(pupil, a.x[0] + 1, a.y[0]);
    colony.hasSchool = true;
    colony.schoolX = a.x[0];
    colony.schoolY = a.y[0] + 1;
    sim.world.setStructure(colony.schoolX, colony.schoolY, code('school'));
    const r = recipe('spear');
    a.recipes[0].learn(r, sim.tick, 1000);
    colony.teacher = 0;
    expect(teachTick(sim.state, sim.ctx, 0)).toBe(true);
    let taught = false;
    for (let t = 0; t <= balance.teaching.lessonTicks && !taught; t++) {
      learnTick(sim.state, sim.ctx, pupil);
      taught = a.recipes[pupil].knows(r);
    }
    expect(taught).toBe(true);
    const s = a.recipes[pupil].strength(r, sim.tick);
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThanOrEqual(a.recipes[0].strength(r, sim.tick));
    expect(sim.state.events.since(0).some((e) => e.type === EventType.TAUGHT)).toBe(true);
  });
});

describe('quarters', () => {
  it('works faster at a station among others of its kind', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const bench = code('workbench');
    sim.world.setStructure(a.x[0] + 1, a.y[0], bench);
    expect(quarterBonus(sim.state, sim.ctx, 0, bench)).toBe(1);
    sim.world.setStructure(a.x[0] + 3, a.y[0], bench);
    sim.world.setStructure(a.x[0] - 2, a.y[0] + 2, bench);
    expect(quarterBonus(sim.state, sim.ctx, 0, bench)).toBeCloseTo(1.2, 10);
    for (let k = 0; k < 5; k++) sim.world.setStructure(a.x[0] - 3, a.y[0] - 3 + k, bench);
    expect(quarterBonus(sim.state, sim.ctx, 0, bench)).toBeCloseTo(1 + balance.quarters.maxBonus);
  });
});
