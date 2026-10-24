import * as Phaser from 'phaser';

// Placeholder palette until biomes exist (J1); the background follows the day phase.
const PHASE_BACKGROUNDS = {
  day: '#c9d3a8',
  dusk: '#a39a7c',
  night: '#3b4139',
  dawn: '#b3b393',
};

const START_ZOOM = 12;

/**
 * Draws the world. In J0, a single black pixel: the lone individual at the origin.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('world');
    /** @type {string | null} */
    this.currentPhase = null;
  }

  create() {
    const camera = this.cameras.main;
    camera.setZoom(START_ZOOM);
    camera.centerOn(0.5, 0.5);
    camera.setBackgroundColor(PHASE_BACKGROUNDS.day);

    // 1 pixel = 1 unit; pure black is reserved for individuals.
    this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0);

    /** @type {import('../bridge/sim-client.js').SimClient} */
    const sim = this.registry.get('sim');
    const unsubscribe = sim.onFrame((frame) => this.applyFrame(frame));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

    this.scene.launch('ui');
  }

  /**
   * @param {{ time: { phase: string } }} frame
   * @returns {void}
   */
  applyFrame(frame) {
    const phase = frame.time.phase;
    if (phase === this.currentPhase) return;
    this.currentPhase = phase;
    this.cameras.main.setBackgroundColor(PHASE_BACKGROUNDS[phase] ?? PHASE_BACKGROUNDS.day);
  }
}
