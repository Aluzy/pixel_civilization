import { describe, expect, it } from 'vitest';
import { AutoSpeed } from '../../src/worker/auto-speed.js';

describe('automatic acceleration', () => {
  it('speeds up after a quiet while and drops to ×1 on an alert', () => {
    const auto = new AutoSpeed({ steps: [1, 4, 16], quietMs: 1000 });
    auto.setAlerts(['death']);
    expect(auto.update([], 5000, 1)).toBe(null);
    auto.setEnabled(true, 0);
    expect(auto.update([], 500, 1)).toBe(null);
    expect(auto.update([{ type: 'birth' }], 1000, 1)).toBe(4);
    expect(auto.update([], 2100, 4)).toBe(16);
    expect(auto.update([], 3200, 16)).toBe(null);
    expect(auto.update([{ type: 'death' }], 3300, 16)).toBe(1);
  });
});
