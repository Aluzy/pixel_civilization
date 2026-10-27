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
import { AutoSpeed } from './auto-speed.js';
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
/** Days of history already sent to the renderer. */
let historySent = 0;
/** Whether the inspector also wants the selected agent's exploration map. */
let selectedWithMap = false;
/**
 * Fast-forward in progress: until a tick (dawn) or until a new event appears.
 * @type {{ kind: string, untilTick: number, afterSeq: number } | null}
 */
let skip = null;
/** Automatic acceleration, and the next event it has not looked at yet. */
const auto = new AutoSpeed({ steps: balance.time.speedSteps });
let autoSeq = 0;

/**
 * @param {object} message
 * @param {Transferable[]} [transfer] - Buffers handed over to the renderer.
 * @returns {void}
 */
function post(message, transfer = []) {
  self.postMessage(message, transfer);
}

/** @returns {void} */
function sendFrame() {
  if (!sim || !scheduler) return;
  const now = performance.now();
  lastFrameAt = now;
  const events = sim.events.since(nextEventSeq);
  if (events.length > 0) nextEventSeq = events.at(-1).seq + 1;
  const agents = sim.agentPositions();
  post(
    {
      type: FromWorker.FRAME,
      tick: sim.tick,
      time: sim.time(),
      speed: scheduler.speed,
      paused: scheduler.paused,
      effectiveSpeed: scheduler.effectiveSpeed(now),
      skip: skip?.kind ?? null,
      agents,
      threats: sim.threatPositions(),
      // The colony of the selected individual, else the first; and a line for each colony.
      colony: sim.describeColony(selectedColony()),
      colonies: sim.describeColonies(),
      auto: auto.enabled,
      events,
      selected: selected >= 0 ? sim.describeAgent(selected, selectedWithMap) : null,
      history: historyRows(),
    },
    [agents.ids.buffer, agents.xy.buffer, agents.asleep.buffer],
  );
}

/**
 * @returns {number} Colony of the selected individual, else 0.
 */
function selectedColony() {
  if (selected < 0 || sim.agents.alive[selected] !== 1) return 0;
  return Math.max(0, sim.agents.colony[selected]);
}

/**
 * Days of history recorded since the last frame, for the dashboard (the renderer keeps them).
 * @returns {{ from: number, rows: object[] } | null}
 */
function historyRows() {
  const h = sim.state.history;
  if (h.count === historySent) return null;
  const from = historySent;
  historySent = h.count;
  return { from, rows: h.rows(from) };
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
    const steps = sim.ctx.trailSteps;
    const trail = chunk.wear.map((w) => (w >= steps ? 1 : 0));
    const { cx, cy } = chunk;
    self.postMessage(
      { type: FromWorker.CHUNK, cx, cy, biome, resource, quantity, structure, altitude, trail },
      [
        biome.buffer,
        resource.buffer,
        quantity.buffer,
        structure.buffer,
        altitude.buffer,
        trail.buffer,
      ],
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
    if (auto.enabled && !skip) {
      const events = sim.events.since(autoSeq);
      autoSeq = sim.events.count;
      const speed = auto.update(events, performance.now(), scheduler.speed);
      if (speed !== null) scheduler.setSpeed(speed);
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
      historySent = 0;
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
      auto.setEnabled(false, performance.now());
      scheduler?.setSpeed(message.speed);
      if (scheduler?.paused) scheduler.resume();
      sendFrame();
      break;
    case ToWorker.PAUSE:
      skip = null;
      auto.setEnabled(false, performance.now());
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
    case ToWorker.AUTO:
      auto.setAlerts(message.alerts ?? []);
      auto.setEnabled(message.on === true, performance.now());
      autoSeq = sim ? sim.events.count : 0;
      if (scheduler?.paused && message.on) scheduler.resume();
      sendFrame();
      break;
    default:
      post({ type: FromWorker.ERROR, message: `Unknown message type: ${message.type}` });
  }
};
