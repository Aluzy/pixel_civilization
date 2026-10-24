/** What an agent is doing this tick. */
export const Action = Object.freeze({
  NONE: 0,
  MOVE: 1,
  DRINK: 2,
  FORAGE: 3,
  EAT: 4,
  SLEEP: 5,
  IDLE: 6,
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
]);
