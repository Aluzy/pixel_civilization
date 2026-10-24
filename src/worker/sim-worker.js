import balance from '../../data/balance.json' with { type: 'json' };
import { nextPhaseStart } from '../sim/core/clock.js';
import {
  CHUNK_KEEP_MARGIN,
  CHUNK_SEND_MARGIN,
  FromWorker,
  MAX_SPEED,
  SkipKind,
  ToWorker,
} from '../sim/protocol.js';
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
/** Next event sequence number the renderer has not received yet. */
let nextEventSeq = 0;
/** @type {number} Agent shown in the inspector, or -1. */
let selected = -1;
/** Whether the inspector also wants the selected agent's exploration map. */
let selectedWithMap = false;
/**
 * Fast-forward in progress: until a tick (dawn) or until a new event appears.
 * @type {{ kind: string, untilTick: number, afterSeq: number } | null}
 */
let skip = null;

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
  const events = sim.events.since(nextEventSeq);
  if (events.length > 0) nextEventSeq = events.at(-1).seq + 1;
  post({
    type: FromWorker.FRAME,
    tick: sim.tick,
    time: sim.time(),
    speed: scheduler.speed,
    paused: scheduler.paused,
    effectiveSpeed: scheduler.effectiveSpeed(now),
    skip: skip?.kind ?? null,
    agents: sim.agentPositions(),
    threats: sim.threatPositions(),
    events,
    selected: selected >= 0 ? sim.describeAgent(selected, selectedWithMap) : null,
  });
}

/**
 * True once the requested fast-forward has reached its goal.
 * @returns {boolean}
 */
function skipReached() {
  if (!skip || !sim) return false;
  if (skip.kind === SkipKind.DAWN) return sim.tick >= skip.untilTick;
  return sim.events.count > skip.afterSeq;
}

/**
 * Runs up to `n` ticks, stopping exactly when a fast-forward is reached.
 * @param {number} n
 * @returns {number} Ticks actually run.
 */
function runTicks(n) {
  if (!sim || !scheduler) return 0;
  if (!skip) {
    sim.step(n);
    return n;
  }
  for (let i = 0; i < n; i++) {
    sim.step(1);
    if (skipReached()) {
      skip = null;
      scheduler.setSpeed(1);
      return i + 1;
    }
  }
  return n;
}

/**
 * Sends chunks nearest to the view first, within the slice budget, after queuing again those the
 * simulation changed. Arrays are copied, then their buffers are transferred, so the simulation
 * keeps its own chunk.
 * @returns {void}
 */
function streamChunks() {
  if (!streamer || !sim) return;
  for (const chunk of sim.world.takeDirty()) streamer.resend(chunk.cx, chunk.cy);
  const start = performance.now();
  while (streamer.pending && performance.now() - start < CHUNK_BUDGET_MS) {
    const chunk = streamer.next();
    if (!chunk) break;
    const biome = chunk.biome.slice();
    const resource = chunk.resource.slice();
    const quantity = chunk.quantity.slice();
    const structure = chunk.structure.slice();
    const altitude = chunk.altitude.slice();
    const { cx, cy } = chunk;
    self.postMessage(
      { type: FromWorker.CHUNK, cx, cy, biome, resource, quantity, structure, altitude },
      [biome.buffer, resource.buffer, quantity.buffer, structure.buffer, altitude.buffer],
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
      const ran = runTicks(n);
      const end = performance.now();
      scheduler.done(ran, end, end - start);
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

/**
 * @param {string} kind
 * @returns {void}
 */
function startSkip(kind) {
  if (!sim || !scheduler) return;
  skip = {
    kind,
    untilTick: kind === SkipKind.DAWN ? nextPhaseStart(sim.tick, balance.time, 'dawn') : 0,
    afterSeq: sim.events.count,
  };
  scheduler.setSpeed(MAX_SPEED);
  if (scheduler.paused) scheduler.resume();
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
      nextEventSeq = 0;
      selected = -1;
      skip = null;
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
      skip = null;
      scheduler?.setSpeed(message.speed);
      if (scheduler?.paused) scheduler.resume();
      sendFrame();
      break;
    case ToWorker.PAUSE:
      skip = null;
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
    case ToWorker.SELECT:
      selected = Number.isInteger(message.id) ? message.id : -1;
      selectedWithMap = message.withMap === true;
      sendFrame();
      break;
    case ToWorker.SKIP:
      startSkip(message.kind);
      sendFrame();
      break;
    default:
      post({ type: FromWorker.ERROR, message: `Unknown message type: ${message.type}` });
  }
};
