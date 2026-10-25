import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { EventType } from '../../src/sim/core/events.js';
import { CATALOG, Simulation } from '../../src/sim/simulation.js';

const DAY = balance.time.ticksPerDay;
const SOW = CATALOG.recipes.findIndex((r) => r.id === 'plot');

// J9 exit: on most seeds, a colony discovers farming by trying before day 60; on days 91 to 100,
// more than half of the food it eats comes from its crops and a dish is eaten every day; an
// ordinary colony grows beyond 300 individuals. Measured on 10 seeds (8 farm, 6 pass 300); this
// test plays three of them for 100 days (a long test: it lets Vitest breathe between days).
describe('farming and cooking (J9 exit)', () => {
  it('discovers farming, eats its crops and dishes, and grows beyond 300', async () => {
    const results = [];
    for (const seed of [1, 5, 10]) {
      const sim = new Simulation({ seed, balance });
      const colony = sim.state.colonies[0];
      let sown = -1;
      let seen = 0;
      let eaten = 0;
      let fromCrops = 0;
      let dishDays = 0;
      let peak = 0;
      for (let d = 1; d <= 100; d++) {
        sim.step(DAY);
        for (const e of sim.events.since(seen)) {
          if (sown < 0 && e.type === EventType.DISCOVERED && e.subject === SOW) sown = d;
        }
        seen = sim.events.count;
        // The day just ended (counted at dawn).
        if (d > 90) {
          eaten += colony.eatenYesterday;
          fromCrops += colony.cropYesterday;
          if (colony.dishesYesterday > 0) dishDays++;
        }
        peak = Math.max(peak, sim.agents.aliveCount);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      results.push({ seed, sown, share: fromCrops / Math.max(1, eaten), dishDays, peak });
    }
    for (const r of results) {
      expect(r.sown, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.sown, `seed ${r.seed}`).toBeLessThan(60);
      expect(r.share, `seed ${r.seed}`).toBeGreaterThan(0.5);
      expect(r.dishDays, `seed ${r.seed}`).toBe(10);
    }
    expect(results.filter((r) => r.peak > 300).length).toBeGreaterThanOrEqual(2);
  }, 1800000);
});
