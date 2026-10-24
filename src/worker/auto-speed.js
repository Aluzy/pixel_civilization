/**
 * Automatic acceleration (docs/design/08-interface.md): when on, the speed goes up one step after
 * `quietMs` of real time without an alert event, and back to ×1 as soon as an alert happens. Which
 * event types are alerts is chosen by the observer. Pure logic: the caller passes the time.
 */
export class AutoSpeed {
  /**
   * @param {object} options
   * @param {number[]} options.steps - Speed steps, increasing.
   * @param {number} [options.quietMs=10000]
   */
  constructor({ steps, quietMs = 10000 }) {
    this.steps = steps;
    this.quietMs = quietMs;
    this.enabled = false;
    /** @type {Set<string>} */
    this.alerts = new Set();
    this.lastAlertAt = 0;
  }

  /**
   * @param {boolean} on
   * @param {number} now - Real time, ms.
   * @returns {void}
   */
  setEnabled(on, now) {
    this.enabled = on;
    this.lastAlertAt = now;
  }

  /**
   * @param {string[]} types
   * @returns {void}
   */
  setAlerts(types) {
    this.alerts = new Set(types);
  }

  /**
   * New speed to apply after these events, or null to keep the current one.
   * @param {{ type: string }[]} events - Events since the last call.
   * @param {number} now
   * @param {number | 'max'} speed - Current speed.
   * @returns {number | null}
   */
  update(events, now, speed) {
    if (!this.enabled) return null;
    if (events.some((e) => this.alerts.has(e.type))) {
      this.lastAlertAt = now;
      return speed === 1 ? null : 1;
    }
    if (now - this.lastAlertAt < this.quietMs) return null;
    this.lastAlertAt = now;
    if (typeof speed !== 'number') return null;
    const next = this.steps.find((s) => s > speed);
    return next ?? null;
  }
}
