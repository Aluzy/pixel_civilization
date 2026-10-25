/**
 * Collective knowledge over time (docs/design/05-savoir.md, « Savoir collectif »): for each
 * recipe, who first discovered it, whether it survived that individual through a book, and when
 * it was lost (neither known by a living individual nor written in an accessible document) and
 * found again. Observation only: no decision reads it.
 */
export class KnowledgeLog {
  /**
   * @param {number} recipes
   */
  constructor(recipes) {
    this.recipes = recipes;
    this.discovered = new Int32Array(recipes).fill(-1);
    this.discoverer = new Int32Array(recipes).fill(-1);
    this.discovererDied = new Int32Array(recipes).fill(-1);
    /** First tick someone learnt it from a book after its discoverer died. */
    this.savedByBook = new Int32Array(recipes).fill(-1);
    this.lost = new Int32Array(recipes).fill(-1);
    this.recovered = new Int32Array(recipes).fill(-1);
    this.losses = new Uint16Array(recipes);
    /** Bit sets at the last count: known by the living, written and accessible, lost. */
    this.known = 0;
    this.written = 0;
    this.lostMask = 0;
  }

  /**
   * @param {number} r
   * @param {number} agent
   * @param {number} tick
   * @returns {void}
   */
  noteDiscovery(r, agent, tick) {
    if (this.discovered[r] >= 0) return;
    this.discovered[r] = tick;
    this.discoverer[r] = agent;
  }

  /**
   * @param {number} agent
   * @param {number} tick
   * @returns {void}
   */
  noteDeath(agent, tick) {
    for (let r = 0; r < this.recipes; r++) {
      if (this.discoverer[r] === agent && this.discovererDied[r] < 0) this.discovererDied[r] = tick;
    }
  }

  /**
   * @param {number} r
   * @param {number} tick
   * @returns {void}
   */
  noteRead(r, tick) {
    if (this.discovererDied[r] >= 0 && this.savedByBook[r] < 0) this.savedByBook[r] = tick;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.typedArray(this.discovered).typedArray(this.discoverer).typedArray(this.discovererDied);
    h.typedArray(this.savedByBook).typedArray(this.lost).typedArray(this.recovered);
    h.typedArray(this.losses).uint32(this.known).uint32(this.written).uint32(this.lostMask);
  }
}
