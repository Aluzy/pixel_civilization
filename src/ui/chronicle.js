import { describeTick } from '../sim/core/clock.js';
import { EventType } from '../sim/core/events.js';
import { subjectLabel } from './names.js';

/**
 * @param {number} subject - Memory subject: 0 = water, a resource id, or a structure.
 * @param {import('./names.js').Names} [names]
 * @returns {string} E.g. "un point d’eau", "un lieu de baies", "son abri".
 */
export function placeName(subject, names) {
  if (subject === 0) return 'un point d’eau';
  if (!names || subject < 0) return 'un lieu';
  const label = subjectLabel(subject, names).toLowerCase();
  return subject <= names.resources.length ? `un lieu de ${label}` : `son ${label}`;
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

// Crafting and project events name a recipe (what it makes) or a project.
const MAKING_TEXT = {
  [EventType.DISCOVERED]: (c) => `${c.who} découvre comment faire : ${c.thing}.`,
  [EventType.TOLD]: (c) => `${c.who} apprend de vive voix comment faire : ${c.thing}.`,
  [EventType.IMITATED]: (c) => `${c.who} apprend en regardant faire : ${c.thing}.`,
  [EventType.MISTAKEN]: (c) => `${c.who} avait mal compris comment faire : ${c.thing}.`,
  [EventType.FORGOT_RECIPE]: (c) => `${c.who} a oublié comment faire : ${c.thing}.`,
  [EventType.CRAFTED]: (c) => `${c.who} fabrique : ${c.thing}.`,
  [EventType.BUILT]: (c) => `${c.who} bâtit : ${c.thing} ${c.where}.`,
  [EventType.PROJECT_DONE]: (c) => `${c.who} achève son projet « ${c.project} ».`,
};

const TEXT = {
  [EventType.BIRTH]: (who) => `Premier pas de ${who}.`,
  [EventType.FIRST_DRINK]: (who) => `Première gorgée d’eau de ${who}.`,
  [EventType.FIRST_MEAL]: (who) => `Premier repas de ${who}.`,
  [EventType.FIRST_SLEEP]: (who) => `Premier sommeil de ${who}.`,
  [EventType.SHELTERED_SLEEP]: (who) => `Première nuit à l’abri pour ${who}.`,
  [EventType.HEALTH_CRITICAL]: (who) => `Santé critique pour ${who} !`,
  [EventType.ATTACKED]: (who) => `Un prédateur attaque ${who} !`,
  [EventType.PREDATOR_KILLED]: (who) => `${who} tue un prédateur.`,
  [EventType.DEATH]: (who) => `Mort de ${who}.`,
  [EventType.FIRST_DELIVERY]: (who) => `Première contribution de ${who} à la réserve.`,
};

/**
 * Chronicle filters (docs/design/08-interface.md): which event types are shown, and which bring
 * the automatic acceleration back to ×1.
 */
export const FILTERS = Object.freeze([
  { name: 'tout', types: null },
  {
    name: 'important',
    types: [
      EventType.BIRTH,
      EventType.DEATH,
      EventType.HEALTH_CRITICAL,
      EventType.DISCOVERED,
      EventType.BUILT,
      EventType.PROJECT_DONE,
      EventType.COLONY_PROJECT,
      EventType.ATTACKED,
      EventType.MISTAKEN,
    ],
  },
  {
    name: 'colonie',
    types: [
      EventType.BIRTH,
      EventType.DEATH,
      EventType.COLONY_PROJECT,
      EventType.FIRST_DELIVERY,
      EventType.TOLD,
      EventType.IMITATED,
      EventType.MISTAKEN,
    ],
  },
]);

/**
 * @param {{ type: string }} event
 * @param {{ types: string[] | null }} filter
 * @returns {boolean}
 */
export function passes(event, filter) {
  return filter.types === null || filter.types.includes(event.type);
}

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
 * @param {import('./names.js').Names} [names] - For resource, recipe and project names.
 * @returns {string}
 */
export function formatEvent(event, time, names) {
  const who = `l’individu #${event.agent}`;
  const where = `(${event.x}, ${event.y})`;
  const memoryText = MEMORY_TEXT[event.type];
  const makingText = MAKING_TEXT[event.type];
  const context = {
    who,
    where,
    place: placeName(event.subject, names),
    need: needName(event.subject),
    thing: names?.recipes?.[event.subject] ?? '?',
    project: names?.projects?.[event.subject] ?? '?',
  };
  let text = TEXT[event.type]?.(who) ?? event.type;
  if (memoryText) text = memoryText(context);
  else if (makingText) text = makingText(context);
  else if (event.type === EventType.BIRTH && event.subject >= 0) {
    text = `Naissance de ${who}, réplique de l’individu #${event.subject}.`;
  } else if (event.type === EventType.COLONY_PROJECT) {
    text = `La colonie bâtit un abri ${where}, œuvre de ${event.subject} individu(s).`;
  }
  return `${shortClock(event.tick, time)} · ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
