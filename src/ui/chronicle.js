import { describeTick } from '../sim/core/clock.js';
import { EventType } from '../sim/core/events.js';
import { subjectLabel } from './names.js';
import worksData from '../../data/works.json' with { type: 'json' };

/**
 * @param {number} subject - Memory subject: 0 = water, a resource id, or a structure.
 * @param {import('./names.js').Names} [names]
 * @returns {string} E.g. "un point d’eau", "un lieu de baies", "son abri", "sa bibliothèque".
 */
export function placeName(subject, names) {
  if (subject === 0) return 'un point d’eau';
  if (!names || subject < 0) return 'un lieu';
  const label = subjectLabel(subject, names).toLowerCase();
  const r = names.resources.length;
  if (subject <= r) return `un lieu de ${label}`;
  return `${names.feminine?.[subject - r - 1] ? 'sa' : 'son'} ${label}`;
}

/**
 * @param {string} name
 * @returns {string} "de blé", "d’argile".
 */
function ofName(name) {
  const lower = name.toLowerCase();
  return /^[aeiouyhàâéèêëîïôöûü]/.test(lower) ? `d’${lower}` : `de ${lower}`;
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
  [EventType.TAUGHT]: (c) => `${c.who} apprend à l’école comment faire : ${c.thing}.`,
  [EventType.MISTAKEN]: (c) => `${c.who} avait mal compris comment faire : ${c.thing}.`,
  [EventType.FORGOT_RECIPE]: (c) => `${c.who} a oublié comment faire : ${c.thing}.`,
  [EventType.CRAFTED]: (c) => `${c.who} fabrique : ${c.thing}.`,
  [EventType.BUILT]: (c) => `${c.who} bâtit : ${c.thing} ${c.where}.`,
  [EventType.PROJECT_DONE]: (c) => `${c.who} achève son projet « ${c.project} ».`,
  [EventType.WRITTEN]: (c) => `${c.who} écrit dans un livre comment faire : ${c.thing}.`,
  [EventType.READ]: (c) => `${c.who} apprend dans un livre comment faire : ${c.thing}.`,
  [EventType.KNOWLEDGE_LOST]: (c) => `Savoir perdu : plus personne ne sait faire ${c.thing}.`,
  [EventType.KNOWLEDGE_RECOVERED]: (c) => `Savoir retrouvé : on sait de nouveau faire ${c.thing}.`,
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
  [EventType.GUARD]: (who) => `${who} prend la garde du camp.`,
  [EventType.SHELTER_FORCED]: (who) => `Une meute force l’abri isolé de ${who} !`,
  [EventType.FIRST_PLOT]: (who) => `${who} sème la première parcelle de la colonie.`,
  [EventType.HARVEST]: (who) => `Première moisson de la colonie, par ${who}.`,
};

// What a completed colony project did, by project kind.
const PROJECT_TEXT = {
  3: 'bâtit une bibliothèque',
  4: 'plante un champ',
  5: 'bâtit sa salle du trésor',
  6: 'achève son enceinte',
  7: 'élève une tour sur son enceinte',
  8: "creuse un canal qui amène l'eau jusqu'aux maisons",
};

/** Project kind of a work of architecture (ProjectKind.WORKS). */
const WORKS_KIND = 9;

// What a completed work of architecture did (decision 0028), by work.
const WORK_TEXT = {
  plaza: 'pave sa place',
  streets: 'pave ses rues',
  temple: 'élève un temple sur sa place',
  granary: 'bâtit un grenier sur sa place',
  market: 'ouvre un marché sur sa place',
  monument: 'dresse un monument et sa statue',
  stone_house: 'rebâtit une maison en pierre',
  stone_wall: 'rebâtit son enceinte en pierre',
  avenue: "plante une allée d'arbres autour de ses murs",
  road: 'pave une route vers une colonie sœur',
  drain: 'assèche un marais',
};

// Events about places, not individuals.
const PLACE_TEXT = {
  [EventType.FIRE]: (c) =>
    `La bibliothèque ${c.where} brûle, et ${c.subject} document(s) avec elle.`,
  [EventType.DEN_DESTROYED]: (c) =>
    `${c.who} détruit une tanière ${c.where} : la meute se disperse.`,
  [EventType.ABANDONED]: (c) =>
    `La bibliothèque ${c.where} est abandonnée : ses livres sont hors de portée.`,
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
      EventType.FIRE,
      EventType.KNOWLEDGE_LOST,
      EventType.KNOWLEDGE_RECOVERED,
      EventType.DEN_DESTROYED,
      EventType.SHELTER_FORCED,
      EventType.FIRST_PLOT,
      EventType.HARVEST,
      EventType.FIRST_DISH,
      EventType.FIRST_JOB,
      EventType.COLONY_FOUNDED,
      EventType.OVERSEAS,
      EventType.FIRST_TRADE,
      EventType.ENCLOSURE_PLANNED,
      EventType.ENCLOSURE_CLOSED,
    ],
  },
  {
    name: 'colonie',
    types: [
      EventType.BIRTH,
      EventType.DEATH,
      EventType.COLONY_PROJECT,
      EventType.FIRST_PLOT,
      EventType.HARVEST,
      EventType.FIRST_DISH,
      EventType.FIRST_DELIVERY,
      EventType.TOLD,
      EventType.IMITATED,
      EventType.TAUGHT,
      EventType.MISTAKEN,
      EventType.FIRST_JOB,
      EventType.EXPEDITION,
      EventType.COLONY_FOUNDED,
      EventType.OVERSEAS,
      EventType.FIRST_TRADE,
      EventType.ENCLOSURE_PLANNED,
      EventType.ENCLOSURE_CLOSED,
    ],
  },
  {
    name: 'économie',
    types: [
      EventType.FIRST_JOB,
      EventType.FIRST_SALE,
      EventType.FIRST_PURCHASE,
      EventType.FIRST_TRADE,
      EventType.FIRST_DELIVERY,
      EventType.HARVEST,
      EventType.FIRST_DISH,
    ],
  },
  {
    name: 'savoir',
    types: [
      EventType.DISCOVERED,
      EventType.TOLD,
      EventType.IMITATED,
      EventType.MISTAKEN,
      EventType.FORGOT_RECIPE,
      EventType.WRITTEN,
      EventType.READ,
      EventType.FIRE,
      EventType.ABANDONED,
      EventType.KNOWLEDGE_LOST,
      EventType.KNOWLEDGE_RECOVERED,
    ],
  },
  {
    name: 'danger',
    types: [
      EventType.ATTACKED,
      EventType.PREDATOR_KILLED,
      EventType.DEATH,
      EventType.HEALTH_CRITICAL,
      EventType.DEN_DESTROYED,
      EventType.SHELTER_FORCED,
      EventType.GUARD,
      EventType.ENCLOSURE_PLANNED,
      EventType.ENCLOSURE_CLOSED,
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
  const placeText = PLACE_TEXT[event.type];
  const context = {
    who,
    where,
    place: placeName(event.subject, names),
    need: needName(event.subject),
    thing: names?.recipes?.[event.subject] ?? '?',
    project: names?.projects?.[event.subject] ?? '?',
    subject: event.subject,
  };
  let text = TEXT[event.type]?.(who) ?? event.type;
  if (event.type === EventType.FIRST_DISH) {
    const dish = names?.goods?.[event.subject]?.toLowerCase() ?? 'un plat';
    text = `Premier plat cuisiné de la colonie : ${who} mange ${dish}.`;
  }
  const good = names?.goods?.[event.subject] ?? '?';
  const job = (j) => names?.jobs?.[j]?.toLowerCase();
  if (event.type === EventType.FIRST_JOB) {
    text = `${who} est le premier ${job(event.subject) ?? '?'} de la colonie.`;
  } else if (event.type === EventType.FIRST_SALE) {
    const as = event.other >= 0 && job(event.other) ? ` (${job(event.other)})` : '';
    text = `Première vente ${ofName(good)} au comptoir, par ${who}${as}.`;
  } else if (event.type === EventType.EXPEDITION) {
    text = `${who} annonce une expédition pour fonder une colonie ${where}.`;
  } else if (event.type === EventType.COLONY_FOUNDED) {
    text = `${who} fonde la colonie n°${event.subject}, fille de la colonie n°${event.other}, ${where}.`;
  } else if (event.type === EventType.OVERSEAS) {
    text = `La colonie n°${event.subject} est fondée outre-mer : ses fondateurs ont traversé l’eau.`;
  } else if (event.type === EventType.FIRST_TRADE) {
    text =
      `Première caravane de la colonie n°${event.other} chez la colonie n°${event.subject}, ` +
      `menée par ${who}.`;
  } else if (event.type === EventType.ENCLOSURE_PLANNED) {
    const why = event.other === 0 ? 'le danger' : 'la valeur de son trésor';
    text =
      `La colonie n°${event.subject} décide d’entourer son trésor d’une enceinte ` +
      `(${why}) : la porte sera ${where}.`;
  } else if (event.type === EventType.ENCLOSURE_CLOSED) {
    text = `L’enceinte de la colonie n°${event.subject} est fermée : ${who} pose le dernier pan ${where}.`;
  } else if (event.type === EventType.FIRST_PURCHASE) {
    const from = event.other >= 0 ? ` : il venait de l’individu #${event.other}` : '';
    text = `Premier achat ${ofName(good)} au comptoir, par ${who}${from}.`;
  }
  if (memoryText) text = memoryText(context);
  else if (makingText) text = makingText(context);
  else if (placeText) text = placeText(context);
  else if (event.type === EventType.DEATH && event.subject === 1) {
    text = `Mort de ${who}, de vieillesse.`;
  } else if (event.type === EventType.DEATH && event.subject === 2) {
    text = `Mort de ${who}, tué par un prédateur.`;
  } else if (event.type === EventType.BIRTH && event.subject >= 0) {
    text = `Naissance de ${who}, réplique de l’individu #${event.subject}.`;
  } else if (event.type === EventType.COLONY_PROJECT) {
    const kind = event.subject & 15;
    const work = worksData.works[event.other];
    const what =
      kind === WORKS_KIND && work ? WORK_TEXT[work.id] : (PROJECT_TEXT[kind] ?? 'bâtit un abri');
    text = `La colonie ${what} ${where}, œuvre de ${event.subject >> 4} individu(s).`;
  }
  return `${shortClock(event.tick, time)} · ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
