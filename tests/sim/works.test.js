import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Enclosure, ProjectKind } from '../../src/sim/colony/colony-store.js';
import { openTile } from '../../src/sim/colony/fortress.js';
import { raiseHouse, registerHouse, houseDir } from '../../src/sim/colony/house.js';
import {
  beauty,
  exhausted,
  freeLand,
  layTile,
  nextTile,
  worksProject,
  WORKS_RECIPE,
} from '../../src/sim/colony/works.js';
import { Component } from '../../src/sim/colony/harmony.js';
import { CATALOG, Simulation } from '../../src/sim/simulation.js';
import { PACK } from '../../src/sim/world/chunk-store.js';

// Architecture (decision 0028): works of tiles laid one by one, the town they make, its beauty.

const DAY = balance.time.ticksPerDay;
const code = (id) => CATALOG.structures.find((s) => s.id === id).code;

/**
 * A colony of 40, well and fed, its camp on open ground near the first agent.
 * @returns {Simulation}
 */
function town() {
  const sim = new Simulation({ seed: 5, balance });
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  // A camp with open ground around it.
  for (let r = 0; r < 40; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = a.x[0] + dx;
      const y = a.y[0] + r;
      let open = true;
      for (let dy = -3; dy <= 3 && open; dy++) {
        for (let ex = -3; ex <= 3 && open; ex++)
          open = freeLand(sim.state, sim.ctx, x + ex, y + dy);
      }
      if (!open) continue;
      colony.addShelter(x, y);
      colony.members = 40;
      const food = sim.tables.resources.findIndex((res) => res.id === 'berries') + 1;
      colony.stock[food] = 1000;
      colony.harmony[1 + Component.STABILITY] = 1;
      colony.harmony[1 + Component.WELLBEING] = 1;
      colony.focus = Component.BEAUTY;
      sim.state.tick = 10 * DAY;
      return sim;
    }
  }
  throw new Error('no open ground');
}

/**
 * Lays every tile of the colony's work with agent 0, standing beside each, materials given.
 * @param {Simulation} sim
 * @returns {number} Tiles laid.
 */
function layAll(sim) {
  const a = sim.agents;
  const colony = sim.state.colonies[0];
  const slot = colony.findProject(ProjectKind.WORKS);
  const p = colony.projects[slot];
  a.taskProject[0] = slot;
  a.taskBuild[0] = 1;
  a.craftRecipe[0] = WORKS_RECIPE;
  let laid = 0;
  const out = new Int32Array(2);
  for (let guard = 0; guard < 300 && nextTile(sim.state, sim.ctx, p, out); guard++) {
    const [x, y] = out;
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
      const q = sim.world.packedAt(x + dx, y + dy);
      if (sim.ctx.biomeSpeed[q & PACK.MASK] <= 0) continue;
      if (sim.world.lastOccupant() >= 0 && sim.world.lastOccupant() !== 0) continue;
      if (sim.ctx.blocksAgent[q >>> PACK.STRUCTURE_SHIFT] === 1) continue;
      a.place(0, x + dx, y + dy);
      break;
    }
    for (let g = 1; g < sim.ctx.catalog.goodCount; g++) a.addCarried(0, g, 5);
    a.siteX[0] = x;
    a.siteY[0] = y;
    if (layTile(sim.state, sim.ctx, 0)) laid++;
    else p.tileNext++;
    if (colony.findProject(ProjectKind.WORKS) < 0) break;
  }
  return laid;
}

describe('works of architecture', () => {
  it('paves a square round the camp, then streets along its four axes', () => {
    const sim = town();
    const colony = sim.state.colonies[0];
    expect(beauty(sim.state, sim.ctx, colony)).toBe(0);
    worksProject(sim.state, sim.ctx, colony);
    const slot = colony.findProject(ProjectKind.WORKS);
    expect(sim.ctx.works.works[colony.projects[slot].work].id).toBe('plaza');
    expect(layAll(sim)).toBeGreaterThan(20);
    const pave = code('pavement');
    expect(sim.world.packedAt(colony.campX + 2, colony.campY - 2) >>> PACK.STRUCTURE_SHIFT).toBe(
      pave,
    );
    expect(beauty(sim.state, sim.ctx, colony)).toBeGreaterThan(0);
    // Done once: the streets come next.
    sim.state.tick += DAY;
    worksProject(sim.state, sim.ctx, colony);
    const next = colony.projects[colony.findProject(ProjectKind.WORKS)];
    expect(sim.ctx.works.works[next.work].id).toBe('streets');
    layAll(sim);
    expect(sim.world.packedAt(colony.campX, colony.campY + 6) >>> PACK.STRUCTURE_SHIFT).toBe(pave);
    expect(sim.ctx.structureSpeed[pave]).toBeGreaterThan(1);
  });

  it('opens no work while the colony is hungry or unsettled', () => {
    const sim = town();
    const colony = sim.state.colonies[0];
    colony.stock.fill(0);
    worksProject(sim.state, sim.ctx, colony);
    expect(colony.findProject(ProjectKind.WORKS)).toBe(-1);
  });

  it('raises a public building, its centre first, and rebuilds a house in stone', () => {
    const sim = town();
    const colony = sim.state.colonies[0];
    colony.worksDone = 0b11; // Square and streets done.
    worksProject(sim.state, sim.ctx, colony);
    const p = colony.projects[colony.findProject(ProjectKind.WORKS)];
    expect(sim.ctx.works.works[p.work].id).toBe('temple');
    expect([p.tileX[0], p.tileY[0]]).toEqual([colony.campX + 4, colony.campY - 4]);
    layAll(sim);
    const temple = code('temple');
    expect(sim.world.packedAt(colony.campX + 4, colony.campY - 4) >>> PACK.STRUCTURE_SHIFT).toBe(
      temple,
    );
    expect(sim.ctx.blocksPredator[temple]).toBe(1);
    // A wooden house rebuilt in stone: walls only, door and beds kept.
    const ctx = sim.ctx;
    let door = null;
    for (let r = 7; r < 20 && !door; r++) {
      const x = colony.campX + r;
      const dir = houseDir(sim.state, ctx, x, colony.campY + 3, null);
      if (dir < 0) continue;
      raiseHouse(sim.state, ctx, x, colony.campY + 3, dir);
      registerHouse(ctx, colony, x, colony.campY + 3);
      door = [x, colony.campY + 3];
    }
    colony.worksDone = (1 << 6) - 1; // Everything before the stone houses.
    colony.lastWork = -1e9;
    sim.state.tick += DAY;
    worksProject(sim.state, ctx, colony);
    const q = colony.projects[colony.findProject(ProjectKind.WORKS)];
    expect(ctx.works.works[q.work].id).toBe('stone_house');
    expect(q.tileLen).toBe(9);
    layAll(sim);
    expect(sim.world.packedAt(door[0], door[1]) >>> PACK.STRUCTURE_SHIFT).toBe(ctx.houseDoorCode);
    expect(ctx.blocksAgent[code('house_wall_stone')]).toBe(1);
  });

  it('keeps a ring of stone closed', () => {
    const sim = town();
    expect(sim.ctx.ringWall[code('stone_wall')]).toBe(1);
    const colony = sim.state.colonies[0];
    colony.encState = Enclosure.CLOSED;
    sim.world.setStructure(colony.campX + 9, colony.campY, code('stone_wall'));
    expect(openTile(sim.state, sim.ctx, colony.campX + 9, colony.campY)).toBe(false);
  });

  it('clears the forest it fells near the colony, and leaves quarries in the hills', () => {
    const sim = town();
    const ctx = sim.ctx;
    const colony = sim.state.colonies[0];
    const [x, y] = [colony.campX + 6, colony.campY + 6];
    sim.world.setBiome(x, y, ctx.forestBiome);
    expect(exhausted(sim.state, ctx, 0, x, y, ctx.woodResource)).toBe(true);
    expect(sim.world.packedAt(x, y) & PACK.MASK).toBe(ctx.plainBiome);
    const mountain = sim.tables.biomes.findIndex((b) => b.id === 'mountain');
    const stone = sim.tables.resources.findIndex((r) => r.id === 'stone') + 1;
    sim.world.setBiome(x + 1, y, mountain);
    expect(exhausted(sim.state, ctx, 0, x + 1, y, stone)).toBe(false);
    expect(sim.world.packedAt(x + 1, y) >>> PACK.STRUCTURE_SHIFT).toBe(ctx.quarryCode);
  });
});
