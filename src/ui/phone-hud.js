import { SkipKind } from '../sim/protocol.js';
import { PHONE_COMMANDS, nextSpeed, shortSpeed, topLine } from './hud-model.js';

// Phone HUD (docs/design/08-interface.md, « Sur téléphone »): a DOM layer over the canvas, with
// big touch targets, a top bar, a toast for important events, a sheet with tabs (colony,
// chronicle, inspection, more) and a bottom bar of time controls. It only reads frames and sends
// commands: the simulation is never touched from here.

const STYLE = `
.hud { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  font: 14px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #f4f1e8;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
.hud > * { pointer-events: auto; touch-action: manipulation; }
.hud-panel { background: rgba(20, 22, 20, 0.94); }
.hud-top { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center;
  gap: 8px; padding: calc(env(safe-area-inset-top) + 6px) 10px 6px; }
.hud-top .hud-line { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hud-bottom { position: absolute; left: 0; right: 0; bottom: 0;
  padding: 6px 6px calc(env(safe-area-inset-bottom) + 6px); }
.hud-row { display: flex; gap: 6px; }
.hud-row + .hud-row { margin-top: 6px; }
.hud-row.tabs button { font-size: 12px; padding: 0 2px; }
.hud button { flex: 1; min-width: 0; min-height: 44px; border: 1px solid #4a4f48;
  border-radius: 8px; background: #2c302b; color: inherit; font: inherit; padding: 0 4px; }
.hud button:active { background: #474d45; }
.hud button[aria-pressed="true"] { background: #e9d9a6; color: #1b1d1a; border-color: #e9d9a6; }
.hud button:disabled { opacity: 0.4; }
.hud-sheet { position: absolute; left: 0; right: 0; display: none; flex-direction: column;
  max-height: 55vh; border-top: 1px solid #4a4f48; }
.hud-sheet.open { display: flex; }
.hud-sheet-head, .hud-chips, .hud-actions { flex-shrink: 0; }
.hud-sheet-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.hud-sheet-head strong { flex: 1; }
.hud-sheet-head button { flex: 0 0 44px; }
.hud-chips { display: flex; gap: 6px; padding: 0 10px 8px; overflow-x: auto; }
.hud-chips button { flex: 0 0 auto; padding: 0 12px; min-height: 36px; }
.hud-actions { display: flex; gap: 6px; padding: 0 10px 8px; }
.hud-body { overflow-y: auto; padding: 0 10px 10px; -webkit-overflow-scrolling: touch;
  touch-action: pan-y; }
.hud-body pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit;
  font-size: 12px; line-height: 1.45; }
.hud-body p { margin: 0 0 6px; font-size: 12px; }
.hud-body dl { margin: 0; font-size: 12px; display: grid; grid-template-columns: max-content 1fr;
  gap: 4px 10px; }
.hud-body dt { color: #e9d9a6; }
.hud-body dd { margin: 0; }
.hud-seed { display: flex; gap: 6px; margin: 8px 0; }
.hud-seed input { flex: 1; min-width: 0; min-height: 40px; border-radius: 8px; border: 1px solid #4a4f48;
  background: #1b1d1a; color: inherit; font: inherit; padding: 0 8px; }
.hud-toast { position: absolute; left: 10px; right: 10px; display: none; padding: 8px 10px;
  border-radius: 8px; border: 1px solid #e9d9a6; font-size: 12px; }
.hud-toast.show { display: block; }
`;

const TOAST_MS = 4000;
const CHRONICLE_LINES = 60;

/**
 * @typedef {object} PhoneHudOptions
 * @property {HTMLElement} root
 * @property {import('../bridge/sim-client.js').SimClient} sim
 * @property {number[]} speedSteps
 * @property {{ name: string }[]} filters
 * @property {number} seed
 * @property {string} version
 * @property {() => number} getFilter
 * @property {(i: number) => void} setFilter
 * @property {() => void} toggleAuto
 * @property {(event: object) => boolean} important - True for events worth a toast.
 * @property {(event: object) => string} describe - One chronicle line.
 * @property {(event: object) => boolean} passes - True if the current filter shows it.
 * @property {(type: string) => void} command - World commands: follow, memory, deselect,
 *   zoomIn, zoomOut, center.
 * @property {import('./dashboard.js').Dashboard} dashboard - Shown in the « Harmonie » tab.
 * @property {(top: number, bottom: number) => void} onInsets - CSS pixels of the screen covered
 *   at the top and at the bottom, so that the camera centres in what remains visible.
 */

export class PhoneHud {
  /**
   * @param {PhoneHudOptions} options
   */
  constructor(options) {
    this.o = options;
    /** @type {string | null} Open tab. */
    this.tab = null;
    this.frame = null;
    /** @type {object[]} */
    this.events = [];
    this.inspection = { kind: 'none', text: '' };
    this.following = false;
    this.memory = false;
    this.toastTimer = 0;
    this.build();
  }

  /** @returns {void} */
  build() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    const el = (tag, props = {}, children = []) => {
      const node = Object.assign(document.createElement(tag), props);
      for (const c of children) node.append(c);
      return node;
    };
    const button = (text, onClick, label = text) => {
      const b = el('button', { type: 'button', textContent: text });
      b.setAttribute('aria-label', label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return b;
    };
    this.el = el;
    this.button = button;
    const sim = this.o.sim;

    this.line = el('div', { className: 'hud-line', textContent: 'Démarrage…' });
    const top = el('div', { className: 'hud-top hud-panel' }, [this.line]);

    this.toast = el('div', { className: 'hud-toast hud-panel' });
    this.toast.addEventListener('click', () => this.open('chronicle'));

    this.sheetTitle = el('strong');
    const close = button('✕', () => this.open(null), 'Fermer');
    this.chips = el('div', { className: 'hud-chips' });
    this.actions = el('div', { className: 'hud-actions' });
    this.body = el('div', { className: 'hud-body' });
    this.sheet = el('div', { className: 'hud-sheet hud-panel' }, [
      el('div', { className: 'hud-sheet-head' }, [this.sheetTitle, close]),
      this.chips,
      this.actions,
      this.body,
    ]);

    this.slower = button('−', () => this.speed(-1), 'Plus lent');
    this.speedLabel = button('×1', () => sim.setSpeed(1), 'Vitesse ×1');
    this.faster = button('+', () => this.speed(1), 'Plus vite');
    this.pause = button('⏯', () => sim.togglePause(), 'Pause ou reprise');
    this.dawn = button('Aube', () => sim.skip(SkipKind.DAWN), 'Jusqu’à l’aube');
    this.next = button('Évén.', () => sim.skip(SkipKind.EVENT), 'Jusqu’au prochain événement');
    this.auto = button('Auto', () => this.o.toggleAuto(), 'Accélération automatique');
    this.tabs = {
      colony: button('Colonie', () => this.toggle('colony')),
      chronicle: button('Chronique', () => this.toggle('chronicle')),
      inspect: button('Fiche', () => this.toggle('inspect')),
      harmony: button('Harmonie', () => this.toggle('harmony')),
      more: button('Plus', () => this.toggle('more')),
    };
    this.bottom = el('div', { className: 'hud-bottom hud-panel' }, [
      el('div', { className: 'hud-row' }, [
        this.pause,
        this.slower,
        this.speedLabel,
        this.faster,
        this.dawn,
        this.next,
        this.auto,
      ]),
      el('div', { className: 'hud-row tabs' }, Object.values(this.tabs)),
    ]);

    this.layer = el('div', { className: 'hud' }, [top, this.toast, this.sheet, this.bottom]);
    this.o.root.appendChild(this.layer);
    this.place();
    window.addEventListener('resize', () => this.place());
  }

  /** Keeps the sheet and the toast just above the bottom bar. @returns {void} */
  place() {
    const h = this.bottom.offsetHeight;
    this.sheet.style.bottom = `${h}px`;
    const sheetH = this.sheet.classList.contains('open') ? this.sheet.offsetHeight : 0;
    this.toast.style.bottom = `${h + sheetH + 8}px`;
    const top = this.layer.firstElementChild.offsetHeight;
    if (top !== this.insetTop || h + sheetH !== this.insetBottom) {
      this.insetTop = top;
      this.insetBottom = h + sheetH;
      this.o.onInsets(top, h + sheetH);
    }
  }

  /**
   * @param {1 | -1} direction
   * @returns {void}
   */
  speed(direction) {
    const current = this.frame?.speed ?? 1;
    this.o.sim.setSpeed(nextSpeed(current, direction, this.o.speedSteps));
  }

  /**
   * @param {string} tab
   * @returns {void}
   */
  toggle(tab) {
    this.open(this.tab === tab ? null : tab);
  }

  /**
   * Opens a tab of the sheet, or closes it with null.
   * @param {string | null} tab
   * @returns {void}
   */
  open(tab) {
    this.tab = tab;
    for (const [name, b] of Object.entries(this.tabs)) {
      b.setAttribute('aria-pressed', String(name === tab));
    }
    this.sheet.classList.toggle('open', tab !== null);
    this.toast.classList.remove('show');
    this.body.scrollTop = 0;
    this.lastBody = '';
    this.drawSheet(true);
    this.place();
  }

  /**
   * A new frame from the worker.
   * @param {object} frame
   * @param {string[]} colonyLines
   * @param {string[] | null} agentLines - The selected individual's panel, if any.
   * @returns {void}
   */
  update(frame, colonyLines, agentLines) {
    this.frame = frame;
    this.colonyLines = colonyLines;
    if (agentLines) this.inspection = { kind: 'agent', text: agentLines.join('\n') };
    this.line.textContent = topLine(frame);
    this.speedLabel.textContent = shortSpeed(frame);
    this.pause.textContent = frame.paused ? '▶' : '❚❚';
    this.auto.setAttribute('aria-pressed', String(Boolean(frame.auto)));
    this.slower.disabled = !frame.paused && frame.speed === this.o.speedSteps[0];
    this.faster.disabled = frame.speed === 'max';
    for (const e of frame.events) {
      this.events.push(e);
      if (this.o.important(e)) this.showToast(this.o.describe(e));
    }
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    this.drawSheet(frame.events.length > 0);
  }

  /**
   * @param {string} text
   * @returns {void}
   */
  showToast(text) {
    if (this.tab === 'chronicle') return;
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.place();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), TOAST_MS);
  }

  /**
   * An individual was selected (id ≥ 0) or released.
   * @param {number} id
   * @returns {void}
   */
  agentSelected(id) {
    if (id >= 0) {
      this.inspection = { kind: 'agent', text: 'Chargement…' };
      this.open('inspect');
    } else if (this.inspection.kind === 'agent') {
      this.inspection = { kind: 'none', text: '' };
      this.drawSheet(true);
    }
  }

  /**
   * @param {string} text
   * @returns {void}
   */
  tileInspected(text) {
    this.inspection = { kind: 'tile', text };
    this.open('inspect');
  }

  /**
   * @param {boolean} on
   * @returns {void}
   */
  setFollowing(on) {
    this.following = on;
    this.drawSheet(true);
  }

  /**
   * @param {boolean} on
   * @returns {void}
   */
  setMemory(on) {
    this.memory = on;
    this.drawSheet(true);
  }

  /** Redraws the chips and actions of the open tab. @returns {void} */
  drawControls() {
    const { button } = this;
    this.chips.replaceChildren();
    this.actions.replaceChildren();
    if (this.tab === 'chronicle') {
      this.o.filters.forEach((f, i) => {
        const chip = button(f.name, () => {
          this.o.setFilter(i);
          this.drawSheet(true);
        });
        chip.setAttribute('aria-pressed', String(i === this.o.getFilter()));
        this.chips.append(chip);
      });
    } else if (this.tab === 'inspect' && this.inspection.kind === 'agent') {
      const follow = button('Suivre', () => this.o.command('follow'));
      follow.setAttribute('aria-pressed', String(this.following));
      const memory = button('Mémoire', () => this.o.command('memory'), 'Ce qu’il croit savoir');
      memory.setAttribute('aria-pressed', String(this.memory));
      this.actions.append(
        follow,
        memory,
        button('Lâcher', () => this.o.command('deselect')),
      );
    } else if (this.tab === 'more') {
      this.actions.append(
        button('Zoom −', () => this.o.command('zoomOut')),
        button('Zoom +', () => this.o.command('zoomIn')),
        button('Recentrer', () => this.o.command('center'), 'Recentrer sur la colonie'),
      );
    }
    this.chips.style.display = this.chips.childElementCount > 0 ? 'flex' : 'none';
    this.actions.style.display = this.actions.childElementCount > 0 ? 'flex' : 'none';
  }

  /**
   * Redraws the open tab. Controls only when asked (they would lose a tap in progress).
   * @param {boolean} controls
   * @returns {void}
   */
  drawSheet(controls) {
    if (this.tab === null) return;
    const titles = {
      colony: 'Colonie',
      chronicle: 'Chronique',
      inspect: 'Fiche',
      harmony: 'Harmonie',
      more: 'Plus',
    };
    this.sheetTitle.textContent = titles[this.tab];
    if (this.tab === 'chronicle') {
      this.sheetTitle.textContent = `Chronique (${this.o.filters[this.o.getFilter()].name})`;
    }
    if (controls) this.drawControls();
    if (this.tab === 'more') {
      if (this.lastBody !== 'more') this.drawMore();
      this.lastBody = 'more';
      this.place();
      return;
    }
    if (this.tab === 'harmony') {
      if (this.lastBody !== 'harmony') {
        this.body.replaceChildren(this.o.dashboard.el);
        this.o.dashboard.setOpen(true);
        this.lastBody = 'harmony';
        this.place();
      }
      this.o.dashboard.draw();
      return;
    }
    let text = '';
    if (this.tab === 'colony') {
      text = this.colonyLines?.length ? this.colonyLines.join('\n') : 'Pas encore de colonie.';
    } else if (this.tab === 'chronicle') {
      const lines = this.events
        .filter((e) => this.o.passes(e))
        .slice(-CHRONICLE_LINES)
        .reverse()
        .map((e) => this.o.describe(e));
      text = lines.length ? lines.join('\n') : 'Rien pour l’instant.';
    } else if (this.tab === 'inspect') {
      text = this.inspection.text || 'Touchez un individu (pixel noir) ou une case.';
    }
    if (text === this.lastBody) return;
    this.lastBody = text;
    const pre = this.body.firstElementChild;
    if (pre && pre.tagName === 'PRE') pre.textContent = text;
    else this.body.replaceChildren(this.el('pre', { textContent: text }));
    this.place();
  }

  /** The "more" tab: seed, commands. @returns {void} */
  drawMore() {
    const { el, button } = this;
    const input = el('input', {
      type: 'number',
      inputMode: 'numeric',
      min: '0',
      value: String(this.o.seed),
    });
    input.setAttribute('aria-label', 'Graine');
    const go = (seed) => {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', String(seed));
      window.location.assign(url);
    };
    const list = el('dl');
    for (const c of PHONE_COMMANDS) {
      list.append(el('dt', { textContent: c.where }), el('dd', { textContent: c.what }));
    }
    this.body.replaceChildren(
      el('p', { textContent: `Graine ${this.o.seed} · ${this.o.version}` }),
      el('div', { className: 'hud-seed' }, [
        input,
        button('Charger', () => {
          const n = Number.parseInt(input.value, 10);
          if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) go(n);
        }),
        button('Au hasard', () => go(Math.floor(Math.random() * 1_000_000_000))),
      ]),
      el('p', {
        textContent:
          'Vous observez seulement : le temps, la vue, l’inspection et la graine sont vos commandes.',
      }),
      list,
    );
  }
}
