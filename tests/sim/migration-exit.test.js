import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Simulation } from '../../src/sim/simulation.js';

const DAY = balance.time.ticksPerDay;

// J11 exit: on most seeds, at least two colonies on day 150, the second founded by an expedition
// of the first, and at least one exchange between colonies. Measured on 10 seeds (8 of them at J11, 7 at J12); this
// test plays two of them until a daughter colony is founded, has traded with its mother and has
// grown to 16 members (a long test: Vitest breathes between days).
describe('migration and colonies (J11 exit)', () => {
  it('founds a daughter colony that trades with its mother and grows', async () => {
    for (const seed of [15, 20]) {
      const sim = new Simulation({ seed, balance });
      const colonies = sim.state.colonies;
      let day = 0;
      const grown = () =>
        colonies.length > 1 && colonies[1].members >= 16 && colonies[0].relTrades[1] > 0;
      while (day < 150 && !grown()) {
        sim.step(DAY);
        day++;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(colonies.length, `seed ${seed}`).toBeGreaterThan(1);
      const daughter = colonies[1];
      expect(daughter.parent, `seed ${seed}`).toBe(0);
      expect(daughter.members, `seed ${seed}`).toBeGreaterThanOrEqual(16);
      expect(colonies[0].relKin[1] + daughter.relKin[0], `seed ${seed}`).toBe(2);
      expect(colonies[0].relTrades[1], `seed ${seed}`).toBeGreaterThan(0);
    }
  }, 1800000);
});
