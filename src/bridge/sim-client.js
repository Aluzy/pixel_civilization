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

  /** @returns {void} */
  togglePause() {
    const paused = this.lastFrame?.paused ?? false;
    this.worker.postMessage({ type: paused ? ToWorker.RESUME : ToWorker.PAUSE });
  }
}
