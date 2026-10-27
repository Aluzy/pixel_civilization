import { beforeAll, describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { CATALOG, JOBS, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';

const DAY = balance.time.ticksPerDay;
const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
const good = (id) => {
  const item = CATALOG.items.find((i) => i.id === id);
  return item ? item.good : WORLD_TABLES.resources.findIndex((r) => r.id === id) + 1;
};
const SOW = recipe('plot');
const WHEAT = good('wheat');
const FLOUR = good('flour');
const BREAD = good('bread');

/**
 * Mean price on the days the stock was lowest (first third) and highest (last third).
 * @param {[number, number][]} samples - [stock, price] per day.
 * @returns {{ scarce: number, plenty: number }}
 */
function byStock(samples) {
  const s = samples.slice().sort((a, b) => a[0] - b[0]);
  const n = Math.floor(s.length / 3);
  const mean = (part) => part.reduce((t, v) => t + v[1], 0) / part.length;
  return { scarce: mean(s.slice(0, n)), plenty: mean(s.slice(-n)) };
}

// The J9 and J10 exits, measured on the same three games of 100 days (long: Vitest breathes
// between days).
// J9: on most seeds, a colony discovers farming by trying before day 60; on days 91 to 100, more
// than half of the food it eats comes from its crops and a dish is eaten every day; a colony that
// farms early grows beyond 300 individuals. Since the village (decision 0026: whole nights of
// sleep, two beds a house, a walled village that swarms out), a dish is eaten on most days and the
// largest games pass 100 individuals; since the architecture (decision 0028), crops feeding more
// than half or a dish on most days is asked of most of the three games.
// Measured on 16 seeds; this test plays three of them.
// J10: on day 100, at least 4 jobs coexist; the chain farmer → miller or baker → buyer of bread is
// in the counter's books; the price of wheat is higher on the days it is scarce. The tech tree is
// within reach: the oven is discovered, and the foundry in one of the three games (since the
// people of decision 0030, on 3 seeds of 24 by day 100, against 9 in v0.16).
describe('farming, cooking and the economy (J9 and J10 exits)', () => {
  const results = [];

  beforeAll(async () => {
    for (const seed of [3, 5, 9]) {
      const sim = new Simulation({ seed, balance });
      const colony = sim.state.colonies[0];
      let eaten = 0;
      let fromCrops = 0;
      let dishDays = 0;
      let peak = 0;
      const wheat = [];
      for (let d = 1; d <= 100; d++) {
        sim.step(DAY);
        // The day just ended (counted at dawn).
        if (d > 90) {
          eaten += colony.eatenYesterday;
          fromCrops += colony.cropYesterday;
          if (colony.dishesYesterday > 0) dishDays++;
        }
        if (d >= 20) wheat.push([colony.stock[WHEAT], colony.price[WHEAT]]);
        peak = Math.max(peak, sim.agents.aliveCount);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const k = sim.state.knowledge;
      const G = CATALOG.goodCount;
      const sold = (job, g) => colony.sold[(JOBS.index[job] + 1) * G + g];
      const bought = (job, g) => colony.bought[(JOBS.index[job] + 1) * G + g];
      let breadBought = 0;
      for (let j = 0; j <= JOBS.jobs.length; j++) breadBought += colony.bought[j * G + BREAD];
      results.push({
        seed,
        sown: k.discovered[SOW] < 0 ? -1 : Math.floor(k.discovered[SOW] / DAY) + 1,
        share: fromCrops / Math.max(1, eaten),
        dishDays,
        peak,
        jobs: JOBS.jobs.filter((j, i) => !j.post && colony.jobHolders[i] > 0).length,
        chain:
          sold('farmer', WHEAT) > 0 &&
          bought('miller', WHEAT) + bought('baker', WHEAT) > 0 &&
          sold('miller', FLOUR) + sold('baker', FLOUR) > 0 &&
          bought('baker', FLOUR) > 0 &&
          sold('baker', BREAD) > 0 &&
          breadBought > 0,
        wheat: byStock(wheat),
        oven: k.discovered[recipe('oven')] >= 0,
        foundry: k.discovered[recipe('foundry')] >= 0,
      });
    }
  }, 1800000);

  it('discovers farming, eats its crops and dishes, and grows beyond 100 (J9)', () => {
    for (const r of results) {
      expect(r.sown, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.sown, `seed ${r.seed}`).toBeLessThan(60);
    }
    // On most of them, the crops feed more than half, or a dish is eaten on most days.
    const fed = results.filter((r) => r.share > 0.5 || r.dishDays >= 8);
    expect(fed.length).toBeGreaterThanOrEqual(2);
    expect(results.filter((r) => r.peak > 100).length).toBeGreaterThanOrEqual(1);
  });

  it('has jobs, a bread chain, prices that follow scarcity, and an oven and a foundry (J10)', () => {
    for (const r of results) {
      expect(r.jobs, `seed ${r.seed}`).toBeGreaterThanOrEqual(4);
      expect(r.chain, `seed ${r.seed}`).toBe(true);
      expect(r.wheat.scarce, `seed ${r.seed}`).toBeGreaterThan(r.wheat.plenty);
      expect(r.oven, `seed ${r.seed}`).toBe(true);
    }
    // The foundry comes later in a town of the people (decision 0030): one game of the three.
    expect(results.filter((r) => r.foundry).length).toBeGreaterThanOrEqual(1);
  });
});
