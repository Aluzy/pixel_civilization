/** Kinds of written documents. */
export const DocKind = Object.freeze({ NONE: 0, BOOK: 1, MAP: 2 });

/**
 * Books and maps (docs/design/05-savoir.md): each one is an object with its own content, carried
 * by an agent or kept in a library. A book holds recipes (possibly wrong ones: one can only write
 * what one believes); a map holds dated places. All storage is preallocated.
 */
export class DocumentStore {
  /**
   * @param {number} max
   * @param {number} mapEntries
   */
  constructor(max, mapEntries) {
    this.max = max;
    this.mapEntries = mapEntries;
    this.kind = new Uint8Array(max);
    /** Agent carrying it, or -1. */
    this.holder = new Int32Array(max).fill(-1);
    /** Colony and library index where it is kept, or -1. */
    this.colony = new Int16Array(max).fill(-1);
    this.library = new Int16Array(max).fill(-1);
    /** Bit sets of recipes written, and of those written wrong. */
    this.recipes = new Int32Array(max);
    this.wrong = new Int32Array(max);
    this.author = new Int32Array(max).fill(-1);
    this.made = new Int32Array(max);
    // Map entries: subject, position and date of observation.
    this.entryCount = new Uint16Array(max);
    this.entrySubject = new Int16Array(max * mapEntries);
    this.entryX = new Int32Array(max * mapEntries);
    this.entryY = new Int32Array(max * mapEntries);
    this.entryTick = new Int32Array(max * mapEntries);
    this.count = 0;
  }

  /**
   * A new blank document carried by `holder`.
   * @param {number} kind
   * @param {number} holder
   * @param {number} tick
   * @returns {number} Id, or -1 if full.
   */
  create(kind, holder, tick) {
    let id = 0;
    while (id < this.max && this.kind[id] !== DocKind.NONE) id++;
    if (id >= this.max) return -1;
    this.kind[id] = kind;
    this.holder[id] = holder;
    this.colony[id] = -1;
    this.library[id] = -1;
    this.recipes[id] = 0;
    this.wrong[id] = 0;
    this.author[id] = -1;
    this.made[id] = tick;
    this.entryCount[id] = 0;
    this.count++;
    return id;
  }

  /**
   * @param {number} id
   * @returns {void}
   */
  destroy(id) {
    if (this.kind[id] === DocKind.NONE) return;
    this.kind[id] = DocKind.NONE;
    this.holder[id] = -1;
    this.library[id] = -1;
    this.count--;
  }

  /**
   * First document of `kind` carried by `holder` that still has room, or -1.
   * @param {number} holder
   * @param {number} kind
   * @param {number} room - Recipes (books) or entries (maps) a document holds at most.
   * @returns {number}
   */
  carried(holder, kind, room) {
    for (let id = 0; id < this.max; id++) {
      if (this.kind[id] !== kind || this.holder[id] !== holder) continue;
      if (kind === DocKind.BOOK && popcount(this.recipes[id]) >= room) continue;
      if (kind === DocKind.MAP && this.entryCount[id] >= room) continue;
      return id;
    }
    return -1;
  }

  /**
   * Bit set of recipes written in the documents kept in a library (and wrongly written ones), and
   * when its newest map was made.
   * @param {number} colony
   * @param {number} library
   * @param {Int32Array} out - Receives recipes, wrong, and the newest map's tick (-1 if none).
   * @returns {number} Documents there.
   */
  libraryContent(colony, library, out) {
    let n = 0;
    out[0] = 0;
    out[1] = 0;
    out[2] = -1;
    for (let id = 0; id < this.max; id++) {
      if (this.kind[id] === DocKind.NONE) continue;
      if (this.colony[id] !== colony || this.library[id] !== library) continue;
      n++;
      out[0] |= this.recipes[id];
      out[1] |= this.wrong[id];
      if (this.kind[id] === DocKind.MAP && this.made[id] > out[2]) out[2] = this.made[id];
    }
    return n;
  }

  /**
   * @param {import('../core/hash.js').Hasher} h
   * @returns {void}
   */
  hashInto(h) {
    h.uint32(this.count);
    for (let id = 0; id < this.max; id++) {
      if (this.kind[id] === DocKind.NONE) continue;
      h.uint32(id).uint32(this.kind[id]).uint32(this.holder[id]).uint32(this.library[id]);
      h.uint32(this.colony[id] & 0xffff)
        .uint32(this.recipes[id])
        .uint32(this.wrong[id]);
      h.uint32(this.entryCount[id]);
      const e0 = id * this.mapEntries;
      const e1 = e0 + this.entryCount[id];
      h.typedArray(this.entrySubject.subarray(e0, e1)).typedArray(this.entryX.subarray(e0, e1));
      h.typedArray(this.entryY.subarray(e0, e1)).typedArray(this.entryTick.subarray(e0, e1));
    }
  }
}

/**
 * @param {number} m
 * @returns {number} Number of bits set.
 */
export function popcount(m) {
  let n = 0;
  for (let v = m; v !== 0; v &= v - 1) n++;
  return n;
}
