import { hashBits } from '../core/bits.js';
import { TrialNotebook } from '../crafting/notebook.js';

/** Kinds of colony projects. */
export const ProjectKind = Object.freeze({
  NONE: 0,
  SHELTER: 1, // Gather the materials of a shelter in the stock, then build it at the camp.
  PANTRY: 2, // Keep a stock of food at the camp (never finished).
  LIBRARY: 3, // Gather the materials of a library, then build it at the camp.
  FIELD: 4, // Gather berries, then plant them as bushes near the camp.
  TREASURE: 5, // Gather the materials of a treasure room, then build it at the camp.
  ENCLOSURE: 6, // Gather wood (and clay for the gate), then build the wall segment by segment.
  TOWER: 7, // Raise a tower on the wall, beside a gate (one project per tower).
  CANAL: 8, // Gather stone, then dig a canal from the water to a home, tile by tile.
  WORKS: 9, // A work of architecture (paving, a public building…): its tiles laid one by one.
  SHIP: 10, // Gather the materials of a ship, then build it on the shore.
  WELL: 11, // Gather stone, then dig a well among the houses far from water (commoners only).
});

/** Most tiles of one work of architecture. */
export const MAX_WORK_TILES = 256;

/** Most gates of an enclosure (one per side). */
export const MAX_GATES = 4;

/** States of a colony's enclosure. */
export const Enclosure = Object.freeze({
  NONE: 0,
  BUILDING: 1, // Planned: the gate, then the wall, segment by segment.
  CLOSED: 2, // Every tile of the ring is a wall, the gate, the tower or impassable ground.
});

/** Most libraries a colony keeps track of. */
export const MAX_LIBRARIES = 8;

/** Most beds of a colony. */
export const MAX_BEDS = 4096;

/** Most guards a colony keeps at once. */
export const MAX_GUARDS = 12;

/** Most cooks a colony keeps at once. */
export const MAX_COOKS = 8;

/**
 * Colonies a game can hold, living or dead (the living are capped by migration.maxColonies);
 * relation sheets are preallocated for each.
 */
export const MAX_COLONIES = 256;

/** Most members of an expedition. */
export const MAX_EXPEDITION = 12;

/** States of a colony's expedition. */
export const Expedition = Object.freeze({
  NONE: 0,
  RECRUITING: 1, // Posted on the blackboard: members may join at the camp.
  TRAVELLING: 2, // On its way to the site.
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
    /** Units brought by members for this project and not used yet (kept in the stock). */
    this.delivered = new Int32Array(goods);
    this.reserved = new Int32Array(goods);
    this.contributors = new Int32Array(MAX_CONTRIBUTORS).fill(-1);
    /** Agent who took the materials to build, -1 if none yet. */
    this.builder = -1;
    /** Member trying to find out how to build it when nobody knows, and since when. */
    this.researcher = -1;
    this.researcherTick = 0;
    // A work of architecture (decision 0028): which one (index in data/works.json), and its
    // tiles: where, what goes there (a structure code, or −1 − biome for a change of ground),
    // what must be there before (a structure code, or −1 − biome), and how far it is laid.
    this.work = -1;
    this.tileX = new Int32Array(MAX_WORK_TILES);
    this.tileY = new Int32Array(MAX_WORK_TILES);
    this.tileCode = new Int16Array(MAX_WORK_TILES);
    this.tileFrom = new Int16Array(MAX_WORK_TILES);
    this.tileLen = 0;
    this.tileNext = 0;
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
    this.researcher = -1;
    this.work = -1;
    this.tileLen = 0;
    this.tileNext = 0;
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
    h.uint32(this.researcher).uint32(this.researcherTick);
    const n = this.tileLen;
    h.uint32(this.work).uint32(n).uint32(this.tileNext);
    h.typedArray(this.tileX.subarray(0, n)).typedArray(this.tileY.subarray(0, n));
    h.typedArray(this.tileCode.subarray(0, n)).typedArray(this.tileFrom.subarray(0, n));
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
   * @param {{ stabilityDays: number, durabilityDays: number }} [harmonyCfg] - balance.harmony.
   * @param {number} [jobCount=0] - Jobs of data/jobs.json.
   */
  constructor(id, goods, cfg, harmonyCfg = { stabilityDays: 10, durabilityDays: 5 }, jobCount = 0) {
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
    // The beds inside the houses: one sleeper each; a commoner's own bed is kept for it.
    this.bedX = new Int32Array(MAX_BEDS);
    this.bedY = new Int32Array(MAX_BEDS);
    this.bedCount = 0;
    this.bedOwner = new Int32Array(MAX_BEDS).fill(-1);
    /** First bed of the house of each bed, and beds in that house. */
    this.bedHouse = new Int16Array(MAX_BEDS);
    this.houseBeds = new Uint8Array(MAX_BEDS);
    /** Where the search for a free bed starts (beds before it were all owned). */
    this.bedHint = 0;
    // The people (decision 0030): figures alive at the last count, the town's map (derived from
    // the world, redrawn every `mapTicks`), what its figures know how to make (53-bit set of
    // recipes) and the births it can afford (a fraction of a birth carried over).
    this.figures = 0;
    /** @type {import('./town-map.js').TownMap | null} */
    this.map = null;
    this.knowhow = 0;
    this.birthCredit = 0;
    /** What the town lives from (index in data/vocations.json, -1 none), and its next town's. */
    this.vocation = -1;
    this.expVocation = -1;
    // Places deposited by members (one per subject and area, the latest sighting wins).
    const n = cfg.boardCapacity;
    this.boardSubject = new Int16Array(n);
    this.boardX = new Int32Array(n);
    this.boardY = new Int32Array(n);
    this.boardTick = new Int32Array(n);
    this.boardCount = 0;
    // Libraries: position, still standing, abandoned (nobody near for days), last visit.
    this.libraryX = new Int32Array(MAX_LIBRARIES);
    this.libraryY = new Int32Array(MAX_LIBRARIES);
    this.libraryStanding = new Uint8Array(MAX_LIBRARIES);
    this.libraryAbandoned = new Uint8Array(MAX_LIBRARIES);
    /** 1 for a great library (decision 0029): more room, it does not burn, one learns better. */
    this.libraryGreat = new Uint8Array(MAX_LIBRARIES);
    this.libraryVisit = new Int32Array(MAX_LIBRARIES);
    this.libraryCount = 0;
    /** Member who took the task of writing (one scribe at a time), and since when. */
    this.scribe = -1;
    this.scribeTick = 0;
    // Teaching (decision 0029): the master (one at a time), since when, the last tick it taught,
    // where, what it teaches (53-bit set), and the school.
    this.teacher = -1;
    this.teacherTick = 0;
    this.teachTick = -0x40000000;
    this.teachX = 0;
    this.teachY = 0;
    this.lessonMask = 0;
    this.hasSchool = false;
    /** Its ship at the quay (decision 0029), and whether its last expedition crossed water. */
    this.hasShip = false;
    this.shipX = 0;
    this.shipY = 0;
    this.expSailed = false;
    /** Founded beyond water (an island, another shore). */
    this.overseas = false;
    this.schoolX = 0;
    this.schoolY = 0;
    /** Guards (docs/design/16-guerre-et-forteresses.md): -1 for a free post, and since when. */
    this.guards = new Int32Array(MAX_GUARDS).fill(-1);
    this.guardTick = new Int32Array(MAX_GUARDS);
    /** Last tick a member was attacked near the camp; no new den before `denQuietUntil`. */
    this.lastThreat = -0x40000000;
    this.denQuietUntil = 0;
    /** Member who experiments freely when curious (one at a time), and since when. */
    this.inventor = -1;
    this.inventorTick = 0;
    /** Failed trials of its inventors, handed from one to the next. */
    this.notebook = new TrialNotebook(cfg.notebookSize ?? 256);
    /** Contributors of the last project completed (-1 = unused), for the inspector. */
    this.lastProject = new Int32Array(MAX_CONTRIBUTORS).fill(-1);
    /** Open tasks at the last count of the colony system. */
    this.open = 0;
    // Harmony (docs/design/07-harmonie.md): score then 6 components, weakest component, daily
    // population, last death of hunger or thirst, harvests and regrowths of the last days.
    this.harmony = new Float64Array(7);
    /** Weakest component (index in COMPONENT_IDS), -1 before the first count. */
    this.focus = -1;
    this.popHistory = new Int32Array(harmonyCfg.stabilityDays);
    this.popDays = 0;
    this.lastStarvation = -0x40000000;
    /** Deaths of hunger or thirst today, and on each of the last days (newest last). */
    this.starvedToday = 0;
    this.starvedDays = new Int32Array(harmonyCfg.famineDays ?? 3);
    this.resourceSlots = goods;
    this.harvested = new Int32Array(harmonyCfg.durabilityDays * goods);
    this.regrown = new Int32Array(harmonyCfg.durabilityDays * goods);
    /** Sources planted by the colony, fields planted, and when the last one was. */
    this.planted = 0;
    this.fields = 0;
    this.lastField = -0x40000000;
    /** Pantry target multiplier: higher when stability or well-being is the weakest point. */
    this.pantryBoost = 1;
    // Farming and cooking (docs/design/13-agriculture-cuisine.md): free farm jobs at the last
    // count, plots and crop harvests, cooks (-1 for a free post) and since when.
    this.farmOpen = 0;
    /** Members gleaning wild grain for seeds, at the last count. */
    this.gleaning = 0;
    this.plots = 0;
    this.cropHarvests = 0;
    this.withered = 0;
    this.cooks = new Int32Array(MAX_COOKS).fill(-1);
    this.cookTick = new Int32Array(MAX_COOKS);
    // Meals: nutrition eaten, the part of it that came from crops, dishes eaten; in all and today.
    this.eaten = 0;
    this.eatenCrop = 0;
    this.dishes = 0;
    this.eatenToday = 0;
    this.cropToday = 0;
    this.dishesToday = 0;
    this.eatenYesterday = 0;
    this.cropYesterday = 0;
    this.dishesYesterday = 0;
    /** Food in the stock (portions) at the start of each of the last days, newest last. */
    this.pantryDays = new Int32Array(4);
    // The counter (docs/design/14-economie.md): reference price, average daily use and today's
    // flows of each good; the treasury and the écus minted in all; food given to those who could
    // not pay; first sale and purchase of each good, and who sold it last; units sold and
    // bought per job (index 0: no job) and good; members per job, and jobs that had a holder.
    this.price = new Float64Array(goods);
    this.useAvg = new Float64Array(goods);
    this.outToday = new Int32Array(goods);
    this.inToday = new Int32Array(goods);
    this.treasury = 0;
    this.minted = 0;
    this.rations = 0;
    this.firstSold = new Uint8Array(goods);
    this.firstBought = new Uint8Array(goods);
    this.lastSeller = new Int32Array(goods).fill(-1);
    /** Units its researchers asked the counter for (a demand, until the stock holds them). */
    this.demand = new Int32Array(goods);
    this.sold = new Int32Array((jobCount + 1) * goods);
    this.bought = new Int32Array((jobCount + 1) * goods);
    this.jobHolders = new Int32Array(Math.max(1, jobCount));
    this.jobFirst = new Uint8Array(Math.max(1, jobCount));
    // Migration (docs/design/15-colonies-et-migration.md): the colony it was founded from (-1 for
    // the first) and when; its expedition (state, leader, site, members, since when), the last one
    // and the member scouting for a site.
    this.parent = -1;
    this.foundedTick = 0;
    this.expState = Expedition.NONE;
    this.expLeader = -1;
    this.expX = 0;
    this.expY = 0;
    this.expTick = 0;
    this.expMembers = new Int32Array(MAX_EXPEDITION).fill(-1);
    this.lastExpedition = -0x40000000;
    this.scout = -1;
    this.scoutTick = 0;
    // Relation sheets, one per other colony: known, its camp, kin, meetings of members, trades,
    // its counter's prices as last brought back, and when.
    this.relKnown = new Uint8Array(MAX_COLONIES);
    this.relCampX = new Int32Array(MAX_COLONIES);
    this.relCampY = new Int32Array(MAX_COLONIES);
    this.relKin = new Uint8Array(MAX_COLONIES);
    this.relMeetings = new Int32Array(MAX_COLONIES);
    this.relTrades = new Int32Array(MAX_COLONIES);
    this.relPrice = new Float64Array(MAX_COLONIES * goods);
    this.relPriceTick = new Int32Array(MAX_COLONIES).fill(-1);
    // Fortress (docs/design/16-guerre-et-forteresses.md, « Trésors et forteresses »): danger
    // felt at the camp (days with an attack, fading), the treasure room, the enclosure (a
    // rectangle ring: corners, gate, tower, open tiles left, when planned and closed) and the
    // predators that got inside once it was closed.
    this.danger = 0;
    this.hasTreasure = false;
    this.treasureX = 0;
    this.treasureY = 0;
    this.encState = Enclosure.NONE;
    this.encX0 = 0;
    this.encY0 = 0;
    this.encX1 = 0;
    this.encY1 = 0;
    /** Gates: one in the middle of each side where one can stand; bit i set once gate i stands. */
    this.gateX = new Int32Array(MAX_GATES);
    this.gateY = new Int32Array(MAX_GATES);
    this.gateCount = 0;
    this.gatesBuilt = 0;
    /** True once every gate stands (then the wall goes up). */
    this.gateBuilt = false;
    /** Towers: one beside each gate, on the wall; bit i set once tower i stands. */
    this.towerX = new Int32Array(MAX_GATES);
    this.towerY = new Int32Array(MAX_GATES);
    this.towerCount = 0;
    this.towersBuilt = 0;
    this.encOpen = 0;
    this.encTotal = 0;
    this.encTick = 0;
    this.encClosedTick = 0;
    this.breaches = 0;
    // Canals (decision 0027): the route being dug, from the water's end, and how far it is dug.
    this.canalX = new Int32Array(64);
    this.canalY = new Int32Array(64);
    this.canalLen = 0;
    this.canalNext = 0;
    /** True if the canal being dug goes to the camp (it ends in a fountain on the square). */
    this.canalToCamp = false;
    /** Canal tiles dug, and canals traced, since the start. */
    this.canalTiles = 0;
    this.canalsPlanned = 0;
    // Architecture (decision 0028): the works done (bit per work of data/works.json that is
    // done once), the colonies a road joins it to (bit per colony), the day the last work was
    // opened, and what the town looked like at the last count, for the beauty of its harmony.
    this.worksDone = 0;
    /** Times each work was opened: the least done comes first. */
    this.worksCount = new Int16Array(16);
    this.roads = new Uint8Array(MAX_COLONIES);
    this.lastWork = -0x40000000;
    this.beautyCounts = new Int32Array(8);
    /** @type {Project[]} */
    this.projects = [];
    for (let i = 0; i < cfg.projectSlots; i++) this.projects.push(new Project(goods));
  }

  /**
   * @returns {boolean} True if the stock holds less food than some days ago (it is being eaten
   *   faster than it is brought in).
   */
  pantryFalling() {
    const d = this.pantryDays;
    return d[d.length - 1] < d[0];
  }

  /**
   * How far (x, y) lies from the colony's home, for its fields: from the camp, or from its walls
   * once it has an enclosure (the fields lie around it).
   * @param {number} x
   * @param {number} y
   * @returns {number} Chebyshev distance.
   */
  fieldDistance(x, y) {
    if (this.encState === Enclosure.NONE) {
      return Math.max(Math.abs(x - this.campX), Math.abs(y - this.campY));
    }
    const dx = x < this.encX0 ? this.encX0 - x : x > this.encX1 ? x - this.encX1 : 0;
    const dy = y < this.encY0 ? this.encY0 - y : y > this.encY1 ? y - this.encY1 : 0;
    return Math.max(dx, dy);
  }

  /** @returns {boolean} True once a tower stands on the wall. */
  get hasTower() {
    return this.towersBuilt !== 0;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} Index of the tower planned on (x, y), or -1.
   */
  towerAt(x, y) {
    for (let i = 0; i < this.towerCount; i++) {
      if (this.towerX[i] === x && this.towerY[i] === y) return i;
    }
    return -1;
  }

  /** @returns {number} Beds in the colony's houses. */
  beds() {
    return this.bedCount;
  }

  /**
   * A house, by its door; the first one sets the camp, at (campX, campY) before its door.
   * @param {number} x
   * @param {number} y
   * @param {number} [campX=x]
   * @param {number} [campY=y]
   * @returns {void}
   */
  addShelter(x, y, campX = x, campY = y) {
    if (this.shelterCount >= this.shelterX.length) return;
    this.shelterX[this.shelterCount] = x;
    this.shelterY[this.shelterCount] = y;
    this.shelterCount++;
    if (!this.hasCamp) {
      this.hasCamp = true;
      this.campX = campX;
      this.campY = campY;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  addBed(x, y) {
    if (this.bedCount >= this.bedX.length) return;
    this.bedX[this.bedCount] = x;
    this.bedY[this.bedCount] = y;
    this.bedHouse[this.bedCount] = this.bedCount;
    this.houseBeds[this.bedCount] = 1;
    this.bedCount++;
  }

  /**
   * The beds just added, from `first` on, make one house.
   * @param {number} first
   * @returns {void}
   */
  closeHouse(first) {
    for (let k = first; k < this.bedCount; k++) {
      this.bedHouse[k] = first;
      this.houseBeds[k] = this.bedCount - first;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} tick
   * @param {boolean} [great=false] - A great library.
   * @returns {number} Library index, -1 if the colony has too many.
   */
  addLibrary(x, y, tick, great = false) {
    if (this.libraryCount >= MAX_LIBRARIES) return -1;
    const i = this.libraryCount++;
    this.libraryGreat[i] = great ? 1 : 0;
    this.libraryX[i] = x;
    this.libraryY[i] = y;
    this.libraryStanding[i] = 1;
    this.libraryAbandoned[i] = 0;
    this.libraryVisit[i] = tick;
    return i;
  }

  /**
   * Nearest standing library to (x, y), or -1.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  nearestLibrary(x, y) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.libraryCount; i++) {
      if (this.libraryStanding[i] !== 1) continue;
      const d = Math.max(Math.abs(this.libraryX[i] - x), Math.abs(this.libraryY[i] - y));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** @returns {number} Libraries still standing. */
  librariesStanding() {
    let n = 0;
    for (let i = 0; i < this.libraryCount; i++) n += this.libraryStanding[i];
    return n;
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
    h.uint32(this.bedCount).typedArray(this.bedX.subarray(0, this.bedCount));
    h.typedArray(this.bedY.subarray(0, this.bedCount));
    h.typedArray(this.bedOwner.subarray(0, this.bedCount)).uint32(this.bedHint);
    h.typedArray(this.bedHouse.subarray(0, this.bedCount));
    hashBits(h.uint32(this.figures), this.knowhow).uint32(Math.round(this.birthCredit * 1000));
    h.uint32(this.map === null ? -1 : this.map.builtTick);
    h.uint32(this.vocation & 0xff).uint32(this.expVocation & 0xff);
    const n = this.boardCount;
    h.uint32(n)
      .typedArray(this.boardSubject.subarray(0, n))
      .typedArray(this.boardTick.subarray(0, n));
    h.typedArray(this.boardX.subarray(0, n)).typedArray(this.boardY.subarray(0, n));
    h.uint32(this.scribe).uint32(this.scribeTick).uint32(this.inventor).uint32(this.inventorTick);
    h.uint32(this.teacher).uint32(this.teacherTick).uint32(this.teachTick);
    hashBits(h.uint32(this.teachX).uint32(this.teachY), this.lessonMask);
    h.uint32(this.hasSchool ? 1 : 0)
      .uint32(this.schoolX)
      .uint32(this.schoolY);
    h.uint32(this.hasShip ? 1 : 0)
      .uint32(this.shipX)
      .uint32(this.shipY);
    h.uint32(this.expSailed ? 1 : 0).uint32(this.overseas ? 1 : 0);
    this.notebook.hashInto(h);
    h.typedArray(this.guards).typedArray(this.guardTick);
    h.uint32(this.lastThreat).uint32(this.denQuietUntil);
    const L = this.libraryCount;
    h.uint32(L).typedArray(this.libraryX.subarray(0, L)).typedArray(this.libraryY.subarray(0, L));
    h.typedArray(this.libraryStanding.subarray(0, L));
    h.typedArray(this.libraryAbandoned.subarray(0, L)).typedArray(this.libraryGreat.subarray(0, L));
    h.typedArray(this.libraryVisit.subarray(0, L));
    for (const p of this.projects) p.hashInto(h);
    h.typedArray(this.harmony).uint32(this.focus & 0xff);
    h.typedArray(this.popHistory).uint32(this.popDays).uint32(this.lastStarvation);
    h.uint32(this.starvedToday).typedArray(this.starvedDays);
    h.typedArray(this.harvested).typedArray(this.regrown).uint32(this.planted);
    h.uint32(Math.round(this.pantryBoost * 1000))
      .uint32(this.fields)
      .uint32(this.lastField);
    h.uint32(this.farmOpen).uint32(this.plots).uint32(this.cropHarvests).uint32(this.withered);
    h.typedArray(this.cooks).typedArray(this.cookTick);
    h.uint32(Math.round(this.eaten))
      .uint32(Math.round(this.eatenCrop * 100))
      .uint32(this.dishes);
    h.uint32(Math.round(this.eatenToday)).uint32(Math.round(this.cropToday * 100));
    h.uint32(this.dishesToday).typedArray(this.pantryDays);
    h.uint32(Math.round(this.eatenYesterday)).uint32(Math.round(this.cropYesterday * 100));
    h.uint32(this.dishesYesterday);
    h.typedArray(this.price).typedArray(this.useAvg).typedArray(this.outToday);
    h.typedArray(this.inToday).uint32(this.treasury).uint32(this.minted).uint32(this.rations);
    h.typedArray(this.firstSold).typedArray(this.firstBought).typedArray(this.lastSeller);
    h.typedArray(this.demand);
    h.typedArray(this.sold).typedArray(this.bought).typedArray(this.jobHolders);
    h.typedArray(this.jobFirst);
    h.uint32(this.parent).uint32(this.foundedTick).uint32(this.expState).uint32(this.expLeader);
    h.uint32(this.expX).uint32(this.expY).uint32(this.expTick).typedArray(this.expMembers);
    h.uint32(this.lastExpedition).uint32(this.scout).uint32(this.scoutTick);
    h.typedArray(this.relKnown).typedArray(this.relCampX).typedArray(this.relCampY);
    h.typedArray(this.relKin).typedArray(this.relMeetings).typedArray(this.relTrades);
    h.typedArray(this.relPrice).typedArray(this.relPriceTick);
    h.uint32(Math.round(this.danger * 1000)).uint32(this.hasTreasure ? 1 : 0);
    h.uint32(this.treasureX).uint32(this.treasureY).uint32(this.encState);
    h.uint32(this.encX0).uint32(this.encY0).uint32(this.encX1).uint32(this.encY1);
    h.typedArray(this.gateX).typedArray(this.gateY).uint32(this.gateCount);
    h.uint32(this.gatesBuilt).uint32(this.gateBuilt ? 1 : 0);
    h.typedArray(this.towerX).typedArray(this.towerY);
    h.uint32(this.towerCount).uint32(this.towersBuilt);
    h.uint32(this.encOpen).uint32(this.encTotal).uint32(this.encTick);
    h.uint32(this.encClosedTick).uint32(this.breaches).uint32(this.gleaning);
    h.uint32(this.canalLen).uint32(this.canalNext).uint32(this.canalTiles);
    h.uint32(this.canalToCamp ? 1 : 0);
    h.uint32(this.worksDone).typedArray(this.roads).uint32(this.lastWork);
    h.typedArray(this.beautyCounts).typedArray(this.worksCount);
    h.uint32(this.canalsPlanned).typedArray(this.canalX.subarray(0, this.canalLen));
    h.typedArray(this.canalY.subarray(0, this.canalLen));
  }

  /**
   * True if (x, y) is strictly inside the enclosure's ring.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  inside(x, y) {
    return (
      this.encState !== Enclosure.NONE &&
      x > this.encX0 &&
      x < this.encX1 &&
      y > this.encY0 &&
      y < this.encY1
    );
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} Index of the gate at (x, y), or -1.
   */
  gateAt(x, y) {
    for (let i = 0; i < this.gateCount; i++) {
      if (this.gateX[i] === x && this.gateY[i] === y) return i;
    }
    return -1;
  }

  /**
   * True if (x, y) is a tile of the enclosure's ring.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  onRing(x, y) {
    if (this.encState === Enclosure.NONE) return false;
    if (x < this.encX0 || x > this.encX1 || y < this.encY0 || y > this.encY1) return false;
    return x === this.encX0 || x === this.encX1 || y === this.encY0 || y === this.encY1;
  }

  /**
   * @param {number} id
   * @returns {boolean} True if the agent is in the colony's expedition.
   */
  inExpedition(id) {
    if (this.expState === Expedition.NONE) return false;
    for (let k = 0; k < MAX_EXPEDITION; k++) if (this.expMembers[k] === id) return true;
    return false;
  }

  /**
   * Units of a good in the stock that no building project has claimed.
   * @param {number} good
   * @returns {number}
   */
  freeStock(good) {
    let n = this.stock[good];
    for (const p of this.projects) {
      if (p.kind !== ProjectKind.NONE && p.kind !== ProjectKind.PANTRY) n -= p.delivered[good];
    }
    return n > 0 ? n : 0;
  }

  /** @returns {number} Members of the expedition. */
  expeditionSize() {
    let n = 0;
    for (let k = 0; k < MAX_EXPEDITION; k++) if (this.expMembers[k] >= 0) n++;
    return n;
  }

  /** @returns {void} */
  clearExpedition() {
    this.expSailed = false;
    this.expState = Expedition.NONE;
    this.expLeader = -1;
    this.expMembers.fill(-1);
  }
}
