// Daily record of the first colony for the dashboard (docs/design/08-interface.md, « Tableau de
// bord »): harmony and its components, population, and the mean and spread of each gene. Kept
// in the state (it cannot be recomputed from the present) and hashed; preallocated.

/** Values per day before the genes: tick, harmony, 5 components, population. */
const HEAD = 8;

export class History {
  /**
   * @param {number} days - Days kept (the oldest are dropped).
   * @param {number} genes
   */
  constructor(days, genes) {
    this.capacity = days;
    this.genes = genes;
    this.stride = HEAD + 2 * genes;
    this.data = new Float64Array(days * this.stride);
    /** Days recorded since the start (the latest `capacity` are kept). */
    this.count = 0;
  }

  /**
   * Records today: harmony (score then components), population, genes (mean, spread).
   * @param {number} tick
   * @param {Float64Array} harmony - Score then the 5 components.
   * @param {number} population
   * @param {Float64Array} geneMean
   * @param {Float64Array} geneSpread
   * @returns {void}
   */
  record(tick, harmony, population, geneMean, geneSpread) {
    const o = (this.count % this.capacity) * this.stride;
    const d = this.data;
    d[o] = tick;
    for (let k = 0; k < 6; k++) d[o + 1 + k] = harmony[k];
    d[o + 7] = population;
    for (let g = 0; g < this.genes; g++) {
      d[o + HEAD + g] = geneMean[g];
      d[o + HEAD + this.genes + g] = geneSpread[g];
    }
    this.count++;
  }

  /**
   * Days in order, oldest first, as plain objects (for the renderer).
   * @param {number} [from=0] - First day wanted (days before the oldest kept are skipped).
   * @returns {{ tick: number, harmony: number, components: number[], population: number,
   *   geneMean: number[], geneSpread: number[] }[]}
   */
  rows(from = 0) {
    const out = [];
    for (let i = Math.max(from, this.count - this.capacity); i < this.count; i++) {
      const o = (i % this.capacity) * this.stride;
      const d = this.data;
      out.push({
        tick: d[o],
        harmony: d[o + 1],
        components: Array.from(d.subarray(o + 2, o + 7)),
        population: d[o + 7],
        geneMean: Array.from(d.subarray(o + HEAD, o + HEAD + this.genes)),
        geneSpread: Array.from(d.subarray(o + HEAD + this.genes, o + HEAD + 2 * this.genes)),
      });
    }
    return out;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.count);
    const n = Math.min(this.count, this.capacity);
    h.typedArray(this.data.subarray(0, n * this.stride));
  }
}

/**
 * Mean and standard deviation of each gene over the living.
 * @param {import('../agents/agent-store.js').AgentStore} a
 * @param {Float64Array} mean - Receives one per gene.
 * @param {Float64Array} spread
 * @returns {number} Individuals counted.
 */
export function geneStats(a, mean, spread) {
  const n = a.geneCount;
  mean.fill(0);
  spread.fill(0);
  let count = 0;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    count++;
    for (let k = 0; k < n; k++) mean[k] += a.genes[id * n + k];
  }
  if (count === 0) return 0;
  for (let k = 0; k < n; k++) mean[k] /= count;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    for (let k = 0; k < n; k++) {
      const d = a.genes[id * n + k] - mean[k];
      spread[k] += d * d;
    }
  }
  for (let k = 0; k < n; k++) spread[k] = Math.sqrt(spread[k] / count);
  return count;
}
