import balance from '../../data/balance.json' with { type: 'json' };
import { FromWorker, ToWorker } from '../sim/protocol.js';
import { Simulation } from '../sim/simulation.js';
import { TickScheduler } from './scheduler.js';

// Real-time host of the simulation: owns pacing, the simulation owns logic.
const SLICE_MS = 10;
const FRAME_INTERVAL_MS = 33;

/** @type {Simulation | null} */
let sim = null;
/** @type {TickScheduler | null} */
let scheduler = null;
let lastFrameAt = -Infinity;
let running = false;

/**
 * @param {object} message
 * @returns {void}
 */
function post(message) {
  self.postMessage(message);
}

/** @returns {void} */
function sendFrame() {
  if (!sim || !scheduler) return;
  const now = performance.now();
  lastFrameAt = now;
  post({
    type: FromWorker.FRAME,
    tick: sim.tick,
    time: sim.time(),
    speed: scheduler.speed,
    paused: scheduler.paused,
    effectiveSpeed: scheduler.effectiveSpeed(now),
  });
}

/** @returns {void} */
function slice() {
  if (!sim || !scheduler) return;
  try {
    const n = scheduler.due(performance.now());
    if (n > 0) {
      const start = performance.now();
      sim.step(n);
      const end = performance.now();
      scheduler.done(n, end, end - start);
    }
    if (performance.now() - lastFrameAt >= FRAME_INTERVAL_MS) sendFrame();
  } catch (error) {
    post({ type: FromWorker.ERROR, message: String(error && error.stack ? error.stack : error) });
    running = false;
    return;
  }
  setTimeout(slice, SLICE_MS);
}

self.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case ToWorker.INIT:
      sim = new Simulation({ seed: message.seed, balance });
      scheduler = new TickScheduler({ ticksPerSecond: balance.time.ticksPerSecond });
      post({ type: FromWorker.READY, seed: message.seed, tick: sim.tick, hash: sim.hash() });
      if (!running) {
        running = true;
        slice();
      }
      break;
    case ToWorker.SET_SPEED:
      scheduler?.setSpeed(message.speed);
      if (scheduler?.paused) scheduler.resume();
      sendFrame();
      break;
    case ToWorker.PAUSE:
      scheduler?.pause();
      sendFrame();
      break;
    case ToWorker.RESUME:
      scheduler?.resume();
      sendFrame();
      break;
    default:
      post({ type: FromWorker.ERROR, message: `Unknown message type: ${message.type}` });
  }
};
