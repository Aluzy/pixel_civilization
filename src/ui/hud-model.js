import { formatSpeed } from './format.js';

// Pure helpers of the phone HUD (docs/design/08-interface.md, « Sur téléphone »): what the
// buttons do with the speed, and the short texts of the top bar. No DOM here, so it is tested.

/** Widths (CSS pixels) under which the phone HUD replaces the desktop panels. */
export const PHONE_MAX_WIDTH = 820;

/**
 * Chooses the HUD: `?hud=phone` or `?hud=desktop` wins; otherwise a touch screen without a fine
 * pointer, or a narrow window, gets the phone HUD.
 * @param {{ search: string, width: number, coarse: boolean, fine: boolean }} env
 * @returns {'phone' | 'desktop'}
 */
export function chooseHud({ search, width, coarse, fine }) {
  const asked = new URLSearchParams(search).get('hud');
  if (asked === 'phone' || asked === 'desktop') return asked;
  if (coarse && !fine) return 'phone';
  return width <= PHONE_MAX_WIDTH ? 'phone' : 'desktop';
}

/**
 * Next speed one step slower or faster. From Max, slower goes to the fastest step; faster than
 * the fastest step is Max; slower than ×1 stays ×1.
 * @param {number | 'max'} current
 * @param {1 | -1} direction
 * @param {number[]} steps - Ascending.
 * @returns {number | 'max'}
 */
export function nextSpeed(current, direction, steps) {
  if (current === 'max') return direction > 0 ? 'max' : steps[steps.length - 1];
  let i = steps.indexOf(current);
  if (i < 0) i = steps.findIndex((s) => s >= current);
  if (i < 0) i = steps.length - 1;
  const next = i + direction;
  if (next >= steps.length) return 'max';
  return steps[Math.max(0, next)];
}

/**
 * Compact speed step for a button, paused or not: "×16", "Max".
 * @param {{ speed: number | 'max' }} frame
 * @returns {string}
 */
export function shortSpeed({ speed }) {
  return speed === 'max' ? 'Max' : `×${speed}`;
}

/**
 * The top bar: day and time, speed (with the effective one when behind), population.
 * @param {{ time: { day: number, hour: number, minute: number }, speed: number | 'max',
 *   effectiveSpeed: number, paused: boolean, auto?: boolean, agents: unknown[],
 *   colony?: { harmony?: { score: number, focus: number } } | null }} frame
 * @returns {string}
 */
export function topLine(frame) {
  const { day, hour, minute } = frame.time;
  const clock = `J${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const speed = formatSpeed({
    requested: frame.speed,
    effective: frame.effectiveSpeed,
    paused: frame.paused,
  });
  const auto = frame.auto ? ' auto' : '';
  const h = frame.colony?.harmony;
  const harmony = h && h.focus >= 0 ? ` · H ${Math.round(h.score)}` : '';
  return `${clock} · ${speed}${auto} · ${frame.agents.length} ind.${harmony}`;
}

/**
 * Commands of the phone HUD, for the help sheet: where each one is and what it does.
 * @type {ReadonlyArray<{ where: string, what: string }>}
 */
export const PHONE_COMMANDS = Object.freeze([
  { where: 'Glisser un doigt', what: 'déplacer la vue' },
  { where: 'Pincer', what: 'zoomer (ou boutons + et −)' },
  { where: 'Toucher un individu', what: 'le sélectionner et ouvrir sa fiche' },
  { where: 'Toucher une case', what: 'voir biome, ressource, construction' },
  { where: '⏯', what: 'pause ou reprise' },
  { where: '− / +', what: 'palier de vitesse (×1, ×4, ×16, ×64, ×256, Max)' },
  { where: 'Aube', what: 'pleine vitesse jusqu’à l’aube, puis ×1' },
  { where: 'Évén.', what: 'pleine vitesse jusqu’au prochain événement, puis ×1' },
  { where: 'Auto', what: 'accélère tant que rien d’important ne se passe' },
  { where: 'Colonie', what: 'population, abris, réserve, projets, bibliothèques, savoir' },
  { where: 'Chronique', what: 'événements ; les filtres choisissent aussi ce qui coupe l’Auto' },
  { where: 'Fiche', what: 'l’individu ou la case touchés ; Suivre, Mémoire, Lâcher' },
  { where: 'Harmonie', what: 'courbes de l’harmonie, de la population et des gènes' },
  { where: 'Bandeau', what: 'un événement important ; le toucher ouvre la chronique' },
  { where: 'Plus', what: 'zoom, recentrer, nouvelle graine, cette aide' },
]);
