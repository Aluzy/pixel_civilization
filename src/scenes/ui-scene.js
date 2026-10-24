import * as Phaser from 'phaser';
import balance from '../../data/balance.json' with { type: 'json' };
import resourceData from '../../data/resources.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { SkipKind } from '../sim/protocol.js';
import { buildWorldTables } from '../sim/world/world-data.js';
import { formatAgent } from '../ui/agent-info.js';
import { formatEvent } from '../ui/chronicle.js';
import { formatClock, formatSpeed } from '../ui/format.js';

const TEXT_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '14px',
  color: '#f4f1e8',
  backgroundColor: 'rgba(20, 22, 20, 0.72)',
  padding: { x: 10, y: 8 },
  lineSpacing: 4,
};

const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const CHRONICLE_LINES = 6;

const HELP = [
  'Glisser / flèches : déplacer   Molette / + − : zoom   Clic : inspecter',
  'Espace : pause   1–5 : vitesse   6 : max   L : jusqu’à l’aube   N : prochain événement',
  'F : suivre l’individu   Échap : désélectionner',
];

const SKIP_LABEL = {
  [SkipKind.DAWN]: '→ jusqu’à l’aube',
  [SkipKind.EVENT]: '→ prochain événement',
};

/**
 * Observer overlay: clock, speed and time controls, chronicle, and the inspector (tile or
 * individual). Independent of the world camera's zoom.
 */
export class UiScene extends Phaser.Scene {
  constructor() {
    super('ui');
    this.tables = buildWorldTables(worldData, resourceData);
    /** @type {string[]} */
    this.chronicle = [];
    this.agentSelected = false;
    this.following = false;
  }

  create() {
    /** @type {import('../bridge/sim-client.js').SimClient} */
    const sim = this.registry.get('sim');
    const seed = this.registry.get('seed');
    const version = `v${this.registry.get('version')} · ${this.registry.get('commit')}`;
    const small = { ...TEXT_STYLE, fontSize: '12px' };

    this.status = this.add.text(12, 12, '', TEXT_STYLE).setScrollFactor(0);
    this.footer = this.add.text(12, 0, `Graine ${seed}   ${version}`, small).setScrollFactor(0);
    this.help = this.add.text(0, 0, HELP, small).setScrollFactor(0);
    this.chronicleText = this.add.text(12, 0, '', small).setScrollFactor(0).setVisible(false);
    this.inspection = this.add
      .text(0, 12, '', { ...TEXT_STYLE, fontSize: '13px' })
      .setScrollFactor(0)
      .setVisible(false);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());

    const unsubscribe = sim.onFrame((frame) => this.render(frame));
    const showTile = (text) => {
      this.agentSelected = false;
      this.inspection.setText(text).setVisible(true);
      this.layout();
    };
    const onAgent = (id) => {
      this.agentSelected = id >= 0;
      if (!this.agentSelected) this.inspection.setVisible(false);
    };
    const onFollow = (on) => {
      this.following = on;
    };
    this.game.events.on('tile-inspected', showTile);
    this.game.events.on('agent-selected', onAgent);
    this.game.events.on('follow-changed', onFollow);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.game.events.off('tile-inspected', showTile);
      this.game.events.off('agent-selected', onAgent);
      this.game.events.off('follow-changed', onFollow);
    });
    this.render(null);

    const keyboard = this.input.keyboard;
    keyboard.on('keydown-SPACE', () => sim.togglePause());
    balance.time.speedSteps.forEach((speed, i) => {
      if (KEY_NAMES[i]) keyboard.on(`keydown-${KEY_NAMES[i]}`, () => sim.setSpeed(speed));
    });
    keyboard.on('keydown-SIX', () => sim.setSpeed('max'));
    keyboard.on('keydown-L', () => sim.skip(SkipKind.DAWN));
    keyboard.on('keydown-N', () => sim.skip(SkipKind.EVENT));
  }

  /** @returns {void} */
  layout() {
    const { width, height } = this.scale;
    this.footer.setPosition(12, height - this.footer.height - 12);
    this.chronicleText.setPosition(12, this.footer.y - this.chronicleText.height - 8);
    this.help.setPosition(width - this.help.width - 12, height - this.help.height - 12);
    this.inspection.setPosition(width - this.inspection.width - 12, 12);
  }

  /**
   * @param {object | null} frame
   * @returns {void}
   */
  render(frame) {
    if (!frame) {
      this.status.setText(['Pixel Civilisation', 'Démarrage de la simulation…']);
      return;
    }
    const speed = formatSpeed({
      requested: frame.speed,
      effective: frame.effectiveSpeed,
      paused: frame.paused,
    });
    const lines = [
      'Pixel Civilisation',
      formatClock(frame.time),
      `Vitesse ${speed}${frame.skip ? ` ${SKIP_LABEL[frame.skip]}` : ''}`,
      `Individus ${frame.agents.length}`,
      `${Math.round(this.game.loop.actualFps)} img/s`,
    ];
    this.status.setText(lines);

    if (frame.events.length > 0) {
      for (const e of frame.events) this.chronicle.push(formatEvent(e, balance.time));
      this.chronicle = this.chronicle.slice(-CHRONICLE_LINES);
      this.chronicleText.setText(['Chronique', ...this.chronicle]).setVisible(true);
    }

    if (this.agentSelected && frame.selected) {
      const panel = formatAgent(frame.selected, this.tables, balance.time);
      if (this.following) panel[0] += ' · suivi';
      this.inspection.setText(panel).setVisible(true);
    }
    this.layout();
  }
}
