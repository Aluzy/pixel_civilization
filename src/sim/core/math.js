// Deterministic replacements for engine-dependent Math functions (ADR 0005). They use only
// +, -, ×, / whose results IEEE 754 fixes exactly, so every JS engine gives the same bits.

const TAYLOR_TERMS = 14;

/**
 * e^(-x) for x ≥ 0, accurate to ~1e-15 relative error.
 * Range reduction: e^(-x) = (e^(-x / 2^k))^(2^k) with x / 2^k ≤ 0.5, then a Taylor series.
 * @param {number} x
 * @returns {number}
 */
export function expNeg(x) {
  if (!(x > 0)) return 1;
  if (x > 745) return 0;
  let k = 0;
  let y = x;
  while (y > 0.5) {
    y *= 0.5;
    k++;
  }
  // Taylor series of e^(-y), evaluated with Horner's scheme.
  let sum = 1;
  for (let n = TAYLOR_TERMS; n >= 1; n--) sum = 1 - (y * sum) / n;
  for (let i = 0; i < k; i++) sum *= sum;
  return sum;
}
