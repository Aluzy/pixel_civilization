/**
 * Notable events, kept in the simulation state. The renderer turns them into the chronicle and
 * "skip to next event" stops on them. Events are facts, never scripts: they only record what the
 * rules produced.
 */
export const EventType = Object.freeze({
  BIRTH: 'birth',
  FIRST_DRINK: 'firstDrink',
  FIRST_MEAL: 'firstMeal',
  FIRST_SLEEP: 'firstSleep',
  HEALTH_CRITICAL: 'healthCritical',
  DEATH: 'death',
});

/** Events kept in memory; older ones are dropped (the count keeps growing). */
const MAX_EVENTS = 500;

/**
 * @typedef {object} SimEvent
 * @property {number} seq - Rank since the start of the game, from 0.
 * @property {number} tick
 * @property {string} type - One of {@link EventType}.
 * @property {number} agent - Entity id concerned, or -1.
 * @property {number} x
 * @property {number} y
 */

export class EventLog {
  constructor() {
    /** @type {SimEvent[]} */
    this.events = [];
    /** Total number of events ever recorded. */
    this.count = 0;
  }

  /**
   * @param {number} tick
   * @param {string} type
   * @param {number} agent
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  push(tick, type, agent, x, y) {
    this.events.push({ seq: this.count++, tick, type, agent, x, y });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  /**
   * Events with seq ≥ `from`, oldest first.
   * @param {number} from
   * @returns {SimEvent[]}
   */
  since(from) {
    return this.events.filter((e) => e.seq >= from);
  }
}
