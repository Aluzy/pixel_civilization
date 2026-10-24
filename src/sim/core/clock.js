/**
 * @typedef {object} TimeConfig
 * @property {number} ticksPerSecond - Ticks per real second at ×1.
 * @property {number} ticksPerDay
 * @property {number} dayStartHour - Clock hour displayed at tick 0 of each day.
 * @property {{ name: string, fraction: number }[]} phases - In order; fractions sum to 1.
 * @property {number[]} speedSteps
 */

/**
 * @typedef {object} TickInfo
 * @property {number} tick
 * @property {number} day - 1-based day number.
 * @property {number} tickOfDay
 * @property {number} hour - 0 to 23.
 * @property {number} minute - 0 to 59.
 * @property {string} phase - Name of the current phase (day, dusk, night, dawn).
 */

/** @type {WeakMap<TimeConfig, number[]>} */
const boundaryCache = new WeakMap();

/**
 * Phase end boundaries in ticks, computed once per config to avoid float drift.
 * @param {TimeConfig} time
 * @returns {number[]}
 */
function phaseBoundaries(time) {
  let boundaries = boundaryCache.get(time);
  if (boundaries) return boundaries;
  const total = time.phases.reduce((sum, p) => sum + p.fraction, 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`Day phase fractions must sum to 1, got ${total}`);
  }
  let cumulative = 0;
  boundaries = time.phases.map((p) => {
    cumulative += p.fraction;
    return Math.round(cumulative * time.ticksPerDay);
  });
  boundaryCache.set(time, boundaries);
  return boundaries;
}

/**
 * Converts a tick count into calendar information. Pure function of its inputs.
 * @param {number} tick
 * @param {TimeConfig} time
 * @returns {TickInfo}
 */
export function describeTick(tick, time) {
  const boundaries = phaseBoundaries(time);
  const day = Math.floor(tick / time.ticksPerDay) + 1;
  const tickOfDay = tick % time.ticksPerDay;
  let phaseIndex = 0;
  while (phaseIndex < boundaries.length - 1 && tickOfDay >= boundaries[phaseIndex]) phaseIndex++;
  const minutesOfDay = Math.floor(
    (time.dayStartHour * 60 + (tickOfDay / time.ticksPerDay) * 1440) % 1440,
  );
  return {
    tick,
    day,
    tickOfDay,
    hour: Math.floor(minutesOfDay / 60),
    minute: minutesOfDay % 60,
    phase: time.phases[phaseIndex].name,
  };
}
