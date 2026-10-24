import { describe, expect, it } from 'vitest';
import { formatClock, formatSpeed } from '../../src/ui/format.js';

describe('format', () => {
  it('formats day and time with two-digit hours and minutes', () => {
    expect(formatClock({ day: 1, hour: 6, minute: 0 })).toBe('Jour 1 · 06:00');
    expect(formatClock({ day: 12, hour: 23, minute: 7 })).toBe('Jour 12 · 23:07');
  });

  it('shows the effective speed only when it differs from the requested one', () => {
    expect(formatSpeed({ requested: 4, effective: 4, paused: false })).toBe('×4');
    expect(formatSpeed({ requested: 256, effective: 180.4, paused: false })).toBe(
      '×256 (effectif ×180)',
    );
    expect(formatSpeed({ requested: 16, effective: 0, paused: true })).toBe('Pause');
    expect(formatSpeed({ requested: 'max', effective: 812.6, paused: false })).toBe('Max (×813)');
  });
});
