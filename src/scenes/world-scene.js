import * as Phaser from 'phaser';
import balance from '../../data/balance.json' with { type: 'json' };
import recipeData from '../../data/recipes.json' with { type: 'json' };
import resourceData from '../../data/resources.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { visibleRect } from '../render/camera-math.js';
import { CameraControls } from '../render/camera-controls.js';
import { ChunkLayer } from '../render/chunk-layer.js';
import { buildPalette } from '../render/palette.js';
import { buildCatalog } from '../sim/crafting/catalog.js';
import { buildWorldTables } from '../sim/world/world-data.js';
import { formatTile } from '../ui/tile-info.js';

/** Zoom levels (screen pixels per tile). */
export const ZOOM_STEPS = [1, 2, 3, 4, 6, 8, 12, 16];
const START_ZOOM = 8;
const VIEWPORT_SYNC_MS = 100;
/** A click this close to an individual (in tiles, from its centre) selects it. */
const PICK_RADIUS = 1.2;
/** A finger is less precise: it picks within this many screen pixels, whatever the zoom. */
const TOUCH_PICK_PX = 24;

// Darkness over the world by day phase: colour and opacity. Individuals stay visible above it.
const PHASE_SHADE = {
  day: { color: 0x000000, alpha: 0 },
  dusk: { color: 0x3a2410, alpha: 0.2 },
  night: { color: 0x0b1430, alpha: 0.45 },
  dawn: { color: 0x2a2a40, alpha: 0.18 },
};

const DEPTH = { chunks: 0, shade: 20, memory: 22, selection: 25, threats: 28, agents: 30 };

/** Colour of predators (data/world.json), drawn above the night shade like individuals. */
const PREDATOR_COLOR = Number.parseInt(worldData.threats.predator.color.slice(1), 16);

// Memory layer: explored cells fade from fresh to stale; places are outlined in their colour.
const LAYER = {
  exploredColor: 0xffffff,
  exploredFresh: 0.22,
  exploredStale: 0.03,
  staleTicks: balance.exploration.staleDays * balance.time.ticksPerDay,
  waterColor: 0x6fd3ff,
  dangerColor: 0xff40ff,
};

/**
 * Draws the world: chunks streamed by the worker, the day/night shade and the individuals.
 * Handles selection: a click picks an individual if one is close, otherwise a tile.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('world');
    this.tables = buildWorldTables(worldData, resourceData);
    this.catalog = buildCatalog(recipeData, this.tables);
    /** @type {string} */
    this.lastViewportKey = '';
    this.lastViewportSync = 0;
    /** @type {Map<number, Phaser.GameObjects.Rectangle>} */
    this.agentRects = new Map();
    /** @type {{ id: number, x: number, y: number }[]} */
    this.agents = [];
    /** @type {Map<number, Phaser.GameObjects.Rectangle>} */
    this.threatRects = new Map();
    /** @type {number} Selected individual, or -1. */
    this.selectedAgent = -1;
    this.following = false;
    this.memoryLayer = false;
    /** @type {{ x: number, y: number } | null} Colony camp, else spawn: where to recentre. */
    this.home = null;
    /** @type {{ x: number, y: number } | null} */
    this.spawn = null;
    /** Screen pixels covered by the phone HUD at the top and bottom. */
    this.insets = { top: 0, bottom: 0 };
  }

  /**
   * Centres the camera on a tile, in the part of the screen the HUD leaves visible.
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  centerOnTile(x, y) {
    const camera = this.cameras.main;
    const shift = (this.insets.bottom - this.insets.top) / 2 / camera.zoom;
    camera.centerOn(x + 0.5, y + 0.5 + shift);
  }

  create() {
    const camera = this.cameras.main;
    camera.setZoom(START_ZOOM);
    camera.setBackgroundColor('#23272a');
    camera.centerOn(0.5, 0.5);

    /** @type {import('../bridge/sim-client.js').SimClient} */
    const sim = this.registry.get('sim');
    this.sim = sim;
    const palette = buildPalette(this.tables, this.catalog.structures);
    this.chunks = new ChunkLayer(this, palette, DEPTH.chunks);

    this.shade = this.add.rectangle(0, 0, 1, 1, 0x000000, 0).setOrigin(0, 0).setDepth(DEPTH.shade);
    this.selection = this.add
      .rectangle(0, 0, 1, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(0.15, 0xffffff, 0.95)
      .setDepth(DEPTH.selection)
      .setVisible(false);

    this.memoryGraphics = this.add.graphics().setDepth(DEPTH.memory);
    // Memory layer colour per subject: water, resources, structures, then danger.
    const hex = (c) => Number.parseInt(c.slice(1), 16);
    this.subjectColors = [
      LAYER.waterColor,
      ...this.tables.resources.map((r) => hex(r.color)),
      ...this.catalog.structures.map((st) => hex(st.color)),
      LAYER.dangerColor,
    ];

    this.controls = new CameraControls(this, {
      zoomSteps: ZOOM_STEPS,
      onClick: (x, y, touch) => this.pick(x, y, touch),
    });

    const keyboard = this.input.keyboard;
    keyboard.on('keydown-F', () => this.setFollowing(!this.following));
    keyboard.on('keydown-ESC', () => this.clearSelection());
    keyboard.on('keydown-M', () => this.setMemoryLayer(!this.memoryLayer));
    const onCommand = (type) => this.command(type);
    this.game.events.on('hud-command', onCommand);
    const onInsets = (top, bottom) => {
      this.insets = { top, bottom };
    };
    this.game.events.on('view-insets', onInsets);

    const offReady = sim.onReady(({ spawn }) => {
      this.spawn = spawn;
      camera.centerOn(spawn.x + 0.5, spawn.y + 0.5);
    });
    const offChunk = sim.onChunk((chunk) => this.chunks.add(chunk));
    const offFrame = sim.onFrame((frame) => this.applyFrame(frame));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offReady();
      offChunk();
      offFrame();
      this.game.events.off('hud-command', onCommand);
      this.game.events.off('view-insets', onInsets);
    });

    this.scene.launch('ui');
  }

  /**
   * @param {number} _time
   * @param {number} delta
   */
  update(_time, delta) {
    this.controls.update(delta);
    if (this.following && this.selectedAgent >= 0) {
      const agent = this.agents.find((a) => a.id === this.selectedAgent);
      if (agent) this.centerOnTile(agent.x, agent.y);
    }
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
   * @param {{ time: { phase: string }, agents: { id: number, x: number, y: number }[] }} frame
   * @returns {void}
   */
  applyFrame(frame) {
    const shade = PHASE_SHADE[frame.time.phase] ?? PHASE_SHADE.day;
    this.shade.setFillStyle(shade.color, shade.alpha);

    this.agents = frame.agents;
    const seen = new Set();
    for (const a of frame.agents) {
      seen.add(a.id);
      let rect = this.agentRects.get(a.id);
      if (!rect) {
        // 1 pixel = 1 unit; pure black is reserved for individuals.
        rect = this.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setDepth(DEPTH.agents);
        this.agentRects.set(a.id, rect);
      }
      rect.setPosition(a.x, a.y);
    }
    for (const [id, rect] of this.agentRects) {
      if (seen.has(id)) continue;
      rect.destroy();
      this.agentRects.delete(id);
    }
    this.drawThreats(frame.threats ?? []);
    if (this.selectedAgent >= 0) {
      const agent = frame.agents.find((a) => a.id === this.selectedAgent);
      if (agent) this.selection.setPosition(agent.x, agent.y).setVisible(true);
      else this.clearSelection();
    }
    this.drawMemory(frame);
    if (frame.colony?.camp) this.home = frame.colony.camp;
  }

  /**
   * Commands from the phone HUD (the keyboard does the same on a computer).
   * @param {string} type - follow, memory, deselect, zoomIn, zoomOut or center.
   * @returns {void}
   */
  command(type) {
    const camera = this.cameras.main;
    const middle = { x: camera.width / 2, y: camera.height / 2 };
    if (type === 'follow') this.setFollowing(!this.following);
    else if (type === 'memory') this.setMemoryLayer(!this.memoryLayer);
    else if (type === 'deselect') this.clearSelection();
    else if (type === 'zoomIn') this.controls.zoomStep(1, middle);
    else if (type === 'zoomOut') this.controls.zoomStep(-1, middle);
    else if (type === 'center') {
      const at = this.home ?? this.spawn;
      if (at) this.centerOnTile(at.x, at.y);
    }
  }

  /**
   * Predators as dark red pixels.
   * @param {{ id: number, x: number, y: number }[]} threats
   * @returns {void}
   */
  drawThreats(threats) {
    const seen = new Set();
    for (const t of threats) {
      seen.add(t.id);
      let rect = this.threatRects.get(t.id);
      if (!rect) {
        rect = this.add.rectangle(0, 0, 1, 1, PREDATOR_COLOR);
        rect.setOrigin(0, 0).setDepth(DEPTH.threats);
        this.threatRects.set(t.id, rect);
      }
      rect.setPosition(t.x, t.y);
    }
    for (const [id, rect] of this.threatRects) {
      if (seen.has(id)) continue;
      rect.destroy();
      this.threatRects.delete(id);
    }
  }

  /**
   * Toggles the layer "what it believes it knows" for the selected individual.
   * @param {boolean} on
   * @returns {void}
   */
  setMemoryLayer(on) {
    this.memoryLayer = on;
    if (this.selectedAgent >= 0) this.sim.select(this.selectedAgent, on);
    if (!on) this.memoryGraphics.clear();
    this.game.events.emit('memory-layer-changed', on);
  }

  /**
   * Draws explored cells and remembered places of the selected individual.
   * @param {{ tick: number, selected: object | null }} frame
   * @returns {void}
   */
  drawMemory(frame) {
    const g = this.memoryGraphics;
    g.clear();
    const agent = frame.selected;
    if (!this.memoryLayer || !agent) return;
    if (agent.exploration) {
      const { cellSize, cells } = agent.exploration;
      for (let i = 0; i < cells.length; i += 3) {
        const age = Math.min(1, (frame.tick - cells[i + 2]) / LAYER.staleTicks);
        const alpha = LAYER.exploredFresh + (LAYER.exploredStale - LAYER.exploredFresh) * age;
        g.fillStyle(LAYER.exploredColor, alpha);
        g.fillRect(cells[i] * cellSize, cells[i + 1] * cellSize, cellSize, cellSize);
      }
    }
    const width = 2 / this.cameras.main.zoom;
    for (const p of agent.memory) {
      const color = this.subjectColors[p.subject] ?? LAYER.dangerColor;
      g.lineStyle(width, color, 0.25 + 0.75 * p.strength);
      g.strokeRect(p.x - 1, p.y - 1, 3, 3);
    }
  }

  /**
   * Selects the individual under a click, or inspects the tile.
   * @param {number} wx - World x of the click.
   * @param {number} wy
   * @param {boolean} [touch=false] - Made with a finger.
   * @returns {void}
   */
  pick(wx, wy, touch = false) {
    let best = -1;
    const radius = touch
      ? Math.max(PICK_RADIUS, TOUCH_PICK_PX / this.cameras.main.zoom)
      : PICK_RADIUS;
    let bestD2 = radius * radius;
    for (const a of this.agents) {
      const dx = a.x + 0.5 - wx;
      const dy = a.y + 0.5 - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = a.id;
      }
    }
    if (best >= 0) {
      this.selectedAgent = best;
      this.sim.select(best, this.memoryLayer);
      this.game.events.emit('agent-selected', best);
      return;
    }
    this.clearSelection();
    this.inspect(Math.floor(wx), Math.floor(wy));
  }

  /** @returns {void} */
  clearSelection() {
    if (this.selectedAgent >= 0) this.sim.select(-1);
    this.selectedAgent = -1;
    this.setFollowing(false);
    this.selection.setVisible(false);
    this.memoryGraphics.clear();
    this.game.events.emit('agent-selected', -1);
  }

  /**
   * @param {boolean} on
   * @returns {void}
   */
  setFollowing(on) {
    this.following = on && this.selectedAgent >= 0;
    this.game.events.emit('follow-changed', this.following);
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
    const text = tile
      ? formatTile(tile, this.tables, this.catalog.structures)
      : `(${x}, ${y}) · pas encore chargé`;
    this.game.events.emit('tile-inspected', text);
  }
}
