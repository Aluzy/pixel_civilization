import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { chooseHud, nextSpeed, shortSpeed, topLine } from '../../src/ui/hud-model.js';

const STEPS = balance.time.speedSteps;

describe('phone HUD model', () => {
  it('picks the phone HUD on touch screens and narrow windows, unless the URL says otherwise', () => {
    const env = { search: '', width: 1400, coarse: false, fine: true };
    expect(chooseHud(env)).toBe('desktop');
    expect(chooseHud({ ...env, coarse: true, fine: false })).toBe('phone');
    expect(chooseHud({ ...env, width: 390 })).toBe('phone');
    expect(chooseHud({ ...env, search: '?seed=3&hud=phone' })).toBe('phone');
    expect(chooseHud({ ...env, width: 390, search: '?hud=desktop' })).toBe('desktop');
  });

  it('steps the speed up to Max and back down', () => {
    expect(nextSpeed(1, 1, STEPS)).toBe(4);
    expect(nextSpeed(1, -1, STEPS)).toBe(1);
    expect(nextSpeed(256, 1, STEPS)).toBe('max');
    expect(nextSpeed('max', 1, STEPS)).toBe('max');
    expect(nextSpeed('max', -1, STEPS)).toBe(256);
    expect(nextSpeed(10, 1, STEPS)).toBe(64);
  });

  it('writes the speed and the top bar briefly', () => {
    expect(shortSpeed({ speed: 16 })).toBe('×16');
    expect(shortSpeed({ speed: 'max' })).toBe('Max');
    const frame = {
      time: { day: 12, hour: 7, minute: 5 },
      speed: 16,
      effectiveSpeed: 16,
      paused: false,
      auto: true,
      agents: [1, 2, 3],
    };
    expect(topLine(frame)).toBe('J12 07:05 · ×16 auto · 3 ind.');
    const withHarmony = { ...frame, colony: { harmony: { score: 61.6, focus: 3 } } };
    expect(topLine(withHarmony)).toBe('J12 07:05 · ×16 auto · 3 ind. · H 62');
  });
});
