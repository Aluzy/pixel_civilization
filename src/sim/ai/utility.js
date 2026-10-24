import { compileCurve, evaluateCurve } from './curves.js';

/**
 * Sensor inputs available to considerations, all normalised to [0, 1]. They are computed by code
 * (see systems/decision-system.js); data/ai-goals.json refers to them by name.
 */
export const INPUT = Object.freeze({
  hunger: 0,
  thirst: 1,
  fatigue: 2,
  curiosity: 3,
  darkness: 4,
  one: 5,
  needShelter: 6,
  needWeapon: 7,
  needTool: 8,
  danger: 9,
  vulnerability: 10,
  colonyTask: 11,
  canReplicate: 12,
});

const INPUT_COUNT = Object.keys(INPUT).length;

/**
 * @typedef {object} GoalDef
 * @property {string} id
 * @property {string} name
 * @property {number} level - Index in the pyramid of needs.
 * @property {{ input: number, curve: import('./curves.js').Curve }[]} considerations
 */

/**
 * @typedef {object} GoalTable
 * @property {GoalDef[]} goals
 * @property {string[]} levels
 * @property {{ level: number, inputs: number[], curve: import('./curves.js').Curve }[]} urgency
 * @property {number} suppression
 * @property {number} inertia
 * @property {Float64Array} levelUrgency - Scratch buffer, one value per level.
 */

/**
 * @param {string} name
 * @returns {number}
 */
function inputIndex(name) {
  const i = INPUT[name];
  if (i === undefined) throw new Error(`Unknown utility input: ${name}`);
  return i;
}

/**
 * Compiles data/ai-goals.json into indexed tables for fast scoring.
 * @param {object} data
 * @returns {GoalTable}
 */
export function buildGoalTable(data) {
  const levelIndex = (name) => {
    const i = data.levels.indexOf(name);
    if (i < 0) throw new Error(`Unknown pyramid level: ${name}`);
    return i;
  };
  const goals = data.goals.map((g) => ({
    id: g.id,
    name: g.name,
    level: levelIndex(g.level),
    considerations: g.considerations.map((c) => ({
      input: inputIndex(c.input),
      curve: compileCurve(c.curve ?? { type: 'linear' }),
    })),
  }));
  const urgency = Object.entries(data.urgency).map(([level, u]) => ({
    level: levelIndex(level),
    inputs: u.inputs.map(inputIndex),
    curve: compileCurve(u.curve),
  }));
  return {
    goals,
    levels: data.levels,
    urgency,
    suppression: data.suppression,
    inertia: data.inertia,
    levelUrgency: new Float64Array(data.levels.length),
  };
}

/**
 * Scores every goal and returns the index of the best one.
 *
 * score = Π curve(input) × compensation × pyramid × (1 + inertia if current goal)
 * × (1 + bonus if the goal is the current step of a project), where
 * compensation keeps goals with many considerations comparable (multiplying several factors
 * below 1 would otherwise penalise them), and pyramid suppresses a goal while the levels below
 * it are urgent. Exact ties are broken with the agent's own random stream.
 *
 * @param {GoalTable} table
 * @param {Float64Array} inputs - Indexed by {@link INPUT}.
 * @param {number} currentGoal - Index of the goal being pursued, or -1.
 * @param {Float64Array} out - Receives one score per goal.
 * @param {import('../core/rng.js').Rng} rng
 * @param {number} [favoured=-1] - Goal of the current project step, or -1.
 * @param {number} [bonus=0] - Its score is multiplied by 1 + bonus.
 * @returns {number}
 */
export function scoreGoals(table, inputs, currentGoal, out, rng, favoured = -1, bonus = 0) {
  if (inputs.length < INPUT_COUNT) throw new Error('Utility inputs buffer too short');
  const urgency = table.levelUrgency;
  urgency.fill(0);
  for (const u of table.urgency) {
    let max = 0;
    for (const i of u.inputs) if (inputs[i] > max) max = inputs[i];
    urgency[u.level] = evaluateCurve(u.curve, max);
  }

  let best = 0;
  let bestScore = -1;
  let ties = 0;
  for (let g = 0; g < table.goals.length; g++) {
    const goal = table.goals[g];
    let p = 1;
    for (const c of goal.considerations) p *= evaluateCurve(c.curve, inputs[c.input]);
    const n = goal.considerations.length;
    if (n > 1) p += (1 - p) * (1 - 1 / n) * p;
    for (let l = 0; l < goal.level; l++) p *= 1 - urgency[l] * table.suppression;
    if (g === currentGoal) p *= 1 + table.inertia;
    if (g === favoured) p *= 1 + bonus;
    out[g] = p;
    if (p > bestScore) {
      bestScore = p;
      best = g;
      ties = 1;
    } else if (p === bestScore) {
      ties++;
    }
  }
  if (ties > 1) {
    let pick = rng.int(0, ties - 1);
    for (let g = 0; g < out.length; g++) {
      if (out[g] === bestScore && pick-- === 0) return g;
    }
  }
  return best;
}
