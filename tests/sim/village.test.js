import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Action } from '../../src/sim/agents/action-types.js';
import { stepAction } from '../../src/sim/agents/actions.js';
import { Tier } from '../../src/sim/agents/agent-store.js';
import { inShelter } from '../../src/sim/agents/equipment.js';
import { houseBox, houseDir, raiseHouse, registerHouse } from '../../src/sim/colony/house.js';
import { createRng } from '../../src/sim/core/rng.js';
import { PACK } from '../../src/sim/world/chunk-store.js';
import { CATALOG, Simulation } from '../../src/sim/simulation.js';
import { needsSystem } from '../../src/sim/systems/needs-system.js';

// The village (docs/design/03-individu.md « Abri », 08 « Sentiers »): houses of walls with a door
// and a bed per sleeper, nobody sharing a tile, sleep at night, regular meals, slow berries, and
// the trails that feet wear.

const DAY = balance.time.ticksPerDay;
/** A tick in the middle of the night (day, dusk, then night). */
const NIGHT = 3 * DAY + Math.round(0.72 * DAY);
const code = (id) => CATALOG.structures.find((s) => s.id === id).code;

/**
 * Raises a house near the first agent, its door where it fits first, and gives it to colony 0.
 * @param {Simulation} sim
 * @returns {{ x: number, y: number, dir: number }} The door and the direction.
 */
function house(sim) {
  const a = sim.agents;
  for (let r = 3; r < 20; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = a.x[0] + dx;
      const y = a.y[0] + r;
      const dir = houseDir(sim.state, sim.ctx, x, y, null);
      if (dir < 0) continue;
      raiseHouse(sim.state, sim.ctx, x, y, dir);
      registerHouse(sim.ctx, sim.state.colonies[0], x, y);
      return { x, y, dir };
    }
  }
  throw new Error('no room for a house');
}

/**
 * A second agent on a free tile near (x, y).
 * @param {Simulation} sim
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function another(sim, x, y) {
  const a = sim.agents;
  for (let r = 1; r < 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const p = sim.world.packedAt(x + dx, y - r);
      if (sim.ctx.biomeSpeed[p & PACK.MASK] <= 0 || sim.world.lastOccupant() >= 0) continue;
      if (p >>> PACK.STRUCTURE_SHIFT !== 0) continue;
      const id = a.create({
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

/**
 * True if no two living agents stand on the same tile, and every tile knows who stands on it
 * (but for the people of a town on their way).
 * @param {Simulation} sim
 * @returns {boolean}
 */
function oneByTile(sim) {
  const a = sim.agents;
  const seen = new Set();
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    // The people of a town walk through each other on their way (decision 0030), and take their
    // tile back at their next decision.
    const way = a.action[id] === Action.MOVE || a.action[id] === Action.NONE;
    if (a.tier[id] === Tier.COMMONER && way) continue;
    const key = `${a.x[id]},${a.y[id]}`;
    if (seen.has(key) || sim.world.occupantAt(a.x[id], a.y[id]) !== id) return false;
    seen.add(key);
  }
  return true;
}

describe('houses', () => {
  it('rings its beds with walls and one door: two beds in a 4 × 3 house', () => {
    const sim = new Simulation({ seed: 5, balance });
    const { x, y, dir } = house(sim);
    const box = new Int32Array(4);
    houseBox(sim.ctx.houseSize[0], sim.ctx.houseSize[1], x, y, dir, box);
    const count = { wall: 0, door: 0, bed: 0 };
    for (let ty = box[1]; ty <= box[3]; ty++) {
      for (let tx = box[0]; tx <= box[2]; tx++) {
        const c = sim.world.packedAt(tx, ty) >>> PACK.STRUCTURE_SHIFT;
        if (c === code('house_wall')) count.wall++;
        if (c === code('house_door')) count.door++;
        if (c === code('shelter')) count.bed++;
      }
    }
    expect(count).toEqual({ wall: 9, door: 1, bed: 2 });
    expect(sim.state.colonies[0].beds()).toBe(2);
    // Walls stop everyone; the door lets individuals in, not predators.
    expect(sim.ctx.blocksAgent[code('house_wall')]).toBe(1);
    expect(sim.ctx.blocksPredator[code('house_wall')]).toBe(1);
    expect(sim.ctx.blocksAgent[code('house_door')]).toBe(0);
    expect(sim.ctx.blocksPredator[code('house_door')]).toBe(1);
  });

  it('makes the smallest house a ring of 8 tiles, 7 walls and the door, around one bed', () => {
    const sim = new Simulation({ seed: 5, balance });
    sim.ctx.houseSize = Int32Array.from([3, 3]);
    sim.ctx.houseW[sim.ctx.shelterCode] = 3;
    sim.ctx.houseH[sim.ctx.shelterCode] = 3;
    const { x, y, dir } = house(sim);
    const box = new Int32Array(4);
    houseBox(3, 3, x, y, dir, box);
    let walls = 0;
    let beds = 0;
    for (let ty = box[1]; ty <= box[3]; ty++) {
      for (let tx = box[0]; tx <= box[2]; tx++) {
        const c = sim.world.packedAt(tx, ty) >>> PACK.STRUCTURE_SHIFT;
        if (c === code('house_wall')) walls++;
        if (c === code('shelter')) beds++;
      }
    }
    expect([walls, beds]).toEqual([7, 1]);
  });

  it('gives each sleeper its own bed, the first one the far bed', () => {
    const sim = new Simulation({ seed: 5, balance });
    const door = house(sim);
    const a = sim.agents;
    const second = another(sim, door.x, door.y);
    sim.state.tick = NIGHT;
    for (const id of [0, second]) {
      a.fatigue[id] = 60;
      a.hunger[id] = 0;
      a.thirst[id] = 0;
      a.needsDecision[id] = 1;
    }
    sim.step(150);
    const beds = [0, second].filter((id) => inShelter(sim.state, sim.ctx, a.x[id], a.y[id]));
    expect(beds.length).toBe(2);
    expect(`${a.x[0]},${a.y[0]}`).not.toBe(`${a.x[second]},${a.y[second]}`);
    expect(a.asleep[0] + a.asleep[second]).toBe(2);
  });
});

describe('room for everyone', () => {
  it('never puts two individuals on the same tile', () => {
    const sim = new Simulation({ seed: 2, balance });
    for (let k = 0; k < 30 * 12; k++) {
      sim.step(DAY / 12);
      expect(oneByTile(sim)).toBe(true);
    }
    expect(sim.state.colonies[0].members).toBeGreaterThan(10);
  }, 60000);

  it('lets two who meet head-on in a lane slip past each other', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const b = another(sim, a.x[0], a.y[0] + 1);
    // Side by side: each walks onto the other's tile.
    a.place(b, a.x[0] + 1, a.y[0]);
    const [x0, y0, x1, y1] = [a.x[0], a.y[0], a.x[b], a.y[b]];
    for (const [id, tx, ty] of [
      [0, x1, y1],
      [b, x0, y0],
    ]) {
      a.path[id][0] = tx;
      a.path[id][1] = ty;
      a.pathLength[id] = 1;
      a.pathIndex[id] = 0;
      a.action[id] = Action.MOVE;
      a.moveProgress[id] = 0.99;
    }
    stepAction(sim.state, sim.ctx, 0);
    expect([a.x[0], a.y[0], a.x[b], a.y[b]]).toEqual([x1, y1, x0, y0]);
    expect(oneByTile(sim)).toBe(true);
  });

  it('asks one who stands in the way to step aside, then walks on', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const b = another(sim, a.x[0], a.y[0] + 1);
    a.place(b, a.x[0] + 1, a.y[0]);
    a.action[b] = Action.IDLE;
    const [tx, ty] = [a.x[b], a.y[b]];
    a.path[0][0] = tx;
    a.path[0][1] = ty;
    a.pathLength[0] = 1;
    a.pathIndex[0] = 0;
    a.action[0] = Action.MOVE;
    a.moveProgress[0] = 1;
    for (let t = 0; t < balance.actions.waitTicks; t++) stepAction(sim.state, sim.ctx, 0);
    expect([a.x[0], a.y[0]]).toEqual([tx, ty]);
    expect([a.x[b], a.y[b]]).not.toEqual([tx, ty]);
    expect(oneByTile(sim)).toBe(true);
  });
});

describe('days and nights', () => {
  // Over five games, since v0.16 (decision 0029): those back late from fishing queue at the
  // single doors of the houses, and a few are still on their way to a free bed at midnight.
  it('sleeps at night: by midnight most are asleep, guards aside', () => {
    let awake = 0;
    let members = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const sim = new Simulation({ seed, balance });
      sim.step(20 * DAY + Math.round(0.8 * DAY));
      const a = sim.agents;
      const colony = sim.state.colonies[0];
      for (let id = 0; id < a.highWater; id++) {
        if (a.alive[id] !== 1 || colony.guards.includes(id)) continue;
        members++;
        if (a.asleep[id] === 0) awake++;
      }
    }
    expect(members).toBeGreaterThan(25);
    expect(awake / members).toBeLessThan(0.3);
  }, 60000);

  it('lets berries grow back only after three days', () => {
    const sim = new Simulation({ seed: 5, balance });
    const berries = sim.tables.resources.findIndex((r) => r.id === 'berries') + 1;
    sim.ctx.scheduleRegrowth(sim.state, 1, 1, berries);
    expect(sim.state.regrowth.at(-1).tick - sim.tick).toBe(3 * DAY);
  });

  it('keeps health only with regular meals', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    sim.state.tick = 5 * DAY;
    a.hunger[0] = 20;
    a.thirst[0] = 20;
    a.hp[0] = 50;
    // Fed this morning: it heals.
    a.mealTick[0] = sim.tick - DAY / 4;
    needsSystem(sim.state, sim.ctx);
    expect(a.hp[0]).toBeGreaterThan(50);
    // Two days without a meal: it weakens, although not starving yet.
    a.hp[0] = 50;
    a.hunger[0] = 20;
    a.mealTick[0] = sim.tick - 2 * DAY;
    needsSystem(sim.state, sim.ctx);
    expect(a.hp[0]).toBeLessThan(50);
  });
});

describe('trails', () => {
  it('wears a trail where feet pass often, faster to walk, for good', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const [x, y] = [a.x[0] + 1, a.y[0]];
    for (let k = 0; k < balance.trails.steps + 10; k++) sim.world.tread(x, y, balance.trails.steps);
    sim.world.packedAt(x, y);
    expect(sim.world.lastWear()).toBe(balance.trails.steps);
    const nav = sim.ctx.nav;
    nav.prepare(sim.world, a.x[0], a.y[0], 3);
    const speed = sim.ctx.biomeSpeed[sim.world.packedAt(x, y) & PACK.MASK];
    expect(nav.stepCost[nav.cellAt(x, y)]).toBeCloseTo(1 / (speed * balance.trails.speed));
    expect(sim.world.takeDirty().length).toBeGreaterThan(0);
  });
});
