/** Kinds of colony projects. */
export const ProjectKind = Object.freeze({
  NONE: 0,
  SHELTER: 1, // Gather the materials of a shelter in the stock, then build it at the camp.
  PANTRY: 2, // Keep a stock of food at the camp (never finished).
});

/** Most contributors remembered per project. */
export const MAX_CONTRIBUTORS = 8;

/**
 * One colony project, the unit of collective work (docs/design/06-ia.md, couche 4): what it
 * needs in the stock, what was delivered and reserved, and who contributed.
 */
export class Project {
  /**
   * @param {number} goods
   */
  constructor(goods) {
    this.kind = ProjectKind.NONE;
    /** Recipe built at the end (shelter), -1 otherwise. */
    this.recipe = -1;
    /** Rank among projects of this kind, for the chronicle ("Abri n°3"). */
    this.number = 0;
    this.startTick = 0;
    this.needs = new Int32Array(goods);
    /** Units brought by members (history: the stock itself tells what is still needed). */
    this.delivered = new Int32Array(goods);
    this.reserved = new Int32Array(goods);
    this.contributors = new Int32Array(MAX_CONTRIBUTORS).fill(-1);
    /** Agent who took the materials to build, -1 if none yet. */
    this.builder = -1;
  }

  /** @returns {void} */
  clear() {
    this.kind = ProjectKind.NONE;
    this.recipe = -1;
    this.needs.fill(0);
    this.delivered.fill(0);
    this.reserved.fill(0);
    this.contributors.fill(-1);
    this.builder = -1;
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  addContributor(id) {
    for (let k = 0; k < MAX_CONTRIBUTORS; k++) {
      if (this.contributors[k] === id) return;
      if (this.contributors[k] < 0) {
        this.contributors[k] = id;
        return;
      }
    }
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.kind)
      .uint32(this.recipe & 0xffff)
      .uint32(this.number);
    h.typedArray(this.needs).typedArray(this.delivered).typedArray(this.reserved);
    h.typedArray(this.contributors).uint32(this.builder);
  }
}

/**
 * A colony: individuals descended from the same founder, sharing a camp, a stock and a
 * blackboard (docs/design/06-ia.md, couche 4). The blackboard is not omniscient: members read and
 * write it only at the camp. All storage is preallocated.
 */
export class Colony {
  /**
   * @param {number} id
   * @param {number} goods
   * @param {object} cfg - balance.colony.
   */
  constructor(id, goods, cfg) {
    this.id = id;
    this.hasCamp = false;
    this.campX = 0;
    this.campY = 0;
    this.members = 0;
    this.births = 0;
    this.deaths = 0;
    /** Goods kept at the camp. */
    this.stock = new Int32Array(goods);
    // Shelters built by members: they are the colony's beds.
    this.shelterX = new Int32Array(256);
    this.shelterY = new Int32Array(256);
    this.shelterCount = 0;
    this.sheltersBuilt = 0;
    // Places deposited by members (one per subject and area, the latest sighting wins).
    const n = cfg.boardCapacity;
    this.boardSubject = new Int16Array(n);
    this.boardX = new Int32Array(n);
    this.boardY = new Int32Array(n);
    this.boardTick = new Int32Array(n);
    this.boardCount = 0;
    /** Contributors of the last project completed (-1 = unused), for the inspector. */
    this.lastProject = new Int32Array(MAX_CONTRIBUTORS).fill(-1);
    /** Open tasks at the last count of the colony system. */
    this.open = 0;
    /** @type {Project[]} */
    this.projects = [];
    for (let i = 0; i < cfg.projectSlots; i++) this.projects.push(new Project(goods));
  }

  /**
   * @param {number} bedsPerShelter
   * @returns {number}
   */
  beds(bedsPerShelter) {
    return this.shelterCount * bedsPerShelter;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  addShelter(x, y) {
    if (this.shelterCount >= this.shelterX.length) return;
    this.shelterX[this.shelterCount] = x;
    this.shelterY[this.shelterCount] = y;
    this.shelterCount++;
    if (!this.hasCamp) {
      this.hasCamp = true;
      this.campX = x;
      this.campY = y;
    }
  }

  /**
   * Writes a sighting on the blackboard: replaces the entry of the same subject within `radius`
   * if this one is more recent, else takes a free slot or the oldest one.
   * @param {number} subject
   * @param {number} x
   * @param {number} y
   * @param {number} tick - When it was seen.
   * @param {number} radius
   * @returns {void}
   */
  post(subject, x, y, tick, radius) {
    let oldest = 0;
    for (let i = 0; i < this.boardCount; i++) {
      if (this.boardTick[i] < this.boardTick[oldest]) oldest = i;
      if (this.boardSubject[i] !== subject) continue;
      if (Math.abs(this.boardX[i] - x) > radius || Math.abs(this.boardY[i] - y) > radius) continue;
      if (tick > this.boardTick[i]) {
        this.boardX[i] = x;
        this.boardY[i] = y;
        this.boardTick[i] = tick;
      }
      return;
    }
    let slot = this.boardCount;
    if (slot < this.boardSubject.length) this.boardCount++;
    else slot = oldest;
    this.boardSubject[slot] = subject;
    this.boardX[slot] = x;
    this.boardY[slot] = y;
    this.boardTick[slot] = tick;
  }

  /**
   * Removes the board entries of a subject around a place (it turned out to be wrong).
   * @param {number} subject
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {void}
   */
  unpost(subject, x, y, radius) {
    for (let i = this.boardCount - 1; i >= 0; i--) {
      if (this.boardSubject[i] !== subject) continue;
      if (Math.abs(this.boardX[i] - x) > radius || Math.abs(this.boardY[i] - y) > radius) continue;
      const last = --this.boardCount;
      this.boardSubject[i] = this.boardSubject[last];
      this.boardX[i] = this.boardX[last];
      this.boardY[i] = this.boardY[last];
      this.boardTick[i] = this.boardTick[last];
    }
  }

  /**
   * Free project slot, or -1.
   * @returns {number}
   */
  freeSlot() {
    return this.projects.findIndex((p) => p.kind === ProjectKind.NONE);
  }

  /**
   * @param {number} kind
   * @returns {number} Slot of the active project of that kind, or -1.
   */
  findProject(kind) {
    for (let i = 0; i < this.projects.length; i++) if (this.projects[i].kind === kind) return i;
    return -1;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.id)
      .uint32(this.hasCamp ? 1 : 0)
      .uint32(this.campX)
      .uint32(this.campY);
    h.uint32(this.members).uint32(this.births).uint32(this.deaths).typedArray(this.stock);
    h.uint32(this.shelterCount).uint32(this.sheltersBuilt);
    h.typedArray(this.shelterX.subarray(0, this.shelterCount));
    h.typedArray(this.shelterY.subarray(0, this.shelterCount));
    const n = this.boardCount;
    h.uint32(n)
      .typedArray(this.boardSubject.subarray(0, n))
      .typedArray(this.boardTick.subarray(0, n));
    h.typedArray(this.boardX.subarray(0, n)).typedArray(this.boardY.subarray(0, n));
    for (const p of this.projects) p.hashInto(h);
  }
}
