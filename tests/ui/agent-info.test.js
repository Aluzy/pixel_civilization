import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { bar, formatAgent } from '../../src/ui/agent-info.js';
import { formatEvent } from '../../src/ui/chronicle.js';

describe('agent panel', () => {
  it('draws proportional bars', () => {
    expect(bar(0, 100, 10)).toBe('░░░░░░░░░░');
    expect(bar(50, 100, 10)).toBe('█████░░░░░');
    expect(bar(100, 100, 10)).toBe('██████████');
    expect(bar(130, 100, 4)).toBe('████');
  });

  it('describes a live agent with needs, goal, memory and recent decisions', () => {
    const sim = new Simulation({ seed: 2, balance });
    sim.step(600);
    const lines = formatAgent(sim.describeAgent(0), WORLD_TABLES, balance.time);
    const text = lines.join('\n');
    expect(lines[0]).toMatch(/^Individu #0/);
    for (const label of ['PV', 'Faim', 'Soif', 'Fatigue', 'Curiosité', 'Objectif', 'Porte']) {
      expect(text).toContain(label);
    }
    expect(text).toMatch(/Décisions récentes/);
    expect(text).toMatch(/J1 \d\d:\d\d/);
  });
});

describe('chronicle', () => {
  it('formats events with day and time', () => {
    const event = { seq: 0, tick: 0, type: 'birth', agent: 0, x: 3, y: -2 };
    expect(formatEvent(event, balance.time)).toBe('J1 06:00 · Premier pas de l’individu #0.');
    const death = { seq: 5, tick: 1200 * 3, type: 'death', agent: 0, x: 0, y: 0 };
    expect(formatEvent(death, balance.time)).toBe('J4 06:00 · Mort de l’individu #0.');
  });
});
