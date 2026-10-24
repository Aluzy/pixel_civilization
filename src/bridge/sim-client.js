import { FromWorker, ToWorker } from '../sim/protocol.js';

/**
 * Renderer-side client of the simulation worker. The renderer never touches simulation state:
 * it only sends commands and receives frames.
 */
export class SimClient {
  constructor() {
    /** @type {Worker} */
    this.worker = new Worker(new URL('../worker/sim-worker.js', import.meta.url), {
      type: 'module',
    });
    /** @type {object | null} Last frame received. */
    this.lastFrame = null;
    /** @type {Set<(frame: object) => void>} */
    this.frameListeners = new Set();
    /** @type {object | null} The READY message, once received. */
    this.ready = null;
    /** @type {Set<(ready: object) => void>} */
    this.readyListeners = new Set();
    /** @type {Set<(chunk: object) => void>} */
    this.chunkListeners = new Set();
    this.worker.onmessage = (event) => this.handle(event.data);
    this.worker.onerror = (event) => console.error('Simulation worker error:', event.message);
  }

  /**
   * @param {{ type: string }} message
   * @returns {void}
   */
  handle(message) {
    switch (message.type) {
      case FromWorker.READY:
        console.info(`Simulation ready (seed ${message.seed}, state ${message.hash}).`);
        this.ready = message;
        for (const listener of this.readyListeners) listener(message);
        break;
      case FromWorker.CHUNK:
        for (const listener of this.chunkListeners) listener(message);
        break;
      case FromWorker.FRAME:
        this.lastFrame = message;
        for (const listener of this.frameListeners) listener(message);
        break;
      case FromWorker.ERROR:
        console.error('Simulation error:', message.message);
        break;
      default:
        console.warn('Unknown message from simulation:', message);
    }
  }

  /**
   * @param {(frame: object) => void} listener
   * @returns {() => void} Unsubscribe function.
   */
  onFrame(listener) {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /**
   * Calls the listener once the simulation is ready (immediately if it already is).
   * @param {(ready: { seed: number, spawn: { x: number, y: number } }) => void} listener
   * @returns {() => void} Unsubscribe function.
   */
  onReady(listener) {
    if (this.ready) listener(this.ready);
    else this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  /**
   * @param {(chunk: import('../render/chunk-layer.js').ChunkMessage) => void} listener
   * @returns {() => void} Unsubscribe function.
   */
  onChunk(listener) {
    this.chunkListeners.add(listener);
    return () => this.chunkListeners.delete(listener);
  }

  /**
   * Tells the worker which tiles are visible, so it streams the matching chunks.
   * @param {{ x0: number, y0: number, x1: number, y1: number }} rect
   * @returns {void}
   */
  setViewport(rect) {
    this.worker.postMessage({ type: ToWorker.VIEWPORT, rect });
  }

  /**
   * @param {number} seed
   * @returns {void}
   */
  init(seed) {
    this.worker.postMessage({ type: ToWorker.INIT, seed });
  }

  /**
   * @param {number | 'max'} speed
   * @returns {void}
   */
  setSpeed(speed) {
    this.worker.postMessage({ type: ToWorker.SET_SPEED, speed });
  }

  /**
   * Chooses the agent described in each frame (`frame.selected`), or none with -1.
   * @param {number} id
   * @returns {void}
   */
  select(id) {
    this.worker.postMessage({ type: ToWorker.SELECT, id });
  }

  /**
   * Fast-forwards until dawn or until the next event, then returns to ×1.
   * @param {string} kind - A {@link SkipKind}.
   * @returns {void}
   */
  skip(kind) {
    this.worker.postMessage({ type: ToWorker.SKIP, kind });
  }

  /** @returns {void} */
  togglePause() {
    const paused = this.lastFrame?.paused ?? false;
    this.worker.postMessage({ type: paused ? ToWorker.RESUME : ToWorker.PAUSE });
  }
}
