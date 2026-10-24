import { describeTick } from '../sim/core/clock.js';
import { EventType } from '../sim/core/events.js';

/**
 * @param {number} subject - Memory subject: 0 = water, else a resource id.
 * @param {{ resources: { name: string }[] }} tables
 * @returns {string} E.g. "un point d’eau", "un lieu de baies".
 */
export function placeName(subject, tables) {
  if (subject === 0) return 'un point d’eau';
  const name = tables?.resources[subject - 1]?.name ?? 'ressource';
  return `un lieu de ${name.toLowerCase()}`;
}

/**
 * @param {number} subject
 * @returns {string} What the agent looks for: "de l’eau" or "de quoi manger".
 */
function needName(subject) {
  return subject === 0 ? 'de l’eau' : 'de quoi manger';
}

// Memory events read their words from a small context: who, where, which place, which need.
const MEMORY_TEXT = {
  [EventType.FORGOT_PLACE]: (c) => `${c.who} a oublié ${c.place} ${c.where}.`,
  [EventType.WRONG_BELIEF]: (c) => `${c.who} se trompait : plus rien ${c.where}.`,
  [EventType.NOT_FOUND]: (c) => `${c.who} ne retrouve pas ${c.place} dont il se souvenait.`,
  [EventType.SEARCHING]: (c) => `${c.who} cherche ${c.need} sans savoir où.`,
  [EventType.REDISCOVERED]: (c) => `${c.who} retrouve ${c.place} oublié ${c.where}.`,
};

const TEXT = {
  [EventType.BIRTH]: (who) => `Premier pas de ${who}.`,
  [EventType.FIRST_DRINK]: (who) => `Première gorgée d’eau de ${who}.`,
  [EventType.FIRST_MEAL]: (who) => `Premier repas de ${who}.`,
  [EventType.FIRST_SLEEP]: (who) => `Premier sommeil de ${who}.`,
  [EventType.HEALTH_CRITICAL]: (who) => `Santé critique pour ${who} !`,
  [EventType.DEATH]: (who) => `Mort de ${who}.`,
};

/**
 * Day and time of a tick, compact: "J3 07:05".
 * @param {number} tick
 * @param {import('../sim/core/clock.js').TimeConfig} time
 * @returns {string}
 */
export function shortClock(tick, time) {
  const t = describeTick(tick, time);
  return `J${t.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/**
 * One chronicle line for an event.
 * @param {import('../sim/core/events.js').SimEvent} event
 * @param {import('../sim/core/clock.js').TimeConfig} time
 * @param {{ resources: { name: string }[] }} [tables] - For resource names.
 * @returns {string}
 */
export function formatEvent(event, time, tables) {
  const who = `l’individu #${event.agent}`;
  const where = `(${event.x}, ${event.y})`;
  const memoryText = MEMORY_TEXT[event.type];
  const context = {
    who,
    where,
    place: placeName(event.subject, tables),
    need: needName(event.subject),
  };
  const text = memoryText ? memoryText(context) : (TEXT[event.type]?.(who) ?? event.type);
  return `${shortClock(event.tick, time)} · ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
