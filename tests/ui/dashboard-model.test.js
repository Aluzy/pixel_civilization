import { describe, expect, it } from 'vitest';
import { describeGeneDrift, harmonySummary } from '../../src/ui/dashboard-model.js';

const row = (day, harmony, components, geneMean = [1, 0.5]) => ({
  tick: day * 1200,
  harmony,
  components,
  population: 10,
  geneMean,
  geneSpread: [0, 0],
});

describe('dashboard texts', () => {
  it('sums up the harmony, its change and the weakest component', () => {
    expect(harmonySummary([])).toMatch(/Pas encore/);
    const rows = [row(1, 30, [0.5, 0.5, 0.5, 0, 0.5])];
    for (let d = 2; d <= 12; d++) rows.push(row(d, 30 + d, [0.9, 0.6, 0.7, 0.1, 0.5]));
    expect(harmonySummary(rows)).toBe('Harmonie 42 (J2 : 32) · point faible : savoir 0,10');
  });

  it('names the gene that drifted most from the founder', () => {
    const genes = [
      { name: 'Poids de la faim', min: 0.5, max: 1.5, start: 1 },
      { name: 'Curiosité', min: 0, max: 1, start: 0.5 },
    ];
    expect(describeGeneDrift([row(5, 40, [], [1, 0.5])], genes)).toMatch(/Aucune dérive/);
    expect(describeGeneDrift([row(5, 40, [], [1.03, 0.42])], genes)).toBe(
      'Plus forte dérive : curiosité, en baisse de 8 % de sa plage depuis le fondateur (pointillés).',
    );
  });
});
