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
  FORGOT_PLACE: 'forgotPlace',
  WRONG_BELIEF: 'wrongBelief',
  SEARCHING: 'searching',
  NOT_FOUND: 'notFound',
  REDISCOVERED: 'rediscovered',
  DISCOVERED: 'discovered',
  FORGOT_RECIPE: 'forgotRecipe',
  CRAFTED: 'crafted',
  BUILT: 'built',
  SHELTERED_SLEEP: 'shelteredSleep',
  PROJECT_DONE: 'projectDone',
  ATTACKED: 'attacked',
  PREDATOR_KILLED: 'predatorKilled',
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
 * @property {number} subject - What the event is about: memory subject (water = 0, resource id,
 *   structure), recipe index for crafting events, project index, or -1.
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
   * @param {number} [subject=-1]
   * @returns {void}
   */
  push(tick, type, agent, x, y, subject = -1) {
    this.events.push({ seq: this.count++, tick, type, agent, x, y, subject });
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
