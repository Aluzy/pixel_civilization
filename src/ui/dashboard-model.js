// Texts of the dashboard (pure, tested): the harmony summary and the strongest gene drift.

const COMPONENT_NAMES = [
  'stabilité',
  'durabilité',
  'ordre spatial',
  'savoir',
  'bien-être',
  'beauté',
];

/**
 * "Harmonie 62 (J40 : 45) · point faible : savoir 0,10".
 * @param {{ tick: number, harmony: number, components: number[] }[]} rows
 * @param {number} [ticksPerDay=1200]
 * @returns {string}
 */
export function harmonySummary(rows, ticksPerDay = 1200) {
  if (rows.length === 0) return 'Pas encore de mesure : la première a lieu à la fin du jour 1.';
  const last = rows.at(-1);
  const back = rows[Math.max(0, rows.length - 11)];
  let weakest = 0;
  last.components.forEach((v, k) => {
    if (v < last.components[weakest]) weakest = k;
  });
  const before =
    back === last ? '' : ` (J${Math.round(back.tick / ticksPerDay)} : ${Math.round(back.harmony)})`;
  const low = last.components[weakest].toFixed(2).replace('.', ',');
  return `Harmonie ${Math.round(last.harmony)}${before} · point faible : ${COMPONENT_NAMES[weakest]} ${low}`;
}

/**
 * The gene whose population mean moved the most from its founder value, as a share of its range.
 * @param {{ geneMean: number[] }[]} rows
 * @param {{ name: string, min: number, max: number, start: number }[]} genes
 * @returns {string}
 */
export function describeGeneDrift(rows, genes) {
  if (rows.length === 0) return 'Le génome du fondateur est la référence (pointillés).';
  const last = rows.at(-1);
  let best = 0;
  let bestShift = 0;
  genes.forEach((g, k) => {
    const shift = (last.geneMean[k] - g.start) / (g.max - g.min);
    if (Math.abs(shift) > Math.abs(bestShift)) {
      bestShift = shift;
      best = k;
    }
  });
  const pct = Math.round(Math.abs(bestShift) * 100);
  const way = bestShift > 0 ? 'hausse' : 'baisse';
  return pct === 0
    ? 'Aucune dérive : le génome est encore celui du fondateur (pointillés).'
    : `Plus forte dérive : ${genes[best].name.toLowerCase()}, en ${way} de ${pct} % de sa plage depuis le fondateur (pointillés).`;
}
