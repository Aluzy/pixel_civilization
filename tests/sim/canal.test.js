import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { diggable, digCanal, planCanal, waterDistance, wetAt } from '../../src/sim/colony/canal.js';
import { ProjectKind } from '../../src/sim/colony/colony-store.js';
import { openTile } from '../../src/sim/colony/fortress.js';
import { CATALOG, Simulation } from '../../src/sim/simulation.js';
import { farmSystem } from '../../src/sim/systems/farm-system.js';
import { PACK } from '../../src/sim/world/chunk-store.js';

// Canals (decision 0027): a colony brings the water to its homes.

const DAY = balance.time.ticksPerDay;
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);

/**
 * A simulation whose colony has its camp on walkable ground 8 to 20 tiles from water.
 * @returns {{ sim: Simulation, x: number, y: number }}
 */
function dryCamp() {
  const sim = new Simulation({ seed: 5, balance });
  const a = sim.agents;
  for (let r = 0; r < 60; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = a.x[0] + dx;
      const y = a.y[0] + r;
      if (!diggable(sim.state, sim.ctx, x, y)) continue;
      const d = waterDistance(sim.state, sim.ctx, x, y, 20);
      if (d < 8 || d > 20) continue;
      sim.state.colonies[0].addShelter(x, y);
      sim.state.colonies[0].members = 12;
      return { sim, x, y };
    }
  }
  throw new Error('no dry camp');
}

/**
 * Digs the colony's whole canal with agent 0, from beside each tile.
 * @param {Simulation} sim
 * @returns {number} Tiles dug.
 */
function digAll(sim) {
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  const r = recipe('canal');
  a.recipes[0].learn(r, sim.tick, sim.ctx.recipeTau);
  const slot = colony.freeSlot();
  colony.projects[slot].kind = ProjectKind.CANAL;
  a.taskProject[0] = slot;
  a.taskBuild[0] = 1;
  a.craftRecipe[0] = r;
  const g = sim.tables.resources.findIndex((res) => res.id === 'stone') + 1;
  let dug = 0;
  while (colony.canalNext < colony.canalLen) {
    const x = colony.canalX[colony.canalNext];
    const y = colony.canalY[colony.canalNext];
    // Stand on a free walkable neighbour.
    let placed = false;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      const p = sim.world.packedAt(x + dx, y + dy);
      if (sim.ctx.biomeSpeed[p & PACK.MASK] <= 0 || sim.world.occupantAt(x + dx, y + dy) >= 0) {
        continue;
      }
      a.place(0, x + dx, y + dy);
      placed = true;
      break;
    }
    expect(placed).toBe(true);
    a.addCarried(0, g, 1);
    a.siteX[0] = x;
    a.siteY[0] = y;
    const last = colony.canalNext === colony.canalLen - 1;
    expect(digCanal(sim.state, sim.ctx, 0)).toBe(true);
    dug++;
    if (last) break;
  }
  return dug;
}

describe('canals', () => {
  it('traces a canal from the water to a camp that lacks it', () => {
    const { sim, x, y } = dryCamp();
    const colony = sim.state.colonies[0];
    expect(planCanal(sim.state, sim.ctx, colony)).toBe(true);
    expect(colony.canalLen).toBeGreaterThan(balance.canal.reach - 2);
    // From the water's edge to the camp, one step at a time, on ground that can be dug.
    const first = [colony.canalX[0], colony.canalY[0]];
    expect(waterDistance(sim.state, sim.ctx, first[0], first[1], 1)).toBe(1);
    const n = colony.canalLen;
    expect([colony.canalX[n - 1], colony.canalY[n - 1]]).toEqual([x, y]);
    for (let k = 0; k < n; k++) {
      expect(diggable(sim.state, sim.ctx, colony.canalX[k], colony.canalY[k])).toBe(true);
      if (k === 0) continue;
      const step =
        Math.abs(colony.canalX[k] - colony.canalX[k - 1]) +
        Math.abs(colony.canalY[k] - colony.canalY[k - 1]);
      expect(step).toBe(1);
    }
  });

  it('is dug from the water, each tile beside water, and brings it to the camp', () => {
    const { sim, x, y } = dryCamp();
    const colony = sim.state.colonies[0];
    planCanal(sim.state, sim.ctx, colony);
    // Not from the far end: water would not run there.
    const a = sim.agents;
    const n = colony.canalLen;
    a.recipes[0].learn(recipe('canal'), sim.tick, sim.ctx.recipeTau);
    a.craftRecipe[0] = recipe('canal');
    a.siteX[0] = colony.canalX[n - 1];
    a.siteY[0] = colony.canalY[n - 1];
    expect(digCanal(sim.state, sim.ctx, 0)).toBe(false);
    expect(digAll(sim)).toBe(n);
    expect(wetAt(sim.state, sim.ctx, x, y)).toBe(true);
    expect(waterDistance(sim.state, sim.ctx, x, y, 10)).toBe(0);
    expect(colony.canalTiles).toBe(n);
    // Done: the project is cleared and the event tells it.
    expect(colony.findProject(ProjectKind.CANAL)).toBe(-1);
    expect(sim.events.events.at(-1).subject & 15).toBe(ProjectKind.CANAL);
  });

  it('lets individuals wade through and drink beside it, not predators cross it', () => {
    const sim = new Simulation({ seed: 5, balance });
    const canal = sim.ctx.canalCode;
    expect(canal).toBeGreaterThan(0);
    expect(sim.ctx.blocksAgent[canal]).toBe(0);
    expect(sim.ctx.blocksPredator[canal]).toBe(1);
    expect(sim.ctx.structureSpeed[canal]).toBeLessThan(1);
    const a = sim.agents;
    sim.world.setStructure(a.x[0] + 1, a.y[0], canal);
    const nav = sim.ctx.nav;
    nav.prepare(sim.world, a.x[0], a.y[0], 3);
    expect(nav.besideWater(nav.center)).toBe(true);
    expect(nav.reachable(nav.cellAt(a.x[0] + 1, a.y[0]))).toBe(true);
  });

  it('waters the plots beside it by itself, and closes the ring of an enclosure', () => {
    const { sim } = dryCamp();
    const colony = sim.state.colonies[0];
    planCanal(sim.state, sim.ctx, colony);
    digAll(sim);
    const [cx, cy] = [colony.canalX[2], colony.canalY[2]];
    // A plot beside the canal.
    let px = 0;
    let py = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (sim.world.packedAt(cx + dx, cy + dy) >>> PACK.STRUCTURE_SHIFT !== 0) continue;
      if (wetAt(sim.state, sim.ctx, cx + dx, cy + dy)) continue;
      px = cx + dx;
      py = cy + dy;
      break;
    }
    const crop = 0;
    const plot = sim.state.crops.add(px, py, 0, crop);
    sim.world.setStructure(px, py, sim.ctx.plotCode);
    sim.state.tick = 10 * DAY;
    farmSystem(sim.state, sim.ctx);
    expect(sim.state.crops.watered[plot]).toBe(10);
    expect(openTile(sim.state, sim.ctx, cx, cy)).toBe(false);
  });
});
