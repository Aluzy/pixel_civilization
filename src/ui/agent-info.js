import { PlanNote } from '../sim/agents/journal.js';
import { shortClock } from './chronicle.js';

const MEMORY_LINES = 5;

/**
 * @param {number} subject
 * @param {import('../sim/world/world-data.js').WorldTables} tables
 * @returns {string}
 */
function subjectName(subject, tables) {
  return subject === 0 ? 'Eau' : tables.resources[subject - 1].name;
}

const NOTE_TEXT = {
  [PlanNote.SEEN]: 'en vue',
  [PlanNote.REMEMBERED]: 'lieu mémorisé',
  [PlanNote.SEARCHING]: 'recherche',
  [PlanNote.HERE]: 'sur place',
  [PlanNote.CARRIED]: 'provisions',
};

/**
 * Text bar for a value, e.g. "████░░░░".
 * @param {number} value
 * @param {number} max
 * @param {number} width
 * @returns {string}
 */
export function bar(value, max, width) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * @param {number} v
 * @returns {string}
 */
function score(v) {
  return v.toFixed(2).replace('.', ',');
}

/**
 * @param {string} label
 * @param {number} value
 * @returns {string}
 */
function need(label, value) {
  return `${label.padEnd(9)} ${bar(value, 100, 12)} ${String(Math.round(value)).padStart(3)}`;
}

/**
 * Lines of the inspector panel for one agent (from Simulation#describeAgent).
 * @param {object} agent
 * @param {import('../sim/world/world-data.js').WorldTables} tables
 * @param {import('../sim/core/clock.js').TimeConfig} time
 * @returns {string[]}
 */
export function formatAgent(agent, tables, time) {
  const days = Math.floor(agent.age / time.ticksPerDay);
  const item = (i) => `${tables.resources[i.resource - 1].name} × ${i.count}`;
  const carried = agent.inventory.length === 0 ? 'rien' : agent.inventory.map(item).join(', ');
  const hp = String(Math.round(agent.hp)).padStart(3);
  const memoryTitle = `Mémoire ${agent.memory.length}/${agent.memoryCapacity}`;
  const doing = agent.asleep ? 'dort' : agent.action;
  const lines = [
    `Individu #${agent.id} · (${agent.x}, ${agent.y}) · ${days} j`,
    `${'PV'.padEnd(9)} ${bar(agent.hp, agent.maxHp, 12)} ${hp}`,
    need('Faim', agent.needs.hunger),
    need('Soif', agent.needs.thirst),
    need('Fatigue', agent.needs.fatigue),
    need('Curiosité', agent.needs.curiosity),
    `Objectif : ${agent.goal} (${doing})`,
    `Porte : ${carried}`,
    `${memoryTitle} (eau ${agent.knownWater.length}, nourriture ${agent.knownFood.length}) :`,
  ];
  for (const p of agent.memory.slice(0, MEMORY_LINES)) {
    const name = subjectName(p.subject, tables).padEnd(14).slice(0, 14);
    const where = `(${p.x}, ${p.y})`.padEnd(12);
    lines.push(`  ${name} ${where} ${bar(p.strength, 1, 8)} vu ${shortClock(p.seen, time)}`);
  }
  const more = agent.memory.length - MEMORY_LINES;
  if (more > 0) lines.push(`  … et ${more} autres`);
  lines.push('Décisions récentes :');
  for (const e of agent.journal.slice(0, 4)) {
    const alternatives = e.top.map((t) => `${t.goal} ${score(t.score)}`).join(' › ');
    const note = NOTE_TEXT[e.note] ? ` (${NOTE_TEXT[e.note]})` : '';
    lines.push(`  ${shortClock(e.tick, time)} ${e.action}${note} — ${alternatives}`);
  }
  return lines;
}
