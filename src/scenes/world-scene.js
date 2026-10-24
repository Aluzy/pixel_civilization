import * as Phaser from 'phaser';
import resourceData from '../../data/resources.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { visibleRect } from '../render/camera-math.js';
import { CameraControls } from '../render/camera-controls.js';
import { ChunkLayer } from '../render/chunk-layer.js';
import { buildPalette } from '../render/palette.js';
import { buildWorldTables } from '../sim/world/world-data.js';
import { formatTile } from '../ui/tile-info.js';

/** Zoom levels (screen pixels per tile). */
export const ZOOM_STEPS = [1, 2, 3, 4, 6, 8, 12, 16];
const START_ZOOM = 8;
const VIEWPORT_SYNC_MS = 100;

// Darkness over the world by day phase: colour and opacity. Individuals stay visible above it.
const PHASE_SHADE = {
  day: { color: 0x000000, alpha: 0 },
  dusk: { color: 0x3a2410, alpha: 0.2 },
  night: { color: 0x0b1430, alpha: 0.45 },
  dawn: { color: 0x2a2a40, alpha: 0.18 },
};

const DEPTH = { chunks: 0, shade: 20, selection: 25, agents: 30 };

/**
 * Draws the world: chunks streamed by the worker, the day/night shade and the individuals.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('world');
    this.tables = buildWorldTables(worldData, resourceData);
    /** @type {string} */
    this.lastViewportKey = '';
    this.lastViewportSync = 0;
  }

  create() {
    const camera = this.cameras.main;
    camera.setZoom(START_ZOOM);
    camera.setBackgroundColor('#23272a');
    camera.centerOn(0.5, 0.5);

    /** @type {import('../bridge/sim-client.js').SimClient} */
    const sim = this.registry.get('sim');
    this.sim = sim;
    this.chunks = new ChunkLayer(this, buildPalette(this.tables), DEPTH.chunks);

    this.shade = this.add.rectangle(0, 0, 1, 1, 0x000000, 0).setOrigin(0, 0).setDepth(DEPTH.shade);
    this.selection = this.add
      .rectangle(0, 0, 1, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(0.15, 0xffffff, 0.95)
      .setDepth(DEPTH.selection)
      .setVisible(false);
    // 1 pixel = 1 unit; pure black is reserved for individuals.
    this.individual = this.add
      .rectangle(0, 0, 1, 1, 0x000000)
      .setOrigin(0, 0)
      .setDepth(DEPTH.agents)
      .setVisible(false);

    this.controls = new CameraControls(this, {
      zoomSteps: ZOOM_STEPS,
      onClick: (x, y) => this.inspect(Math.floor(x), Math.floor(y)),
    });

    const offReady = sim.onReady(({ spawn }) => {
      this.individual.setPosition(spawn.x, spawn.y).setVisible(true);
      camera.centerOn(spawn.x + 0.5, spawn.y + 0.5);
    });
    const offChunk = sim.onChunk((chunk) => this.chunks.add(chunk));
    const offFrame = sim.onFrame((frame) => this.applyPhase(frame.time.phase));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offReady();
      offChunk();
      offFrame();
    });

    this.scene.launch('ui');
  }

  /**
   * @param {number} _time
   * @param {number} delta
   */
  update(_time, delta) {
    this.controls.update(delta);
    const rect = visibleRect(this.controls.view());
    this.shade.setPosition(rect.x0, rect.y0).setScale(rect.x1 - rect.x0, rect.y1 - rect.y0);
    this.selection.setStrokeStyle(2 / this.cameras.main.zoom, 0xffffff, 0.95);
    this.syncViewport(rect);
  }

  /**
   * Sends the visible area to the worker when it changed, at most every VIEWPORT_SYNC_MS.
   * @param {{ x0: number, y0: number, x1: number, y1: number }} rect
   * @returns {void}
   */
  syncViewport(rect) {
    const now = this.time.now;
    if (now - this.lastViewportSync < VIEWPORT_SYNC_MS) return;
    const r = {
      x0: Math.floor(rect.x0),
      y0: Math.floor(rect.y0),
      x1: Math.floor(rect.x1),
      y1: Math.floor(rect.y1),
    };
    const key = `${r.x0},${r.y0},${r.x1},${r.y1}`;
    if (key === this.lastViewportKey) return;
    this.lastViewportKey = key;
    this.lastViewportSync = now;
    this.sim.setViewport(r);
    this.chunks.keepOnly(r);
  }

  /**
   * @param {string} phase
   * @returns {void}
   */
  applyPhase(phase) {
    const shade = PHASE_SHADE[phase] ?? PHASE_SHADE.day;
    this.shade.setFillStyle(shade.color, shade.alpha);
  }

  /**
   * Shows what is on a tile, from the renderer's read-only copy of the chunk.
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  inspect(x, y) {
    const tile = this.chunks.tileAt(x, y);
    this.selection.setPosition(x, y).setVisible(true);
    const text = tile ? formatTile(tile, this.tables) : `(${x}, ${y}) · pas encore chargé`;
    this.game.events.emit('tile-inspected', text);
  }
}
