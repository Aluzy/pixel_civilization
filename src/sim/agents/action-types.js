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
  DEPOSIT: 10,
  TAKE: 11,
  REPLICATE: 12,
  WRITE: 13,
  READ: 14,
  STORE: 15,
  PLANT: 16,
  ATTACK: 17,
  WATER: 18,
  SOW: 19,
  STOCK: 20,
  FETCH: 21,
  BUILD: 22,
  TEACH: 23,
  LEARN: 24,
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
  'dépose à la réserve',
  'prend à la réserve',
  'se réplique',
  'écrit',
  'lit',
  'range à la bibliothèque',
  'plante',
  'combat',
  'arrose',
  'sème',
  'range à la réserve',
  'prend des ingrédients',
  'bâtit un mur',
  'enseigne',
  'apprend',
]);

/**
 * Actions the agent sees through once started (unless a vital need or an attack interrupts):
 * reconsidering them every few ticks would waste the work done. A meal or a drink is taken in
 * full, not by mouthfuls between errands.
 * @param {number} action
 * @returns {boolean}
 */
export function isFocused(action) {
  return (
    action === Action.HARVEST ||
    action === Action.DRINK ||
    action === Action.EAT ||
    action === Action.FORAGE ||
    action === Action.CRAFT ||
    action === Action.EXPERIMENT ||
    action === Action.REPLICATE ||
    action === Action.WRITE ||
    action === Action.READ ||
    action === Action.BUILD ||
    action === Action.TEACH ||
    action === Action.LEARN
  );
}
