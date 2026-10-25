// Plots and what grows on them (docs/design/13-agriculture-cuisine.md, « Cultiver »), as typed
// arrays indexed by plot. A plot is a structure on the world grid; its plant lives here.

/** Most plots in the world. */
export const MAX_PLOTS = 4096;

/** Stage of a plot with nothing growing (bare, waiting for a seed). */
export const FALLOW = -1;

const OFFSET = 1 << 20;
const SPAN = 1 << 21;

export class CropStore {
  constructor() {
    this.count = 0;
    this.x = new Int32Array(MAX_PLOTS);
    this.y = new Int32Array(MAX_PLOTS);
    this.colony = new Int16Array(MAX_PLOTS);
    this.crop = new Int8Array(MAX_PLOTS);
    /** Days of growth (watered days), FALLOW if bare; ripe at the crop's number of stages. */
    this.stage = new Int8Array(MAX_PLOTS).fill(FALLOW);
    /** Last day it was watered, -1 if never since sown. */
    this.watered = new Int32Array(MAX_PLOTS).fill(-1);
    /** Days in a row without water. */
    this.dry = new Uint8Array(MAX_PLOTS);
    /** Day it ripened. */
    this.ripeDay = new Int32Array(MAX_PLOTS);
    /** Member who took the plot's next job (water, harvest, sow), -1 if free. */
    this.claim = new Int32Array(MAX_PLOTS).fill(-1);
    this.claimTick = new Int32Array(MAX_PLOTS);
    /** Plot at each tile, for lookups only (never iterated). */
    this.index = new Map();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  static key(x, y) {
    return (x + OFFSET) * SPAN + (y + OFFSET);
  }

  /**
   * Adds a plot, sown with `crop` (or bare if crop < 0).
   * @param {number} x
   * @param {number} y
   * @param {number} colony
   * @param {number} crop
   * @returns {number} Plot index, -1 if full.
   */
  add(x, y, colony, crop) {
    if (this.count >= MAX_PLOTS) return -1;
    const p = this.count++;
    this.x[p] = x;
    this.y[p] = y;
    this.colony[p] = colony;
    this.claim[p] = -1;
    this.sow(p, crop);
    this.index.set(CropStore.key(x, y), p);
    return p;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} Plot at this tile, -1 if none.
   */
  at(x, y) {
    return this.index.get(CropStore.key(x, y)) ?? -1;
  }

  /**
   * Sows a plot (or leaves it bare with crop < 0): stage 0, not watered yet.
   * @param {number} p
   * @param {number} crop
   * @returns {void}
   */
  sow(p, crop) {
    this.crop[p] = crop < 0 ? 0 : crop;
    this.stage[p] = crop < 0 ? FALLOW : 0;
    this.watered[p] = -1;
    this.dry[p] = 0;
    this.ripeDay[p] = 0;
  }

  /**
   * Gives up a plot (a wall is built on it): it belongs to no colony any more and grows nothing.
   * @param {number} p
   * @returns {void}
   */
  retire(p) {
    this.colony[p] = -1;
    this.stage[p] = FALLOW;
    this.claim[p] = -1;
    this.index.delete(CropStore.key(this.x[p], this.y[p]));
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    const n = this.count;
    h.uint32(n);
    h.typedArray(this.x.subarray(0, n)).typedArray(this.y.subarray(0, n));
    h.typedArray(this.colony.subarray(0, n)).typedArray(this.crop.subarray(0, n));
    h.typedArray(this.stage.subarray(0, n)).typedArray(this.watered.subarray(0, n));
    h.typedArray(this.dry.subarray(0, n)).typedArray(this.ripeDay.subarray(0, n));
    h.typedArray(this.claim.subarray(0, n)).typedArray(this.claimTick.subarray(0, n));
  }
}
