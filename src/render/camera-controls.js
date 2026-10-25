import * as Phaser from 'phaser';
import { nextZoom, scrollToKeepPoint } from './camera-math.js';

// Observer camera: drag, wheel, pinch and keyboard. Presentation only, never touches the sim.
const DRAG_THRESHOLD_PX = 4;
const KEY_PAN_SPEED = 700; // Screen pixels per second.
const PINCH_STEP = 1.25; // Finger distance ratio that triggers one zoom step.

/**
 * @typedef {object} CameraControlsOptions
 * @property {number[]} zoomSteps
 * @property {(x: number, y: number, touch: boolean) => void} onClick - World coordinates of a
 *   click (not a drag), and whether a finger made it.
 */

export class CameraControls {
  /**
   * @param {Phaser.Scene} scene
   * @param {CameraControlsOptions} options
   */
  constructor(scene, { zoomSteps, onClick }) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.zoomSteps = zoomSteps;
    this.onClick = onClick;
    /** @type {{ x: number, y: number, scrollX: number, scrollY: number } | null} */
    this.dragStart = null;
    this.dragging = false;
    this.pinchDistance = 0;

    const input = scene.input;
    input.addPointer(1);
    input.on('pointerdown', (p) => this.pointerDown(p));
    input.on('pointermove', (p) => this.pointerMove(p));
    input.on('pointerup', (p) => this.pointerUp(p));
    input.on('wheel', (p, _objects, _dx, dy) => this.zoomStep(dy > 0 ? -1 : 1, p));

    const K = Phaser.Input.Keyboard.KeyCodes;
    const keyboard = scene.input.keyboard;
    this.keys = {
      left: [K.LEFT, K.A, K.Q].map((k) => keyboard.addKey(k, false)),
      right: [K.RIGHT, K.D].map((k) => keyboard.addKey(k, false)),
      up: [K.UP, K.W, K.Z].map((k) => keyboard.addKey(k, false)),
      down: [K.DOWN, K.S].map((k) => keyboard.addKey(k, false)),
    };
    const center = () => ({ x: this.camera.width / 2, y: this.camera.height / 2 });
    keyboard.on('keydown-PLUS', () => this.zoomStep(1, center()));
    keyboard.on('keydown-NUMPAD_ADD', () => this.zoomStep(1, center()));
    keyboard.on('keydown-MINUS', () => this.zoomStep(-1, center()));
    keyboard.on('keydown-NUMPAD_SUBTRACT', () => this.zoomStep(-1, center()));
  }

  /** @returns {import('./camera-math.js').CameraView} */
  view() {
    const c = this.camera;
    return {
      scrollX: c.scrollX,
      scrollY: c.scrollY,
      zoom: c.zoom,
      width: c.width,
      height: c.height,
    };
  }

  /**
   * @param {1 | -1} direction
   * @param {{ x: number, y: number }} pointer - Screen point kept fixed.
   * @returns {void}
   */
  zoomStep(direction, pointer) {
    const z = nextZoom(this.camera.zoom, direction, this.zoomSteps);
    if (z === this.camera.zoom) return;
    const scroll = scrollToKeepPoint(this.view(), pointer, z);
    this.camera.setZoom(z);
    this.camera.setScroll(scroll.scrollX, scroll.scrollY);
  }

  /** @param {Phaser.Input.Pointer} p */
  pointerDown(p) {
    if (this.bothDown()) {
      this.dragStart = null;
      this.pinchDistance = this.fingerDistance();
      return;
    }
    this.dragStart = { x: p.x, y: p.y, scrollX: this.camera.scrollX, scrollY: this.camera.scrollY };
    this.dragging = false;
  }

  /** @param {Phaser.Input.Pointer} p */
  pointerMove(p) {
    if (this.bothDown()) {
      const d = this.fingerDistance();
      const ratio = this.pinchDistance > 0 ? d / this.pinchDistance : 1;
      if (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP) {
        const a = this.scene.input.pointer1;
        const b = this.scene.input.pointer2;
        this.zoomStep(d > this.pinchDistance ? 1 : -1, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        this.pinchDistance = d;
      }
      return;
    }
    if (!p.isDown || !this.dragStart) return;
    const dx = p.x - this.dragStart.x;
    const dy = p.y - this.dragStart.y;
    if (!this.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    this.dragging = true;
    const z = this.camera.zoom;
    this.camera.setScroll(this.dragStart.scrollX - dx / z, this.dragStart.scrollY - dy / z);
  }

  /** @param {Phaser.Input.Pointer} p */
  pointerUp(p) {
    const wasClick = this.dragStart && !this.dragging;
    this.dragStart = null;
    this.dragging = false;
    this.pinchDistance = 0;
    if (!wasClick) return;
    const world = this.camera.getWorldPoint(p.x, p.y);
    this.onClick(world.x, world.y, p.wasTouch === true);
  }

  /** @returns {boolean} */
  bothDown() {
    return this.scene.input.pointer1.isDown && this.scene.input.pointer2.isDown;
  }

  /** @returns {number} */
  fingerDistance() {
    const a = this.scene.input.pointer1;
    const b = this.scene.input.pointer2;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * Keyboard panning, at a constant on-screen speed whatever the zoom.
   * @param {number} deltaMs
   * @returns {void}
   */
  update(deltaMs) {
    const held = (list) => list.some((k) => k.isDown);
    const step = (KEY_PAN_SPEED * deltaMs) / 1000 / this.camera.zoom;
    const dx = (held(this.keys.right) ? step : 0) - (held(this.keys.left) ? step : 0);
    const dy = (held(this.keys.down) ? step : 0) - (held(this.keys.up) ? step : 0);
    if (dx !== 0 || dy !== 0) {
      this.camera.setScroll(this.camera.scrollX + dx, this.camera.scrollY + dy);
    }
  }
}
