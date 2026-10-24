// Response curves for utility considerations. Polynomial forms only (ADR 0005): a logistic curve
// would need Math.exp, whose result is not guaranteed identical across JS engines.

const LINEAR = 0;
const POWER = 1;
const SMOOTHSTEP = 2;
const INVERSE = 3;
const CONSTANT = 4;

/**
 * @typedef {object} Curve
 * @property {number} kind
 * @property {number} a - Meaning depends on kind (m, lo or value).
 * @property {number} b - Meaning depends on kind (b or hi).
 * @property {number} k - Integer exponent for power curves.
 */

/**
 * @param {{ type: string, m?: number, b?: number, k?: number, lo?: number, hi?: number,
 *   value?: number }} def - Curve as written in data/ai-goals.json.
 * @returns {Curve}
 */
export function compileCurve(def) {
  switch (def.type) {
    case 'linear':
      return { kind: LINEAR, a: def.m ?? 1, b: def.b ?? 0, k: 1 };
    case 'power': {
      const k = def.k ?? 2;
      if (!Number.isInteger(k) || k < 1 || k > 8) throw new Error(`Power curve needs k in 1..8`);
      return { kind: POWER, a: def.m ?? 1, b: def.b ?? 0, k };
    }
    case 'smoothstep':
      if (!(def.hi > def.lo)) throw new Error('Smoothstep curve needs hi > lo');
      return { kind: SMOOTHSTEP, a: def.lo, b: def.hi, k: 0 };
    case 'inverse':
      return { kind: INVERSE, a: 0, b: 0, k: 0 };
    case 'constant':
      return { kind: CONSTANT, a: def.value ?? 1, b: 0, k: 0 };
    default:
      throw new Error(`Unknown curve type: ${def.type}`);
  }
}

/**
 * @param {number} v
 * @returns {number}
 */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * @param {Curve} curve
 * @param {number} x - Input, clamped to [0, 1].
 * @returns {number} Output in [0, 1].
 */
export function evaluateCurve(curve, x) {
  const t = clamp01(x);
  switch (curve.kind) {
    case LINEAR:
      return clamp01(curve.a * t + curve.b);
    case POWER: {
      let p = t;
      for (let i = 1; i < curve.k; i++) p *= t;
      return clamp01(curve.a * p + curve.b);
    }
    case SMOOTHSTEP: {
      const s = clamp01((t - curve.a) / (curve.b - curve.a));
      return s * s * (3 - 2 * s);
    }
    case INVERSE:
      return 1 - t;
    default:
      return clamp01(curve.a);
  }
}
