import { describeGeneDrift, harmonySummary } from './dashboard-model.js';

// Dashboard (docs/design/08-interface.md, « Tableau de bord »): curves of harmony and its five
// components, of the population, and of each gene (mean and spread) over the days. A DOM layer
// with canvases, shared by the desktop (key H) and the phone HUD (tab « Harmonie »).

const STYLE = `
.dash { position: fixed; z-index: 11; background: rgba(20, 22, 20, 0.95); color: #f4f1e8;
  font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-y: auto;
  border: 1px solid #4a4f48; border-radius: 8px; padding: 10px 12px; display: none; }
.dash.open { display: block; }
.dash.embed { position: static; border: 0; padding: 0; background: none; overflow: visible; }
.dash.desk { top: 12px; right: 12px; width: min(560px, calc(100vw - 24px));
  max-height: calc(100vh - 24px); }
.dash h3 { margin: 10px 0 4px; font-size: 13px; font-weight: 600; }
.dash h3:first-child { margin-top: 0; }
.dash canvas { width: 100%; height: 150px; display: block; }
.dash .genes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px 10px; }
.dash .genes canvas { height: 46px; }
.dash .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 4px 0; }
.dash .legend i { display: inline-block; width: 14px; height: 3px; margin-right: 4px;
  vertical-align: middle; }
.dash p { margin: 4px 0; }
`;

/** Okabe–Ito colours (readable with colour-blindness), harmony first. */
const COLORS = ['#f4f1e8', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#cc79a7', '#d55e00'];
const COMPONENT_NAMES = [
  'Stabilité',
  'Durabilité',
  'Ordre spatial',
  'Savoir',
  'Bien-être',
  'Beauté',
];

export class Dashboard {
  /**
   * @param {object} options
   * @param {HTMLElement | null} options.root - Where to attach it (null: the caller places it).
   * @param {{ name: string, min: number, max: number, start: number }[]} options.genes
   * @param {number} options.ticksPerDay
   * @param {boolean} options.desktop - A floating panel (desktop) or content for the phone sheet.
   */
  constructor({ root, genes, ticksPerDay, desktop }) {
    this.genes = genes;
    this.ticksPerDay = ticksPerDay;
    /** @type {object[]} */
    this.rows = [];
    this.dirty = true;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
    this.el = el('div', { className: desktop ? 'dash desk' : 'dash embed open' });
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Tableau de bord');
    this.summary = el('p');
    this.harmonyCanvas = el('canvas');
    this.harmonyCanvas.setAttribute('role', 'img');
    this.populationCanvas = el('canvas');
    this.populationCanvas.setAttribute('role', 'img');
    const legend = el('div', { className: 'legend' });
    ['Harmonie', ...COMPONENT_NAMES].forEach((name, i) => {
      const item = el('span');
      const swatch = el('i');
      swatch.style.background = COLORS[i];
      item.append(swatch, name);
      legend.append(item);
    });
    this.geneGrid = el('div', { className: 'genes' });
    this.geneCanvases = genes.map((g) => {
      const box = el('div');
      const label = el('div', { textContent: g.name });
      const canvas = el('canvas');
      canvas.setAttribute('role', 'img');
      box.append(label, canvas);
      this.geneGrid.append(box);
      return { label, canvas };
    });
    this.drift = el('p');
    this.el.append(
      el('h3', { textContent: 'Harmonie (0 à 100) et composantes (0 à 1)' }),
      this.summary,
      this.harmonyCanvas,
      legend,
      el('h3', { textContent: 'Population' }),
      this.populationCanvas,
      el('h3', { textContent: 'Génome : moyenne et dispersion de chaque gène' }),
      this.drift,
      this.geneGrid,
    );
    if (root) root.appendChild(this.el);
  }

  /** @returns {boolean} */
  get open() {
    return this.el.classList.contains('open');
  }

  /**
   * @param {boolean} on
   * @returns {void}
   */
  setOpen(on) {
    this.el.classList.toggle('open', on);
    if (on) this.dirty = true;
  }

  /**
   * New days of history from a frame.
   * @param {{ from: number, rows: object[] } | null} history
   * @returns {void}
   */
  add(history) {
    if (!history) return;
    this.rows.length = Math.min(this.rows.length, history.from);
    this.rows.push(...history.rows);
    this.dirty = true;
  }

  /** Redraws if something changed and the panel is visible. @returns {void} */
  draw() {
    if (!this.dirty || !this.open || this.el.getClientRects().length === 0) return;
    this.dirty = false;
    const rows = this.rows;
    const days = rows.map((r) => Math.round(r.tick / this.ticksPerDay));
    this.summary.textContent = harmonySummary(rows);
    this.harmonyCanvas.setAttribute('aria-label', this.summary.textContent);
    const series = [
      { values: rows.map((r) => r.harmony / 100), color: COLORS[0], width: 2.5 },
      ...COMPONENT_NAMES.map((_, k) => ({
        values: rows.map((r) => r.components[k]),
        color: COLORS[k + 1],
        width: 1.2,
      })),
    ];
    plot(this.harmonyCanvas, days, series, 0, 1);
    const population = rows.map((r) => r.population);
    const top = Math.max(1, ...population);
    plot(this.populationCanvas, days, [{ values: population, color: COLORS[2], width: 2 }], 0, top);
    this.populationCanvas.setAttribute(
      'aria-label',
      `Population : ${population.at(-1) ?? 0} individus, au plus ${top}.`,
    );
    this.drift.textContent = describeGeneDrift(rows, this.genes);
    this.genes.forEach((g, k) => {
      const mean = rows.map((r) => r.geneMean[k]);
      const spread = rows.map((r) => r.geneSpread[k]);
      const { canvas, label } = this.geneCanvases[k];
      plotBand(canvas, days, mean, spread, g.min, g.max, g.start);
      const last = mean.at(-1);
      label.textContent = last === undefined ? g.name : `${g.name} ${last.toFixed(2)}`;
      canvas.setAttribute('aria-label', `${g.name} : moyenne ${last?.toFixed(2) ?? '—'}`);
    });
  }
}

/**
 * Sizes a canvas to its CSS box (sharp on high-density screens) and returns its context.
 * @param {HTMLCanvasElement} canvas
 * @returns {{ g: CanvasRenderingContext2D, w: number, h: number }}
 */
function prepare(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const g = canvas.getContext('2d');
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

/**
 * Line chart of several series over the days, with a light grid and day labels.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} days
 * @param {{ values: number[], color: string, width: number }[]} series
 * @param {number} lo
 * @param {number} hi
 * @returns {void}
 */
function plot(canvas, days, series, lo, hi) {
  const { g, w, h } = prepare(canvas);
  const pad = { l: 28, r: 6, t: 6, b: 16 };
  const x = (i) => pad.l + (days.length < 2 ? 0 : (i / (days.length - 1)) * (w - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (h - pad.t - pad.b);
  g.strokeStyle = 'rgba(244, 241, 232, 0.15)';
  g.fillStyle = 'rgba(244, 241, 232, 0.6)';
  g.font = '10px ui-monospace, monospace';
  g.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    g.beginPath();
    g.moveTo(pad.l, y(v));
    g.lineTo(w - pad.r, y(v));
    g.stroke();
    g.fillText(hi > 1 ? String(Math.round(v)) : v.toFixed(2).replace(/0$/, ''), 0, y(v) + 3);
  }
  if (days.length > 0) {
    g.fillText(`J${days[0]}`, pad.l, h - 3);
    const end = `J${days.at(-1)}`;
    g.fillText(end, w - pad.r - g.measureText(end).width, h - 3);
  }
  for (const s of series) {
    g.strokeStyle = s.color;
    g.lineWidth = s.width;
    g.beginPath();
    s.values.forEach((v, i) => (i === 0 ? g.moveTo(x(i), y(v)) : g.lineTo(x(i), y(v))));
    g.stroke();
  }
}

/**
 * A gene over the days: its mean as a line, ± one standard deviation as a band, and the founder
 * value as a dotted line.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} days
 * @param {number[]} mean
 * @param {number[]} spread
 * @param {number} lo
 * @param {number} hi
 * @param {number} start
 * @returns {void}
 */
function plotBand(canvas, days, mean, spread, lo, hi, start) {
  const { g, w, h } = prepare(canvas);
  const x = (i) => (days.length < 2 ? 0 : (i / (days.length - 1)) * w);
  const y = (v) => (1 - (v - lo) / (hi - lo)) * h;
  g.setLineDash([2, 3]);
  g.strokeStyle = 'rgba(244, 241, 232, 0.35)';
  g.beginPath();
  g.moveTo(0, y(start));
  g.lineTo(w, y(start));
  g.stroke();
  g.setLineDash([]);
  if (mean.length === 0) return;
  g.fillStyle = 'rgba(86, 180, 233, 0.25)';
  g.beginPath();
  mean.forEach((m, i) =>
    i === 0 ? g.moveTo(x(i), y(m + spread[i])) : g.lineTo(x(i), y(m + spread[i])),
  );
  for (let i = mean.length - 1; i >= 0; i--) g.lineTo(x(i), y(mean[i] - spread[i]));
  g.closePath();
  g.fill();
  g.strokeStyle = COLORS[2];
  g.lineWidth = 1.5;
  g.beginPath();
  mean.forEach((m, i) => (i === 0 ? g.moveTo(x(i), y(m)) : g.lineTo(x(i), y(m))));
  g.stroke();
}
