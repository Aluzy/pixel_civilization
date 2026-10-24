/** What an agent is doing this tick. */
export const Action = Object.freeze({
  NONE: 0,
  MOVE: 1,
  DRINK: 2,
  FORAGE: 3,
  EAT: 4,
  SLEEP: 5,
  IDLE: 6,
  HARVEST: 7,
  CRAFT: 8,
  EXPERIMENT: 9,
});

/** Display names for the inspector, indexed by {@link Action}. */
export const ACTION_NAMES = Object.freeze([
  'aucune',
  'se déplace',
  'boit',
  'cueille',
  'mange',
  'dort',
  'se repose',
  'récolte',
  'fabrique',
  'expérimente',
]);

/**
 * Actions the agent sees through once started (unless a vital need or an attack interrupts):
 * reconsidering them every few ticks would waste the work done.
 * @param {number} action
 * @returns {boolean}
 */
export function isFocused(action) {
  return action === Action.HARVEST || action === Action.CRAFT || action === Action.EXPERIMENT;
}
