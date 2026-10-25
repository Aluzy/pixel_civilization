/** Number of competing goals recorded with each decision. */
export const JOURNAL_TOP = 3;

/**
 * @typedef {object} JournalEntry
 * @property {number} tick
 * @property {number} goal - Goal index chosen.
 * @property {Int8Array} top - Best goals considered, best first (-1 = unused).
 * @property {Float64Array} topScore
 * @property {number} action - Action started (see actions.js).
 * @property {number} targetX
 * @property {number} targetY
 * @property {number} note - Why this plan (see {@link PlanNote}).
 */

/** Short reason codes explaining a plan, displayed by the inspector. */
export const PlanNote = Object.freeze({
  NONE: 0,
  SEEN: 1, // Target currently visible.
  REMEMBERED: 2, // Heading to a remembered place.
  SEARCHING: 3, // Nothing known: exploring to find it.
  HERE: 4, // Already at the right place.
  CARRIED: 5, // Using what the agent carries.
  PLAN: 6, // Next step of a GOAP plan.
  TRIAL: 7, // Trying a combination to discover a recipe.
  FLEEING: 8, // Running away from a predator.
  SHELTER: 9, // Going to (or staying in) its shelter.
  COLONY: 10, // Working on a colony task.
  REPLICATION: 11, // Preparing or doing a replication.
  PANTRY: 12, // Taking food from the colony's stock.
  WRITING: 13, // Writing a book or a map, or storing it.
  READING: 14, // Reading in the library.
});

/**
 * Fixed-size ring of recent decisions of one agent, preallocated so that recording a decision
 * never allocates.
 */
export class Journal {
  /**
   * @param {number} size
   */
  constructor(size) {
    /** @type {JournalEntry[]} */
    this.entries = [];
    for (let i = 0; i < size; i++) {
      this.entries.push({
        tick: 0,
        goal: -1,
        top: new Int8Array(JOURNAL_TOP).fill(-1),
        topScore: new Float64Array(JOURNAL_TOP),
        action: 0,
        targetX: 0,
        targetY: 0,
        note: 0,
      });
    }
    this.next = 0;
    this.count = 0;
  }

  /**
   * Records a decision. `scores` holds one score per goal.
   * @param {number} tick
   * @param {number} goal
   * @param {Float64Array} scores
   * @param {number} action
   * @param {number} targetX
   * @param {number} targetY
   * @param {number} note
   * @returns {void}
   */
  record(tick, goal, scores, action, targetX, targetY, note) {
    const e = this.entries[this.next];
    e.tick = tick;
    e.goal = goal;
    e.action = action;
    e.targetX = targetX;
    e.targetY = targetY;
    e.note = note;
    // Partial selection of the best goals, without sorting or allocating.
    e.top.fill(-1);
    for (let k = 0; k < JOURNAL_TOP; k++) {
      let best = -1;
      for (let g = 0; g < scores.length; g++) {
        let used = false;
        for (let j = 0; j < k; j++) if (e.top[j] === g) used = true;
        if (!used && (best < 0 || scores[g] > scores[best])) best = g;
      }
      e.top[k] = best;
      e.topScore[k] = best < 0 ? 0 : scores[best];
    }
    this.next = (this.next + 1) % this.entries.length;
    if (this.count < this.entries.length) this.count++;
  }

  /**
   * Most recent entries first, as plain copies (for the inspector, not for hot loops).
   * @param {number} n
   * @returns {{ tick: number, goal: number, top: number[], topScore: number[], action: number,
   *   targetX: number, targetY: number, note: number }[]}
   */
  latest(n) {
    const out = [];
    const size = this.entries.length;
    for (let i = 0; i < Math.min(n, this.count); i++) {
      const e = this.entries[(this.next - 1 - i + size) % size];
      out.push({
        tick: e.tick,
        goal: e.goal,
        top: [...e.top],
        topScore: [...e.topScore],
        action: e.action,
        targetX: e.targetX,
        targetY: e.targetY,
        note: e.note,
      });
    }
    return out;
  }
}
