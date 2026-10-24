import { describeTick } from '../sim/core/clock.js';
import { EventType } from '../sim/core/events.js';

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
 * @returns {string}
 */
export function formatEvent(event, time) {
  const who = `l’individu #${event.agent}`;
  const text = TEXT[event.type]?.(who) ?? event.type;
  return `${shortClock(event.tick, time)} · ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
