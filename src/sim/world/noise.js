// 2D simplex noise (after Stefan Gustavson's public-domain reference), seeded by our own rng.
// Implemented here rather than imported so that the world can never change with a dependency
// update, and because it only uses +, ×, floor: results are identical on every JS engine.

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// 12 gradient directions, as (x, y) pairs.
const GRAD = new Float64Array([
  1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1,
]);

// Scales the raw sum to roughly [-1, 1].
const OUTPUT_SCALE = 70;

/**
 * Seeded 2D simplex noise.
 */
export class SimplexNoise2D {
  /**
   * @param {import('../core/rng.js').Rng} rng - Consumed once, to shuffle the permutation.
   */
  constructor(rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    /** @type {Uint8Array} */
    this.perm = new Uint8Array(512);
    /** @type {Uint8Array} */
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} Value in [-1, 1].
   */
  noise(x, y) {
    const perm = this.perm;
    const permMod12 = this.permMod12;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = permMod12[ii + perm[jj]] * 2;
      t0 *= t0;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = permMod12[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = permMod12[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    const v = OUTPUT_SCALE * n;
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }
}

/**
 * @typedef {object} FbmParams
 * @property {number} scale - Base frequency, in cycles per tile.
 * @property {number} octaves
 * @property {number} lacunarity - Frequency multiplier per octave.
 * @property {number} gain - Amplitude multiplier per octave.
 */

/**
 * Fractal sum of noise octaves, normalised to [0, 1].
 * @param {SimplexNoise2D} noise
 * @param {number} x
 * @param {number} y
 * @param {FbmParams} params
 * @returns {number}
 */
export function fbm(noise, x, y, params) {
  let frequency = params.scale;
  let amplitude = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < params.octaves; o++) {
    sum += amplitude * noise.noise(x * frequency, y * frequency);
    norm += amplitude;
    frequency *= params.lacunarity;
    amplitude *= params.gain;
  }
  const v = (sum / norm + 1) / 2;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
