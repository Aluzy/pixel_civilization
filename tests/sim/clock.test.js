import { describe, expect, it } from 'vitest';
import { describeTick } from '../../src/sim/core/clock.js';

const TIME = {
  ticksPerSecond: 10,
  ticksPerDay: 1200,
  dayStartHour: 6,
  phases: [
    { name: 'day', fraction: 0.6 },
    { name: 'dusk', fraction: 0.1 },
    { name: 'night', fraction: 0.2 },
    { name: 'dawn', fraction: 0.1 },
  ],
  speedSteps: [1, 4, 16, 64, 256],
};

describe('clock', () => {
  it('starts on day 1 at the configured hour, in daylight', () => {
    const t = describeTick(0, TIME);
    expect(t.day).toBe(1);
    expect(t.hour).toBe(6);
    expect(t.minute).toBe(0);
    expect(t.phase).toBe('day');
  });

  it('switches phases at the configured fractions', () => {
    expect(describeTick(719, TIME).phase).toBe('day');
    expect(describeTick(720, TIME).phase).toBe('dusk');
    expect(describeTick(840, TIME).phase).toBe('night');
    expect(describeTick(1080, TIME).phase).toBe('dawn');
    expect(describeTick(1199, TIME).phase).toBe('dawn');
  });

  it('rolls over to the next day', () => {
    const t = describeTick(1200, TIME);
    expect(t.day).toBe(2);
    expect(t.phase).toBe('day');
    expect(t.hour).toBe(6);
  });

  it('wraps the clock hour past midnight', () => {
    // Half a day after 06:00 is 18:00; three quarters is 00:00.
    expect(describeTick(600, TIME).hour).toBe(18);
    expect(describeTick(900, TIME).hour).toBe(0);
  });

  it('rejects phase fractions that do not sum to 1', () => {
    const bad = { ...TIME, phases: [{ name: 'day', fraction: 0.5 }] };
    expect(() => describeTick(0, bad)).toThrow();
  });
});
