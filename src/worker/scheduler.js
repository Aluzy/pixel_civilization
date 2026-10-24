import { MAX_SPEED } from '../sim/protocol.js';

/**
 * Decides how many simulation ticks to run in each real-time slice.
 * Lives outside src/sim because it reads real time; the simulation itself only counts ticks.
 * Speed only changes how many ticks run per real second, never what a tick does.
 */
export class TickScheduler {
  /**
   * @param {object} options
   * @param {number} options.ticksPerSecond - Ticks per real second at ×1.
   * @param {number} [options.sliceBudgetMs=12] - Max work per slice, to keep the worker responsive.
   * @param {number} [options.maxBacklogSeconds=0.25] - Late ticks kept before being dropped.
   * @param {number} [options.windowMs=1000] - Window used to measure the effective speed.
   */
  constructor({ ticksPerSecond, sliceBudgetMs = 12, maxBacklogSeconds = 0.25, windowMs = 1000 }) {
    this.ticksPerSecond = ticksPerSecond;
    this.sliceBudgetMs = sliceBudgetMs;
    this.maxBacklogSeconds = maxBacklogSeconds;
    this.windowMs = windowMs;
    /** @type {number | 'max'} */
    this.speed = 1;
    this.paused = false;
    /** Fractional ticks owed to the simulation. */
    this.backlog = 0;
    /** Smoothed cost of one tick, in ms. */
    this.msPerTick = 0.01;
    /** @type {number | null} */
    this.lastNow = null;
    /** @type {number | null} */
    this.windowStart = null;
    /** @type {{ t: number, n: number }[]} */
    this.history = [];
  }

  /**
   * @param {number | 'max'} speed - A positive multiplier, or 'max'.
   * @returns {void}
   */
  setSpeed(speed) {
    if (speed !== MAX_SPEED && !(typeof speed === 'number' && speed > 0)) {
      throw new Error(`Invalid speed: ${speed}`);
    }
    this.speed = speed;
    this.backlog = 0;
    this.resetWindow();
  }

  /** @returns {void} */
  pause() {
    this.paused = true;
    this.backlog = 0;
  }

  /** @returns {void} */
  resume() {
    this.paused = false;
    this.lastNow = null;
    this.resetWindow();
  }

  /** @returns {void} */
  resetWindow() {
    this.history.length = 0;
    this.windowStart = null;
  }

  /**
   * Number of ticks to run now.
   * @param {number} now - Current real time in ms.
   * @returns {number}
   */
  due(now) {
    const dt = this.lastNow === null ? 0 : now - this.lastNow;
    this.lastNow = now;
    if (this.windowStart === null) this.windowStart = now;
    if (this.paused) return 0;

    const affordable = Math.max(1, Math.floor(this.sliceBudgetMs / this.msPerTick));
    if (this.speed === MAX_SPEED) return affordable;

    const rate = this.ticksPerSecond * this.speed;
    this.backlog = Math.min(this.backlog + (dt / 1000) * rate, rate * this.maxBacklogSeconds + 1);
    return Math.min(Math.floor(this.backlog), affordable);
  }

  /**
   * Reports the ticks actually run and how long they took.
   * @param {number} ticks
   * @param {number} now - Real time in ms after running them.
   * @param {number} workMs - Time spent running them.
   * @returns {void}
   */
  done(ticks, now, workMs) {
    if (ticks <= 0) return;
    if (this.speed !== MAX_SPEED) this.backlog = Math.max(0, this.backlog - ticks);
    const sample = workMs / ticks;
    this.msPerTick = Math.max(1e-4, this.msPerTick * 0.8 + sample * 0.2);
    this.history.push({ t: now, n: ticks });
    while (this.history.length > 0 && this.history[0].t < now - this.windowMs) this.history.shift();
  }

  /**
   * Speed actually achieved over the measurement window, as a multiplier of ×1.
   * @param {number} now - Real time in ms.
   * @returns {number}
   */
  effectiveSpeed(now) {
    if (this.paused || this.windowStart === null) return 0;
    const span = Math.min(this.windowMs, now - this.windowStart);
    if (span <= 0) return 0;
    let ticks = 0;
    for (const h of this.history) if (h.t >= now - this.windowMs) ticks += h.n;
    return ticks / (span / 1000) / this.ticksPerSecond;
  }
}
