import { describe, expect, it } from 'vitest';
import { TickScheduler } from '../../src/worker/scheduler.js';

/**
 * Runs the scheduler for `seconds` of fake real time in 10 ms slices.
 * @param {TickScheduler} scheduler
 * @param {number} seconds
 * @param {number} [msPerTick=0.001] - Simulated cost of one tick.
 * @param {number} [startMs=0]
 * @returns {{ ticks: number, endMs: number }}
 */
function run(scheduler, seconds, msPerTick = 0.001, startMs = 0) {
  let ticks = 0;
  let now = startMs;
  const end = startMs + seconds * 1000;
  while (now < end) {
    now += 10;
    const n = scheduler.due(now);
    ticks += n;
    scheduler.done(n, now, n * msPerTick);
  }
  return { ticks, endMs: now };
}

describe('TickScheduler', () => {
  it('runs ticksPerSecond × speed ticks per real second', () => {
    const s = new TickScheduler({ ticksPerSecond: 10 });
    s.setSpeed(4);
    s.due(0);
    const { ticks } = run(s, 10);
    expect(ticks).toBeGreaterThanOrEqual(399);
    expect(ticks).toBeLessThanOrEqual(400);
  });

  it('runs nothing while paused and resumes without a burst', () => {
    const s = new TickScheduler({ ticksPerSecond: 10 });
    s.due(0);
    s.pause();
    expect(run(s, 5).ticks).toBe(0);
    s.resume();
    const { ticks } = run(s, 1, 0.001, 5000);
    expect(ticks).toBeLessThanOrEqual(10);
  });

  it('reports the effective speed', () => {
    const s = new TickScheduler({ ticksPerSecond: 10 });
    s.setSpeed(16);
    s.due(0);
    const { endMs } = run(s, 3);
    expect(s.effectiveSpeed(endMs)).toBeGreaterThan(15);
    expect(s.effectiveSpeed(endMs)).toBeLessThanOrEqual(16.5);
  });

  it('caps the speed when the machine cannot keep up, without a growing backlog', () => {
    const s = new TickScheduler({ ticksPerSecond: 10, sliceBudgetMs: 5 });
    s.setSpeed(256);
    s.due(0);
    // 1 ms per tick and 5 ms of budget per 10 ms slice: at most ~500 ticks/s, i.e. ×50.
    const { endMs } = run(s, 5, 1);
    const effective = s.effectiveSpeed(endMs);
    expect(effective).toBeLessThan(60);
    expect(effective).toBeGreaterThan(30);
    expect(s.backlog).toBeLessThanOrEqual(256 * 10 * 0.25 + 1);
  });

  it('in max mode, fills the slice budget', () => {
    const s = new TickScheduler({ ticksPerSecond: 10, sliceBudgetMs: 8 });
    s.setSpeed('max');
    s.due(0);
    const { endMs } = run(s, 3, 0.01);
    // 8 ms per 10 ms slice at 0.01 ms per tick ≈ 80 000 ticks/s ≈ ×8 000.
    expect(s.effectiveSpeed(endMs)).toBeGreaterThan(4000);
  });

  it('rejects unknown speeds', () => {
    const s = new TickScheduler({ ticksPerSecond: 10 });
    expect(() => s.setSpeed(-1)).toThrow();
    expect(() => s.setSpeed('fast')).toThrow();
  });
});
