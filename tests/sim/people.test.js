import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import resourceData from '../../data/resources.json' with { type: 'json' };
import vocationData from '../../data/vocations.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { AgentGrid } from '../../src/sim/agents/agent-grid.js';
import { Duty } from '../../src/sim/agents/commoner.js';
import { Tier } from '../../src/sim/agents/agent-store.js';
import { claimBed, figureQuota, releaseBed } from '../../src/sim/colony/people.js';
import { buildVocations, chooseVocation } from '../../src/sim/colony/vocation.js';
import { createRng } from '../../src/sim/core/rng.js';
import { Simulation } from '../../src/sim/simulation.js';
import { PACK } from '../../src/sim/world/chunk-store.js';
import { buildWorldTables } from '../../src/sim/world/world-data.js';
import { settleTowns } from '../../tools/towns.js';

// The people of a town (decision 0030, docs/design/19-grand-essor.md): the spatial index, the
// figures' quota, the beds, the town's map, the vocations, and a town of commoners that lives.

const DAY = balance.time.ticksPerDay;

/**
 * A town of `people` laid out beside water.
 * @param {number} seed
 * @param {number} people
 * @returns {Simulation}
 */
function town(seed, people) {
  const sim = new Simulation({ seed, balance });
  settleTowns(sim, { towns: 1, people, days: 4, spacing: 150 });
  return sim;
}

describe('agent grid', () => {
  it('finds the agents of a box in id order, as a scan of every agent would', () => {
    const n = 400;
    const grid = new AgentGrid(n);
    const xs = new Int32Array(n);
    const ys = new Int32Array(n);
    const alive = new Uint8Array(n);
    const rng = createRng(7);
    for (let id = 0; id < n; id++) {
      xs[id] = Math.floor(rng.next() * 200) - 100;
      ys[id] = Math.floor(rng.next() * 200) - 100;
      alive[id] = 1;
      grid.insert(id, xs[id], ys[id]);
    }
    for (let round = 0; round < 50; round++) {
      // Some move, some die.
      for (let k = 0; k < 20; k++) {
        const id = Math.floor(rng.next() * n);
        if (!alive[id]) continue;
        if (rng.next() < 0.2) {
          alive[id] = 0;
          grid.remove(id);
          continue;
        }
        xs[id] += Math.floor(rng.next() * 41) - 20;
        ys[id] += Math.floor(rng.next() * 41) - 20;
        grid.move(id, xs[id], ys[id]);
      }
      const x0 = Math.floor(rng.next() * 160) - 100;
      const y0 = Math.floor(rng.next() * 160) - 100;
      const r = 1 + Math.floor(rng.next() * 30);
      const count = grid.query(xs, ys, x0, y0, x0 + r, y0 + r);
      const expected = [];
      for (let id = 0; id < n; id++) {
        if (alive[id] && xs[id] >= x0 && xs[id] <= x0 + r && ys[id] >= y0 && ys[id] <= y0 + r) {
          expected.push(id);
        }
      }
      expect([...grid.found.subarray(0, count)]).toEqual(expected);
    }
  });
});

describe('figures and the people', () => {
  it('keeps every member a figure while the colony is small, then a share', () => {
    const sim = new Simulation({ seed: 1, balance });
    const colony = sim.state.colonies[0];
    const p = balance.people;
    colony.members = p.commonFrom - 1;
    expect(figureQuota(sim.ctx, colony)).toBe(p.commonFrom - 1);
    colony.members = 1000;
    expect(figureQuota(sim.ctx, colony)).toBe(p.figures + Math.floor(1000 * p.figureShare));
  });

  it('gives each commoner a bed of its own and takes it back', () => {
    const sim = town(3, 60);
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const owners = new Set();
    for (let id = 0; id < a.highWater; id++) {
      if (!a.alive[id] || a.tier[id] !== Tier.COMMONER) continue;
      const k = claimBed(colony, a, id);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(owners.has(k)).toBe(false);
      owners.add(k);
      expect(claimBed(colony, a, id)).toBe(k);
    }
    const first = [...owners][0];
    const owner = colony.bedOwner[first];
    releaseBed(sim.state, a, owner);
    expect(colony.bedOwner[first]).toBe(-1);
    expect(a.bed[owner]).toBe(-1);
  });
});

describe('town map', () => {
  it('leads from the camp to water and back along passable tiles', () => {
    const sim = town(3, 60);
    sim.step(1);
    const colony = sim.state.colonies[0];
    const map = colony.map;
    expect(map).not.toBeNull();
    const out = new Int32Array(512);
    const n = map.pathToWater(colony.campX, colony.campY, out);
    expect(n).toBeGreaterThanOrEqual(0);
    const water = sim.ctx.waterBiome;
    let x = colony.campX;
    let y = colony.campY;
    for (let k = 0; k < n; k++) {
      const nx = out[k * 2];
      const ny = out[k * 2 + 1];
      expect(Math.max(Math.abs(nx - x), Math.abs(ny - y))).toBe(1);
      expect(sim.ctx.biomeSpeed[sim.world.packedAt(nx, ny) & PACK.MASK]).toBeGreaterThan(0);
      x = nx;
      y = ny;
    }
    // The way ends beside water (or at a well).
    let wet = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const p = sim.world.packedAt(x + dx, y + dy);
        const s = p >>> PACK.STRUCTURE_SHIFT;
        if ((p & PACK.MASK) === water || (s !== 0 && s === sim.ctx.wellCode)) wet = true;
      }
    }
    expect(wet).toBe(true);
    // A way between two points of the map (a bed and the camp) joins them step by step.
    const steps = map.path(colony.bedX[0], colony.bedY[0], colony.campX, colony.campY, out);
    expect(steps).toBeGreaterThan(0);
    x = colony.bedX[0];
    y = colony.bedY[0];
    for (let k = 0; k < steps; k++) {
      expect(Math.max(Math.abs(out[k * 2] - x), Math.abs(out[k * 2 + 1] - y))).toBe(1);
      x = out[k * 2];
      y = out[k * 2 + 1];
    }
    expect([x, y]).toEqual([colony.campX, colony.campY]);
  });
});

describe('vocations', () => {
  it('sends the next town where the colony lacks most, fewer towns of a kind breaking ties', () => {
    const tables = buildWorldTables(worldData, resourceData);
    const vocations = buildVocations(vocationData, tables);
    expect(vocations.map((v) => v.id)).toEqual(['farm', 'stone', 'fish', 'wood']);
    const sim = new Simulation({ seed: 1, balance });
    const colony = sim.state.colonies[0];
    const stone = tables.resources.findIndex((r) => r.id === 'stone') + 1;
    colony.price.set(sim.ctx.basePrices);
    colony.price[stone] = sim.ctx.basePrices[stone] * 3;
    expect(vocations[chooseVocation(sim.state, sim.ctx, colony)].id).toBe('stone');
  });
});

describe('a town of the people', () => {
  it('lives through its days: it drinks, eats, sleeps at night and works', () => {
    const sim = town(3, 250);
    const a = sim.agents;
    const start = a.aliveCount;
    expect(start).toBeGreaterThan(200);
    expect(a.figureCount).toBeLessThan(start / 5);
    const seen = new Set();
    let asleepAtNight = 0;
    let commonersAtNight = 0;
    for (let h = 0; h < 12; h++) {
      sim.step(DAY / 4);
      for (let id = 0; id < a.highWater; id++) {
        if (a.alive[id] && a.tier[id] === Tier.COMMONER) seen.add(a.duty[id]);
      }
      // Three quarters into the day: night.
      if (h % 4 === 2) {
        for (let id = 0; id < a.highWater; id++) {
          if (!a.alive[id] || a.tier[id] !== Tier.COMMONER) continue;
          commonersAtNight++;
          if (a.asleep[id]) asleepAtNight++;
        }
      }
    }
    // Few die (old age is spread over the ages), births make up for them.
    expect(a.aliveCount).toBeGreaterThan(start * 0.9);
    expect(seen.has(Duty.DRINK)).toBe(true);
    expect(seen.has(Duty.EAT)).toBe(true);
    expect(seen.has(Duty.WORK)).toBe(true);
    expect(asleepAtNight / commonersAtNight).toBeGreaterThan(0.4);
  }, 60000);

  it('is deterministic: the same seed gives the same town', () => {
    const one = town(5, 120);
    const two = town(5, 120);
    one.step(DAY);
    two.step(DAY);
    expect(one.hash()).toBe(two.hash());
  }, 60000);
});
