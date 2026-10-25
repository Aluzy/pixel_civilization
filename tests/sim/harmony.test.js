import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import genomeData from '../../data/genome.json' with { type: 'json' };
import {
  avoids,
  dangerAt,
  noteAttack,
  noteDelivery,
  notePass,
} from '../../src/sim/agents/experience.js';
import { ProjectKind } from '../../src/sim/colony/colony-store.js';
import { fieldResource, openField, plant } from '../../src/sim/colony/field.js';
import { COMPONENT_IDS, compactness, computeHarmony } from '../../src/sim/colony/harmony.js';
import { History, geneStats } from '../../src/sim/colony/history.js';
import { createRng } from '../../src/sim/core/rng.js';
import {
  buildGeneTable,
  founder,
  goalWeights,
  inherit,
  normal,
} from '../../src/sim/genome/genome.js';
import { GENE_TABLE, GOAL_TABLE, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';

const DAY = balance.time.ticksPerDay;
const berries = WORLD_TABLES.resources.findIndex((r) => r.id === 'berries') + 1;

describe('genome', () => {
  it('reads the genes from data and checks their goals', () => {
    const table = buildGeneTable(genomeData, GOAL_TABLE);
    expect(table.genes.length).toBe(genomeData.genes.length);
    expect(table.index.curiosity).toBeGreaterThanOrEqual(0);
    const bad = { genes: [{ id: 'x', name: 'x', range: [0, 1], start: 0.5, goals: ['nope'] }] };
    expect(() => buildGeneTable(bad, GOAL_TABLE)).toThrow(/unknown goal/);
  });

  it('draws normal numbers with additions only', () => {
    const rng = createRng(4);
    let sum = 0;
    let sq = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const v = normal(rng);
      sum += v;
      sq += v * v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.06);
    expect(Math.abs(Math.sqrt(sq / n) - 1)).toBeLessThan(0.06);
  });

  it('leaves a founder neutral and mutates a child within the ranges', () => {
    const n = GENE_TABLE.genes.length;
    const genes = new Float64Array(3 * n);
    founder(GENE_TABLE, genes, 0);
    const weights = new Float64Array(GOAL_TABLE.goals.length);
    goalWeights(GENE_TABLE, genes, 0, weights);
    expect([...weights].every((w) => w === 1)).toBe(true);
    const rng = createRng(9);
    inherit(GENE_TABLE, genes, 0, 1, 0.5, rng);
    let changed = 0;
    GENE_TABLE.genes.forEach((g, k) => {
      const v = genes[n + k];
      expect(v).toBeGreaterThanOrEqual(g.min);
      expect(v).toBeLessThanOrEqual(g.max);
      if (v !== g.start) changed++;
    });
    expect(changed).toBe(n);
    // The same draws give the same child.
    inherit(GENE_TABLE, genes, 0, 2, 0.5, createRng(9));
    expect([...genes.subarray(2 * n)]).toEqual([...genes.subarray(n, 2 * n)]);
  });

  it('passes genes on at replication', () => {
    const sim = new Simulation({ seed: 3, balance });
    sim.step(30 * DAY);
    const a = sim.agents;
    const n = a.geneCount;
    let mutated = 0;
    for (let id = 0; id < a.highWater; id++) {
      if (a.alive[id] !== 1 || a.generation[id] === 0) continue;
      for (let k = 0; k < n; k++) if (a.genes[id * n + k] !== GENE_TABLE.genes[k].start) mutated++;
    }
    expect(mutated).toBeGreaterThan(0);
  }, 60000);
});

describe('harmony', () => {
  it('measures the compactness of buildings', () => {
    const order = new Int32Array(64);
    const block = { x: [], y: [] };
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) (block.x.push(x), block.y.push(y));
    expect(compactness(Int32Array.from(block.x), Int32Array.from(block.y), 9, order)).toBe(1);
    const corners = [0, 10, 0, 10];
    const cy = [0, 0, 10, 10];
    const sparse = compactness(Int32Array.from(corners), Int32Array.from(cy), 4, order);
    expect(sparse).toBeLessThan(0.05);
  });

  it('scores a colony between 0 and 100, with its weakest component as focus', () => {
    const sim = new Simulation({ seed: 3, balance });
    sim.step(20 * DAY);
    const colony = sim.state.colonies[0];
    const h = colony.harmony;
    expect(h[0]).toBeGreaterThan(0);
    expect(h[0]).toBeLessThanOrEqual(100);
    let weakest = 0;
    for (let k = 0; k < COMPONENT_IDS.length; k++) {
      expect(h[1 + k]).toBeGreaterThanOrEqual(0);
      expect(h[1 + k]).toBeLessThanOrEqual(1);
      if (h[1 + k] < h[1 + weakest]) weakest = k;
    }
    expect(colony.focus).toBe(weakest);
    const rows = sim.state.history.rows();
    expect(rows.length).toBe(20);
    expect(rows.at(-1).population).toBe(sim.agents.aliveCount);
  }, 60000);

  it('counts a famine against stability, if enough members starve', () => {
    const sim = new Simulation({ seed: 3, balance });
    sim.step(12 * DAY);
    const colony = sim.state.colonies[0];
    colony.members = 100;
    colony.popHistory.fill(100);
    // One death of hunger in a hundred is a misfortune; three are a famine.
    colony.starvedDays.fill(0);
    colony.starvedToday = 1;
    computeHarmony(sim.state, sim.ctx, colony);
    expect(colony.harmony[1]).toBeGreaterThan(0);
    colony.starvedToday = 2;
    computeHarmony(sim.state, sim.ctx, colony);
    expect(colony.harmony[1]).toBe(0);
  }, 60000);

  it('keeps a daily history with the genes', () => {
    const history = new History(3, 2);
    const harmony = Float64Array.of(50, 0.1, 0.2, 0.3, 0.4, 0.5);
    for (let d = 1; d <= 4; d++) {
      history.record(d * DAY, harmony, d, Float64Array.of(d, 1), Float64Array.of(0, 0));
    }
    const rows = history.rows();
    expect(rows.map((r) => r.population)).toEqual([2, 3, 4]);
    expect(history.rows(3).map((r) => r.population)).toEqual([4]);
    expect(rows[0].components).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    const sim = new Simulation({ seed: 1, balance });
    const mean = new Float64Array(GENE_TABLE.genes.length);
    const spread = new Float64Array(GENE_TABLE.genes.length);
    expect(geneStats(sim.agents, mean, spread)).toBe(1);
    expect(mean[0]).toBe(GENE_TABLE.genes[0].start);
  });
});

describe('fields', () => {
  it('plants the over-harvested resource near the camp', () => {
    const sim = new Simulation({ seed: 5, balance });
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    colony.addShelter(a.x[0], a.y[0]);
    colony.harvested[berries] = 30;
    expect(fieldResource(sim.ctx, colony)).toBe(berries);
    openField(colony, 1, berries, balance.harmony.fieldUnits, sim.tick);
    a.taskProject[0] = 1;
    a.taskBuild[0] = 1;
    a.addCarried(0, berries, balance.harmony.fieldUnits, sim.tick);
    // Clear the ground around the agent.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) sim.world.setResource(a.x[0] + dx, a.y[0] + dy, 0, 0);
    }
    const planted = plant(sim.state, sim.ctx, 0);
    expect(planted).toBeGreaterThan(0);
    expect(colony.planted).toBe(planted);
    expect(colony.projects[1].kind).toBe(ProjectKind.NONE);
    expect(a.taskProject[0]).toBe(-1);
  });
});

describe('experience', () => {
  it('learns that a zone is dangerous and avoids it', () => {
    const sim = new Simulation({ seed: 5, balance });
    const ctx = sim.ctx;
    const a = sim.agents;
    const [x, y] = [a.x[0], a.y[0]];
    const before = dangerAt(ctx, 0, x, y);
    expect(avoids(ctx, 0, x, y)).toBe(false);
    for (let i = 0; i < 3; i++) noteAttack(ctx, 0);
    expect(dangerAt(ctx, 0, x, y)).toBeGreaterThan(before);
    expect(avoids(ctx, 0, x, y)).toBe(true);
    // Many quiet passes bring the estimate down.
    const size = balance.learning.zoneSize;
    for (let i = 0; i < 40; i++) {
      a.x[0] = x + size * 4;
      notePass(ctx, 0);
      a.x[0] = x;
      notePass(ctx, 0);
    }
    expect(avoids(ctx, 0, x, y)).toBe(false);
  });

  it('revises the cost of bringing a good', () => {
    const sim = new Simulation({ seed: 5, balance });
    const ctx = sim.ctx;
    const a = sim.agents;
    noteDelivery(ctx, 0, berries, 5, 500);
    expect(a.costPerUnit[berries]).toBe(100);
    noteDelivery(ctx, 0, berries, 5, 100);
    const v = a.costPerUnit[berries];
    expect(v).toBeLessThan(100);
    expect(v).toBeGreaterThan(20);
  });
});

// J7 exit (the part a test can check without a clock): over 100 days, harmony progresses on the
// majority of seeds (mean of days 91–100 above days 11–20), and at least one gene drifts clearly
// (its population mean moves by 5 % of its range or more from the founder's value). The fluidity
// with 500 individuals is measured by `npm run bench` (tools/bench.js).
describe('harmony and evolution (J7 exit)', () => {
  it('progresses on most seeds, and genes drift', async () => {
    const seeds = [1, 2, 3];
    let progress = 0;
    let drifting = 0;
    for (const seed of seeds) {
      const sim = new Simulation({ seed, balance });
      for (let day = 0; day < 100; day++) {
        sim.step(DAY);
        // A long synchronous test starves Vitest's worker messages: let them through.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const rows = sim.state.history.rows();
      const mean = (a, b) => rows.slice(a, b).reduce((s, r) => s + r.harmony, 0) / (b - a);
      if (mean(90, 100) > mean(10, 20)) progress++;
      const last = rows.at(-1);
      const drift = GENE_TABLE.genes.map(
        (g, k) => Math.abs(last.geneMean[k] - g.start) / (g.max - g.min),
      );
      if (Math.max(...drift) >= 0.05) drifting++;
    }
    expect(progress).toBeGreaterThan(seeds.length / 2);
    expect(drifting).toBeGreaterThan(0);
  }, 600000);
});
