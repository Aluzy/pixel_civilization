import * as Phaser from 'phaser';
import aiGoals from '../../data/ai-goals.json' with { type: 'json' };
import projectData from '../../data/ai-projects.json' with { type: 'json' };
import balance from '../../data/balance.json' with { type: 'json' };
import recipeData from '../../data/recipes.json' with { type: 'json' };
import resourceData from '../../data/resources.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { buildProjects } from '../sim/ai/projects.js';
import { buildGoalTable } from '../sim/ai/utility.js';
import { buildCatalog } from '../sim/crafting/catalog.js';
import { SkipKind } from '../sim/protocol.js';
import { buildWorldTables } from '../sim/world/world-data.js';
import { formatAgent } from '../ui/agent-info.js';
import { FILTERS, formatEvent, passes } from '../ui/chronicle.js';
import { formatColony } from '../ui/colony-info.js';
import { formatClock, formatSpeed } from '../ui/format.js';
import { buildNames } from '../ui/names.js';

const TEXT_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '14px',
  color: '#f4f1e8',
  backgroundColor: 'rgba(20, 22, 20, 0.72)',
  padding: { x: 10, y: 8 },
  lineSpacing: 4,
};

const KEY_NAMES = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const CHRONICLE_LINES = 8;
/** Events kept for the chronicle, so that changing the filter shows past ones. */
const CHRONICLE_KEEP = 200;

const HELP = [
  'Glisser / flèches : déplacer   Molette / + − : zoom   Clic : inspecter',
  'Espace : pause   1–5 : vitesse   6 : max   L : jusqu’à l’aube   N : prochain événement',
  'F : suivre l’individu   M : ce qu’il croit savoir   Échap : désélectionner',
  'T : accélération automatique   C : filtre de la chronique',
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
    const projects = buildProjects(projectData, buildGoalTable(aiGoals));
    this.names = buildNames(this.tables, buildCatalog(recipeData, this.tables), projects);
    /** @type {import('../sim/core/events.js').SimEvent[]} */
    this.chronicle = [];
    this.filter = 1;
    this.auto = false;
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
    this.colonyText = this.add.text(12, 0, '', small).setScrollFactor(0).setVisible(false);
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
    keyboard.on('keydown-C', () => {
      this.filter = (this.filter + 1) % FILTERS.length;
      this.drawChronicle();
      if (this.auto) sim.setAuto(true, this.alerts());
    });
    keyboard.on('keydown-T', () => {
      this.auto = !this.auto;
      sim.setAuto(this.auto, this.alerts());
    });
  }

  /**
   * Event types that interrupt the automatic acceleration: those of the current filter (the
   * "important" ones when the filter shows everything).
   * @returns {string[]}
   */
  alerts() {
    return FILTERS[this.filter].types ?? FILTERS[1].types;
  }

  /** @returns {void} */
  drawChronicle() {
    const filter = FILTERS[this.filter];
    const lines = this.chronicle
      .filter((e) => passes(e, filter))
      .slice(-CHRONICLE_LINES)
      .map((e) => formatEvent(e, balance.time, this.names));
    this.chronicleText.setText([`Chronique (${filter.name})`, ...lines]).setVisible(true);
    this.layout();
  }

  /** @returns {void} */
  layout() {
    const { width, height } = this.scale;
    this.colonyText.setPosition(12, this.status.y + this.status.height + 8);
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
      `Vitesse ${speed}${frame.skip ? ` ${SKIP_LABEL[frame.skip]}` : ''}${frame.auto ? ' auto' : ''}`,
      `Individus ${frame.agents.length}`,
      `${Math.round(this.game.loop.actualFps)} img/s`,
    ];
    this.status.setText(lines);

    if (frame.events.length > 0) {
      this.chronicle.push(...frame.events);
      const extra = this.chronicle.length - CHRONICLE_KEEP;
      if (extra > 0) this.chronicle.splice(0, extra);
      this.drawChronicle();
    }
    const colony = formatColony(frame.colony);
    this.colonyText.setText(colony).setVisible(colony.length > 0);

    if (this.agentSelected && frame.selected) {
      const panel = formatAgent(frame.selected, this.names, balance.time);
      if (this.following) panel[0] += ' · suivi';
      this.inspection.setText(panel).setVisible(true);
    }
    this.layout();
  }
}
