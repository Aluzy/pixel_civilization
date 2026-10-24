import * as Phaser from 'phaser';
import balance from '../../data/balance.json' with { type: 'json' };
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

/**
 * Observer overlay: seed, version, clock, speed and time controls. Independent of camera zoom.
 */
export class UiScene extends Phaser.Scene {
  constructor() {
    super('ui');
  }

  create() {
    /** @type {import('../bridge/sim-client.js').SimClient} */
    const sim = this.registry.get('sim');
    const seed = this.registry.get('seed');
    const version = `v${this.registry.get('version')} · ${this.registry.get('commit')}`;

    this.status = this.add.text(12, 12, '', TEXT_STYLE).setScrollFactor(0);
    this.footer = this.add
      .text(12, 0, `Graine ${seed}   ${version}`, { ...TEXT_STYLE, fontSize: '12px' })
      .setScrollFactor(0);
    this.help = this.add
      .text(0, 0, 'Espace : pause   1–5 : vitesse   6 : max', { ...TEXT_STYLE, fontSize: '12px' })
      .setScrollFactor(0);
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());

    const unsubscribe = sim.onFrame((frame) => this.render(frame));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.render(null);

    const keyboard = this.input.keyboard;
    keyboard.on('keydown-SPACE', () => sim.togglePause());
    balance.time.speedSteps.forEach((speed, i) => {
      if (KEY_NAMES[i]) keyboard.on(`keydown-${KEY_NAMES[i]}`, () => sim.setSpeed(speed));
    });
    keyboard.on('keydown-SIX', () => sim.setSpeed('max'));
  }

  /** @returns {void} */
  layout() {
    const { width, height } = this.scale;
    this.footer.setPosition(12, height - this.footer.height - 12);
    this.help.setPosition(width - this.help.width - 12, height - this.help.height - 12);
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
    this.status.setText([
      'Pixel Civilisation',
      formatClock(frame.time),
      `Vitesse ${speed}`,
      `Cycle ${frame.tick.toLocaleString('fr-FR')}`,
    ]);
  }
}
