import balance from '../../data/balance.json' with { type: 'json' };
import { CHUNK_KEEP_MARGIN, CHUNK_SEND_MARGIN, FromWorker, ToWorker } from '../sim/protocol.js';
import { Simulation } from '../sim/simulation.js';
import { ChunkStreamer } from './chunk-streamer.js';
import { TickScheduler } from './scheduler.js';

// Real-time host of the simulation: owns pacing, the simulation owns logic.
const SLICE_MS = 10;
const FRAME_INTERVAL_MS = 33;
// Time per slice spent preparing chunks for the renderer, on top of the ticks.
const CHUNK_BUDGET_MS = 6;

/** @type {Simulation | null} */
let sim = null;
/** @type {TickScheduler | null} */
let scheduler = null;
/** @type {ChunkStreamer | null} */
let streamer = null;
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

/**
 * Sends chunks nearest to the view first, within the slice budget. Arrays are copied, then their
 * buffers are transferred, so the simulation keeps its own chunk.
 * @returns {void}
 */
function streamChunks() {
  if (!streamer) return;
  const start = performance.now();
  while (streamer.pending && performance.now() - start < CHUNK_BUDGET_MS) {
    const chunk = streamer.next();
    if (!chunk) break;
    const biome = chunk.biome.slice();
    const resource = chunk.resource.slice();
    const quantity = chunk.quantity.slice();
    const altitude = chunk.altitude.slice();
    self.postMessage(
      { type: FromWorker.CHUNK, cx: chunk.cx, cy: chunk.cy, biome, resource, quantity, altitude },
      [biome.buffer, resource.buffer, quantity.buffer, altitude.buffer],
    );
  }
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
    streamChunks();
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
      streamer = new ChunkStreamer(sim.world, {
        sendMargin: CHUNK_SEND_MARGIN,
        keepMargin: CHUNK_KEEP_MARGIN,
      });
      post({
        type: FromWorker.READY,
        seed: message.seed,
        tick: sim.tick,
        hash: sim.hash(),
        spawn: sim.spawn,
      });
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
    case ToWorker.VIEWPORT:
      streamer?.setViewport(message.rect);
      break;
    default:
      post({ type: FromWorker.ERROR, message: `Unknown message type: ${message.type}` });
  }
};
