// Bit sets of up to 53 elements held in an ordinary number (decision 0029). JS bitwise operators
// cut to 32 bits, so the set is split into two 32-bit words by exact division and floor, worked
// on word by word, and joined again: no allocation, the same bits on every engine.

/** Largest number of elements a set holds (integers stay exact up to 2^53). */
export const MAX_BITS = 53;

const WORD = 4294967296;

/** 2^k for k in [0, 53), built by doubling (no `**`, decision 0005). */
const POW2 = new Float64Array(MAX_BITS);
POW2[0] = 1;
for (let k = 1; k < MAX_BITS; k++) POW2[k] = POW2[k - 1] * 2;

/**
 * @param {number} m
 * @returns {number} Low 32 bits, as an unsigned integer.
 */
function lo(m) {
  return m % WORD;
}

/**
 * @param {number} m
 * @returns {number} High bits (above 32), as an unsigned integer.
 */
function hi(m) {
  return Math.floor(m / WORD);
}

/**
 * @param {number} l - Unsigned low word.
 * @param {number} h - Unsigned high word.
 * @returns {number}
 */
function join(l, h) {
  return (h >>> 0) * WORD + (l >>> 0);
}

/**
 * The set holding only `k`.
 * @param {number} k
 * @returns {number}
 */
export function bit(k) {
  return POW2[k];
}

/**
 * @param {number} m
 * @param {number} k
 * @returns {boolean} True if `k` is in `m`.
 */
export function has(m, k) {
  return Math.floor(m / POW2[k]) % 2 === 1;
}

/**
 * @param {number} m
 * @param {number} k
 * @returns {number} `m` with `k` added.
 */
export function withBit(m, k) {
  return has(m, k) ? m : m + POW2[k];
}

/**
 * @param {number} m
 * @param {number} k
 * @returns {number} `m` without `k`.
 */
export function withoutBit(m, k) {
  return has(m, k) ? m - POW2[k] : m;
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number} Union.
 */
export function or(a, b) {
  return join(lo(a) | lo(b), hi(a) | hi(b));
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number} Intersection.
 */
export function and(a, b) {
  return join(lo(a) & lo(b), hi(a) & hi(b));
}

/**
 * @param {number} a
 * @param {number} b
 * @returns {number} Elements of `a` not in `b`.
 */
export function andNot(a, b) {
  return join(lo(a) & ~lo(b), hi(a) & ~hi(b));
}

/**
 * @param {number} v - 32-bit word.
 * @returns {number}
 */
function count32(v) {
  let n = 0;
  for (let w = v >>> 0; w !== 0; w = (w & (w - 1)) >>> 0) n++;
  return n;
}

/**
 * @param {number} m
 * @returns {number} Number of elements.
 */
export function popcount(m) {
  return count32(lo(m)) + count32(hi(m));
}

/**
 * Feeds a set to a hasher as two words.
 * @param {import('./hash.js').Hasher} h
 * @param {number} m
 * @returns {import('./hash.js').Hasher}
 */
export function hashBits(h, m) {
  return h.uint32(lo(m)).uint32(hi(m));
}

/**
 * @param {number} m
 * @returns {number} Smallest element of `m`, or -1 if it is empty.
 */
export function lowest(m) {
  const l = lo(m) | 0;
  if (l !== 0) return 31 - Math.clz32(l & -l);
  const h = hi(m) | 0;
  if (h !== 0) return 63 - Math.clz32(h & -h);
  return -1;
}
