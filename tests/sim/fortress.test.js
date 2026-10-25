import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Navigator } from '../../src/sim/agents/navigation.js';
import { Colony, Enclosure, ProjectKind } from '../../src/sim/colony/colony-store.js';
import { onBuilt } from '../../src/sim/colony/colony-logic.js';
import {
  buildSegment,
  countOpen,
  planEnclosure,
  treasureValue,
  updateDanger,
  wantsEnclosure,
} from '../../src/sim/colony/fortress.js';
import { EventType } from '../../src/sim/core/events.js';
import { CATALOG, Simulation } from '../../src/sim/simulation.js';
import { colonySystem } from '../../src/sim/systems/colony-system.js';
import { threatSystem } from '../../src/sim/systems/threat-system.js';
import { PACK } from '../../src/sim/world/chunk-store.js';

const DAY = balance.time.ticksPerDay;
const F = balance.fortress;
const code = (kind) => CATALOG.structures.find((s) => s.kind === kind).code;
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
const WALL = code('wall');
const GATE = code('gate');

// Biomes of the fake worlds: 0 = land, 1 = water. Structures: "#" wall (1), "G" gate (2).
const SPEED = Float64Array.from([1, 0]);
const BLOCKS = Uint8Array.from([0, 1, 0]);

/**
 * Fake world from ASCII rows; outside the drawing is land.
 * @param {string[]} rows
 * @returns {{ packedAt: (x: number, y: number) => number }}
 */
function worldFrom(rows) {
  return {
    packedAt(x, y) {
      const ch = rows[y]?.[x] ?? '.';
      if (ch === '~') return 1;
      if (ch === '#') return 1 << 24;
      if (ch === 'G') return 2 << 24;
      return 0;
    },
  };
}

/**
 * A colony whose enclosure is the ring (x0, y0)–(x1, y1), its gate at (gx, gy).
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} gx
 * @param {number} gy
 * @returns {Colony}
 */
function walled(x0, y0, x1, y1, gx, gy) {
  const c = new Colony(0, 4, balance.colony);
  c.encState = Enclosure.CLOSED;
  Object.assign(c, { encX0: x0, encY0: y0, encX1: x1, encY1: y1 });
  c.gateX[0] = gx;
  c.gateY[0] = gy;
  c.gateCount = 1;
  c.gatesBuilt = 1;
  c.gateBuilt = true;
  return c;
}

/**
 * A simulation whose first agent stands in its camp, beside its treasure room.
 * @returns {Simulation}
 */
function treasureCamp() {
  const sim = new Simulation({ seed: 5, balance });
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  const [x, y] = [a.x[0], a.y[0]];
  colony.addShelter(x, y);
  sim.world.setStructure(x, y, code('shelter'));
  colony.members = 40;
  colony.hasTreasure = true;
  colony.treasureX = x;
  colony.treasureY = y + 1;
  sim.world.setStructure(x, y + 1, code('treasury'));
  return sim;
}

/**
 * Every open tile of the ring is walled (the gate becomes a gate), but one.
 * @param {Simulation} sim
 * @param {Colony} colony
 * @returns {number[]} The tile left open.
 */
function wallAllButOne(sim, colony) {
  let left = null;
  for (let y = colony.encY0; y <= colony.encY1; y++) {
    for (let x = colony.encX0; x <= colony.encX1; x++) {
      if (!colony.onRing(x, y)) continue;
      if ((sim.world.packedAt(x, y) & PACK.MASK) === sim.ctx.waterBiome) continue;
      if (colony.gateAt(x, y) >= 0) {
        sim.world.setStructure(x, y, GATE);
      } else if (left === null) {
        left = [x, y];
      } else {
        sim.world.setStructure(x, y, WALL);
      }
    }
  }
  colony.gatesBuilt = (1 << colony.gateCount) - 1;
  colony.gateBuilt = true;
  colony.encOpen = countOpen(sim.state, sim.ctx, colony);
  return left;
}

describe('walls and gates', () => {
  it('walls stop the local search; a gate lets agents through', () => {
    const world = worldFrom([
      '...............', //
      '###############',
      '...............',
    ]);
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: 1, blocks: BLOCKS });
    nav.prepare(world, 7, 0, 4);
    expect(nav.reachable(nav.cellAt(7, 2))).toBe(false);
    const gated = worldFrom([
      '...............', //
      '#######G#######',
      '...............',
    ]);
    nav.prepare(gated, 5, 0, 4);
    expect(nav.reachable(nav.cellAt(9, 2))).toBe(true);
    expect(nav.reachable(nav.cellAt(5, 1))).toBe(false);
  });

  it('crosses a wall longer than its sight through the gate, by the corner if need be', () => {
    // A ring (0, 0)–(40, 20), its gate in the middle of the south side.
    const c = walled(0, 0, 40, 20, 20, 20);
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: 1, blocks: BLOCKS });
    nav.colonies = [c];
    const world = worldFrom([]);
    // Inside, going out: to the tile just beyond the gate.
    nav.prepare(world, 5, 5, 3);
    nav.detour(5, -30);
    expect([nav.wayX, nav.wayY]).toEqual([20, 21]);
    // Outside in front of the gate, going in: to the tile just inside the gate.
    nav.prepare(world, 30, 25, 3);
    nav.detour(10, 10);
    expect([nav.wayX, nav.wayY]).toEqual([20, 19]);
    // Outside behind the enclosure: first to the nearest corner, then down the side.
    nav.prepare(world, 8, -3, 3);
    nav.detour(10, 10);
    expect([nav.wayX, nav.wayY]).toEqual([-1, -1]);
    nav.prepare(world, -1, -1, 3);
    nav.detour(10, 10);
    expect([nav.wayX, nav.wayY]).toEqual([-1, 21]);
    // Outside, a target across it: around by the nearest corner.
    nav.prepare(world, 35, -5, 3);
    nav.detour(30, 40);
    expect([nav.wayX, nav.wayY]).toEqual([41, -1]);
    // Nothing in the way: the target itself.
    nav.prepare(world, 50, 5, 3);
    nav.detour(60, 5);
    expect([nav.wayX, nav.wayY]).toEqual([60, 5]);
  });

  it('goes through the gate that makes the shortest trip', () => {
    const c = walled(0, 0, 40, 20, 20, 20);
    c.gateX[1] = 40;
    c.gateY[1] = 10;
    c.gateCount = 2;
    c.gatesBuilt = 3;
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: 1, blocks: BLOCKS });
    nav.colonies = [c];
    const world = worldFrom([]);
    // Inside, near the east side, going east: by the east gate.
    nav.prepare(world, 35, 8, 3);
    nav.detour(70, 10);
    expect([nav.wayX, nav.wayY]).toEqual([41, 10]);
    // Outside to the east, going in: by the east gate, the side it stands before.
    nav.prepare(world, 50, 2, 3);
    nav.detour(25, 15);
    expect([nav.wayX, nav.wayY]).toEqual([39, 10]);
  });

  it('keeps the ring free of new buildings', () => {
    const c = walled(0, 0, 10, 10, 5, 10);
    c.encState = Enclosure.BUILDING;
    const nav = new Navigator({ biomeSpeed: SPEED, waterBiome: 1, blocks: BLOCKS });
    nav.colonies = [c];
    nav.prepare(worldFrom([]), 3, 3, 4);
    expect(nav.buildable(nav.cellAt(3, 0))).toBe(false);
    expect(nav.buildable(nav.cellAt(3, 1))).toBe(true);
  });
});

describe('treasure and enclosure', () => {
  it('a treasure room built at the camp holds the colony treasure', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.addShelter(a.x[0], a.y[0]);
    a.colony[0] = 0;
    onBuilt(sim.state, sim.ctx, 0, code('treasury'), a.x[0] + 2, a.y[0]);
    expect([colony.hasTreasure, colony.treasureX]).toEqual([true, a.x[0] + 2]);
    const gold = sim.tables.resources.findIndex((r) => r.id === 'gold') + 1;
    colony.treasury = 100;
    colony.stock[gold] = 3;
    expect(treasureValue(sim.ctx, colony)).toBe(100 + 3 * colony.price[gold]);
  });

  it('a colony attacked day after day decides to wall its treasure in', () => {
    const sim = treasureCamp();
    const colony = sim.state.colonies[0];
    expect(wantsEnclosure(sim.ctx, colony)).toBe(false);
    for (let d = 1; d <= 4; d++) {
      sim.state.tick = d * DAY;
      colony.lastThreat = sim.state.tick - 10;
      updateDanger(sim.state, sim.ctx, colony);
    }
    expect(colony.danger).toBeGreaterThanOrEqual(F.dangerLevel);
    expect(wantsEnclosure(sim.ctx, colony)).toBe(true);
    // The colony system opens the project: the gate first.
    colony.campX = sim.agents.x[0];
    colony.campY = sim.agents.y[0];
    sim.state.tick = 5 * DAY;
    colony.lastThreat = sim.state.tick - 10;
    colonySystem(sim.state, sim.ctx);
    expect(colony.encState).toBe(Enclosure.BUILDING);
    const p = colony.projects[colony.findProject(ProjectKind.ENCLOSURE)];
    expect(p.recipe).toBe(recipe('gate'));
    expect(sim.events.events.some((e) => e.type === EventType.ENCLOSURE_PLANNED)).toBe(true);
  });

  it('draws a ring one tile beyond its buildings, the gate on it', () => {
    const sim = treasureCamp();
    const colony = sim.state.colonies[0];
    const [x, y] = [sim.agents.x[0], sim.agents.y[0]];
    expect(planEnclosure(sim.state, sim.ctx, colony)).toBe(true);
    expect([colony.encX0, colony.encY0, colony.encX1, colony.encY1]).toEqual([
      x - 1,
      y - 1,
      x + 1,
      y + 2,
    ]);
    expect(colony.encTotal).toBe(10);
    expect(colony.gateCount).toBeGreaterThan(0);
    for (let i = 0; i < colony.gateCount; i++) {
      expect(colony.onRing(colony.gateX[i], colony.gateY[i])).toBe(true);
    }
    // The tower stands beside a gate, on the ring.
    expect(colony.onRing(colony.towerX, colony.towerY)).toBe(true);
    const fromGate = Math.max(
      Math.abs(colony.towerX - colony.gateX[0]),
      Math.abs(colony.towerY - colony.gateY[0]),
    );
    expect(fromGate).toBe(1);
    expect(colony.inside(colony.treasureX, colony.treasureY)).toBe(true);
    expect(colony.inside(x, y)).toBe(true);
  });

  it('a builder lays the gate then the wall from beside it; the last one waits for the predator to leave', () => {
    const sim = treasureCamp();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    planEnclosure(sim.state, sim.ctx, colony);
    const wood = sim.tables.resources.findIndex((r) => r.id === 'wood') + 1;
    const clay = sim.tables.resources.findIndex((r) => r.id === 'clay') + 1;
    a.colony[0] = 0;
    a.recipes[0].learn(recipe('gate'), 0, sim.ctx.recipeTau);
    a.recipes[0].learn(recipe('palisade'), 0, sim.ctx.recipeTau);
    a.addCarried(0, wood, 20);
    a.addCarried(0, clay, 2);
    // The gate, from the tile inside it.
    a.craftRecipe[0] = recipe('gate');
    const [gx, gy] = [colony.gateX[0], colony.gateY[0]];
    a.siteX[0] = gx;
    a.siteY[0] = gy;
    a.x[0] = gx + (gx === colony.encX0 ? 1 : gx === colony.encX1 ? -1 : 0);
    a.y[0] = gy + (gy === colony.encY0 ? 1 : gy === colony.encY1 ? -1 : 0);
    expect(buildSegment(sim.state, sim.ctx, 0)).toBe(true);
    expect(colony.gatesBuilt & 1).toBe(1);
    expect(sim.world.packedAt(gx, gy) >>> PACK.STRUCTURE_SHIFT).toBe(GATE);
    // A wall cannot take the place of a gate.
    a.craftRecipe[0] = recipe('palisade');
    expect(buildSegment(sim.state, sim.ctx, 0)).toBe(false);
    // All but one tile walled; a predator inside: the last one waits.
    const [lx, ly] = wallAllButOne(sim, colony);
    expect(colony.encOpen).toBe(1);
    a.craftRecipe[0] = recipe('palisade');
    a.siteX[0] = lx;
    a.siteY[0] = ly;
    a.x[0] = lx < colony.encX1 ? lx + 1 : lx - 1;
    a.y[0] = ly;
    if (colony.onRing(a.x[0], a.y[0]) || a.x[0] === lx)
      a.y[0] = ly < colony.encY1 ? ly + 1 : ly - 1;
    // Standing on the tile: it cannot build there.
    const [sx, sy] = [a.x[0], a.y[0]];
    a.x[0] = lx;
    a.y[0] = ly;
    expect(buildSegment(sim.state, sim.ctx, 0)).toBe(false);
    a.x[0] = sx;
    a.y[0] = sy;
    const t = sim.state.threats;
    const p = t.spawn(colony.treasureX, colony.treasureY, balance.threats.hp);
    expect(buildSegment(sim.state, sim.ctx, 0)).toBe(false);
    t.remove(p);
    expect(buildSegment(sim.state, sim.ctx, 0)).toBe(true);
    expect(colony.encState).toBe(Enclosure.CLOSED);
    expect(sim.events.events.at(-1).type).toBe(EventType.ENCLOSURE_CLOSED);
  });

  it('predators do not get through a closed enclosure', () => {
    const sim = treasureCamp();
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    planEnclosure(sim.state, sim.ctx, colony);
    const [lx, ly] = wallAllButOne(sim, colony);
    sim.world.setStructure(lx, ly, WALL);
    colony.encOpen = 0;
    colony.encState = Enclosure.CLOSED;
    // Night: a pack-sized group of predators right outside the wall, the agent asleep inside.
    sim.state.tick = 3 * DAY + Math.round(0.75 * DAY);
    sim.ctx.phase = sim.ctx.nightPhase;
    a.asleep[0] = 1;
    const t = sim.state.threats;
    for (let k = 0; k < 4; k++) t.spawn(colony.encX0 - 2, colony.encY0 + k, balance.threats.hp);
    const hp = a.hp[0];
    for (let i = 0; i < 2000; i++) {
      sim.state.tick++;
      threatSystem(sim.state, sim.ctx);
      for (let q = 0; q < t.highWater; q++) {
        if (t.alive[q] === 1) expect(colony.inside(t.x[q], t.y[q])).toBe(false);
      }
    }
    expect(colony.breaches).toBe(0);
    expect(a.hp[0]).toBe(hp);
  });
});
