import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Enclosure } from '../../src/sim/colony/colony-store.js';
import { PACK } from '../../src/sim/world/chunk-store.js';
import { Simulation } from '../../src/sim/simulation.js';

const DAY = balance.time.ticksPerDay;
const SLICES = 24;

/**
 * Checks that no predator is inside the enclosure; counts those prowling within 8 tiles of it.
 * @param {import('../../src/sim/colony/colony-store.js').Colony} colony
 * @param {import('../../src/sim/threats/threat-store.js').ThreatStore} t
 * @param {number} seed
 * @returns {number}
 */
function watch(colony, t, seed) {
  let near = 0;
  for (let p = 0; p < t.highWater; p++) {
    if (t.alive[p] !== 1) continue;
    expect(colony.inside(t.x[p], t.y[p]), `seed ${seed}`).toBe(false);
    const close =
      t.x[p] >= colony.encX0 - 8 &&
      t.x[p] <= colony.encX1 + 8 &&
      t.y[p] >= colony.encY0 - 8 &&
      t.y[p] <= colony.encY1 + 8;
    if (close) near++;
  }
  return near;
}

// J12 exit: on most seeds at 150 days, a colony builds a closed enclosure around its treasure,
// and predators do not get through. Measured on 10 seeds (see the roadmap); this test plays two
// of them until the first colony closes its enclosure, then ten more days with predators
// prowling around it (a long test: Vitest breathes between days).
describe('treasures and fortresses (J12 exit)', () => {
  it('closes an enclosure around the treasure, and no predator gets in', async () => {
    for (const seed of [1, 7]) {
      const sim = new Simulation({ seed, balance });
      const colony = sim.state.colonies[0];
      const t = sim.state.threats;
      let day = 0;
      let closedDay = -1;
      let prowled = 0;
      while (day < 150 && (closedDay < 0 || day < closedDay + 10)) {
        // A day in slices, to watch the predators around the wall.
        for (let slice = 0; slice < SLICES; slice++) {
          sim.step(DAY / SLICES);
          if (closedDay >= 0) prowled += watch(colony, t, seed);
        }
        day++;
        if (closedDay < 0 && colony.encState === Enclosure.CLOSED) closedDay = day;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(closedDay, `seed ${seed}`).toBeGreaterThan(0);
      expect(colony.inside(colony.treasureX, colony.treasureY), `seed ${seed}`).toBe(true);
      const room = sim.world.packedAt(colony.treasureX, colony.treasureY) >>> PACK.STRUCTURE_SHIFT;
      expect(room, `seed ${seed}`).toBe(sim.ctx.treasuryCode);
      // Every tile of the ring is a wall, the gate, the tower or impassable ground.
      for (let y = colony.encY0; y <= colony.encY1; y++) {
        for (let x = colony.encX0; x <= colony.encX1; x++) {
          if (!colony.onRing(x, y)) continue;
          const p = sim.world.packedAt(x, y);
          const blocked =
            sim.ctx.blocksPredator[p >>> PACK.STRUCTURE_SHIFT] === 1 ||
            sim.ctx.biomeSpeed[p & PACK.MASK] <= 0;
          expect(blocked, `seed ${seed} (${x}, ${y})`).toBe(true);
        }
      }
      expect(colony.breaches, `seed ${seed}`).toBe(0);
      // Predators did come up to the wall.
      expect(prowled, `seed ${seed}`).toBeGreaterThan(0);
    }
  }, 1800000);
});
