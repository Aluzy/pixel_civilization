/**
 * @param {{ day: number, hour: number, minute: number }} time
 * @returns {string} E.g. "Jour 3 · 07:05".
 */
export function formatClock({ day, hour, minute }) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `Jour ${day} · ${hh}:${mm}`;
}

/**
 * Shows the requested speed, plus the effective one when the machine cannot keep up.
 * @param {{ requested: number | 'max', effective: number, paused: boolean }} speed
 * @returns {string}
 */
export function formatSpeed({ requested, effective, paused }) {
  if (paused) return 'Pause';
  const eff = Math.round(effective);
  if (requested === 'max') return `Max (×${eff})`;
  const behind = effective > 0 && Math.abs(effective - requested) / requested > 0.05;
  return behind ? `×${requested} (effectif ×${eff})` : `×${requested}`;
}
