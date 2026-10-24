import { describe, expect, it } from 'vitest';
import aiGoals from '../../data/ai-goals.json' with { type: 'json' };
import { createRng } from '../../src/sim/core/rng.js';
import { compileCurve, evaluateCurve } from '../../src/sim/ai/curves.js';
import { INPUT, buildGoalTable, scoreGoals } from '../../src/sim/ai/utility.js';

const TABLE = buildGoalTable(aiGoals);
const goalIndex = (id) => TABLE.goals.findIndex((g) => g.id === id);

/**
 * @param {Partial<Record<keyof typeof INPUT, number>>} values
 * @returns {Float64Array}
 */
function inputs(values) {
  const v = new Float64Array(Object.keys(INPUT).length);
  v[INPUT.one] = 1;
  for (const [k, x] of Object.entries(values)) v[INPUT[k]] = x;
  return v;
}

/**
 * @param {Float64Array} input
 * @param {number} [current=-1]
 * @returns {{ best: string, scores: Float64Array }}
 */
function decide(input, current = -1) {
  const scores = new Float64Array(TABLE.goals.length);
  const best = scoreGoals(TABLE, input, current, scores, createRng(1));
  return { best: TABLE.goals[best].id, scores };
}

describe('curves', () => {
  it('evaluates each curve type within [0, 1]', () => {
    const smooth = compileCurve({ type: 'smoothstep', lo: 0.2, hi: 0.8 });
    expect(evaluateCurve(smooth, 0.1)).toBe(0);
    expect(evaluateCurve(smooth, 0.5)).toBeCloseTo(0.5, 9);
    expect(evaluateCurve(smooth, 0.9)).toBe(1);
    const linear = compileCurve({ type: 'linear', m: 0.5, b: 0.25 });
    expect(evaluateCurve(linear, 1)).toBeCloseTo(0.75, 9);
    const power = compileCurve({ type: 'power', m: 1, k: 3, b: 0 });
    expect(evaluateCurve(power, 0.5)).toBeCloseTo(0.125, 9);
    const inverse = compileCurve({ type: 'inverse' });
    expect(evaluateCurve(inverse, 0.25)).toBeCloseTo(0.75, 9);
    const constant = compileCurve({ type: 'constant', value: 0.3 });
    expect(evaluateCurve(constant, 0.9)).toBeCloseTo(0.3, 9);
    const clamped = compileCurve({ type: 'linear', m: 3, b: 0 });
    expect(evaluateCurve(clamped, 0.9)).toBe(1);
  });

  it('rejects unknown curve types', () => {
    expect(() => compileCurve({ type: 'logistic' })).toThrow();
  });
});

describe('utility scoring', () => {
  it('drinks when thirsty, eats when hungry', () => {
    expect(decide(inputs({ thirst: 0.9, hunger: 0.3 })).best).toBe('drink');
    expect(decide(inputs({ thirst: 0.2, hunger: 0.9 })).best).toBe('eat');
  });

  it('sleeps when tired at night, not in daylight with the same fatigue', () => {
    expect(decide(inputs({ fatigue: 0.75, darkness: 1 })).best).toBe('sleep');
    const day = decide(inputs({ fatigue: 0.45, darkness: 0.1, curiosity: 0.6 }));
    expect(day.best).not.toBe('sleep');
  });

  it('explores when needs are met and curiosity is high', () => {
    expect(decide(inputs({ curiosity: 0.9, hunger: 0.1, thirst: 0.1 })).best).toBe('explore');
  });

  it('lets an urgent survival need suppress higher levels (pyramid)', () => {
    const calm = decide(inputs({ curiosity: 0.9 })).scores[goalIndex('explore')];
    const urgent = decide(inputs({ curiosity: 0.9, thirst: 0.95 })).scores[goalIndex('explore')];
    expect(urgent).toBeLessThan(calm * 0.3);
  });

  it('favours the current goal (inertia) between close alternatives', () => {
    const input = inputs({ thirst: 0.5, hunger: 0.62 });
    expect(decide(input).best).toBe('eat');
    expect(decide(input, goalIndex('drink')).best).toBe('drink');
  });

  it('rests when nothing is pressing', () => {
    expect(decide(inputs({})).best).toBe('rest');
  });

  it('rejects goals that reference unknown inputs', () => {
    const bad = {
      ...aiGoals,
      goals: [{ id: 'x', name: 'X', level: 'survival', considerations: [{ input: 'mood' }] }],
    };
    expect(() => buildGoalTable(bad)).toThrow();
  });
});
