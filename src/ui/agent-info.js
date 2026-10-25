import { PlanNote } from '../sim/agents/journal.js';
import { PlanStatus } from '../sim/ai/planner.js';
import { shortClock } from './chronicle.js';
import { subjectLabel } from './names.js';

const MEMORY_LINES = 4;

const NOTE_TEXT = {
  [PlanNote.SEEN]: 'en vue',
  [PlanNote.REMEMBERED]: 'lieu mémorisé',
  [PlanNote.SEARCHING]: 'recherche',
  [PlanNote.HERE]: 'sur place',
  [PlanNote.CARRIED]: 'provisions',
  [PlanNote.PLAN]: 'plan',
  [PlanNote.TRIAL]: 'essai',
  [PlanNote.FLEEING]: 'fuite',
  [PlanNote.SHELTER]: 'abri',
  [PlanNote.COLONY]: 'colonie',
  [PlanNote.REPLICATION]: 'réplication',
  [PlanNote.PANTRY]: 'réserve',
  [PlanNote.WRITING]: 'écrit',
  [PlanNote.READING]: 'lit',
  [PlanNote.HIDING]: 'à couvert',
  [PlanNote.GUARDING]: 'garde',
  [PlanNote.HUNTING]: 'chasse',
  [PlanNote.FARMING]: 'travail aux champs',
  [PlanNote.COOKING]: 'cuisine',
};

/**
 * One line for the current plan of a crafting goal.
 * @param {{ status: number, cost: number, nodes: number, steps: string[] } | null} plan
 * @returns {string}
 */
function planLine(plan) {
  if (!plan) return 'Plan : —';
  if (plan.status === PlanStatus.DONE) return 'Plan : but atteint';
  if (plan.status !== PlanStatus.OK) return `Plan : recette inconnue, il expérimente`;
  return `Plan : ${plan.steps.join(' › ')} (~${plan.cost} c., ${plan.nodes} nœuds)`;
}

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
 * @param {import('./names.js').Names} names
 * @param {import('../sim/core/clock.js').TimeConfig} time
 * @returns {string[]}
 */
export function formatAgent(agent, names, time) {
  const days = Math.floor(agent.age / time.ticksPerDay);
  const item = (i) => `${i.name} × ${i.count}`;
  const carried = agent.inventory.length === 0 ? 'rien' : agent.inventory.map(item).join(', ');
  const hp = String(Math.round(agent.hp)).padStart(3);
  const memoryTitle = `Mémoire ${agent.memory.length}/${agent.memoryCapacity}`;
  const doing = agent.asleep ? 'dort' : agent.action;
  const life = agent.lifespan ? `/${Math.floor(agent.lifespan / time.ticksPerDay)}` : '';
  const lines = [
    `Individu #${agent.id} · (${agent.x}, ${agent.y}) · ${days}${life} j · génération ` +
      `${agent.generation}`,
    `${'PV'.padEnd(9)} ${bar(agent.hp, agent.maxHp, 12)} ${hp}`,
    need('Faim', agent.needs.hunger),
    need('Soif', agent.needs.thirst),
    need('Fatigue', agent.needs.fatigue),
    need('Curiosité', agent.needs.curiosity),
    need('Peur', agent.fear ?? 0),
    `Objectif : ${agent.goal} (${doing})`,
    planLine(agent.plan),
    `Porte : ${carried}`,
  ];
  if (agent.project) {
    const steps = agent.project.steps.map((st, i) => (i === agent.project.step ? `▶ ${st}` : st));
    lines.push(`Projet « ${agent.project.name} » : ${steps.join(' · ')}`);
  }
  const known = agent.recipes.map((r) => `${r.name} ${bar(r.strength, 1, 4)}`).join(' · ');
  lines.push(`Recettes (échecs retenus ${agent.failures}) : ${known || 'aucune'}`);
  for (const doc of agent.documents ?? []) {
    lines.push(
      doc.kind === 'book'
        ? `Livre : ${doc.recipes.join(', ') || 'vierge'}`
        : `Carte : ${doc.places} lieu(x)`,
    );
  }
  if (agent.genes) {
    const shown = agent.genes.map(
      (g) => `${g.name.replace(/^Poids (de la |du )/, '')} ${g.value.toFixed(2)}`,
    );
    lines.push(`Génome : ${shown.join(' · ')}`);
  }
  const learnt = agent.experience;
  if (learnt && learnt.costs.length + learnt.zones.length > 0) {
    const costs = learnt.costs.map((c) => `${c.name} ${c.ticks} cycles/unité`);
    const zones = learnt.zones.map(
      (z) => `zone (${z.x}, ${z.y}) : ${z.attacks} attaque(s) en ${z.passes} passage(s)`,
    );
    lines.push(`Appris : ${[...costs, ...zones].join(' · ')}`);
  }
  const risk = Math.round(agent.fightRisk * 100);
  const skill = Math.round((agent.combatSkill ?? 0) * 100);
  const armor = agent.armor ? ` · armure +${agent.armor}` : '';
  lines.push(
    `Arme ×${agent.weapon}${armor} · combat ${skill} % · prédateurs tués ${agent.kills} · ` +
      `risque imaginé ${risk} %`,
  );
  const lineage = agent.parent >= 0 ? `réplique de #${agent.parent}` : 'fondateur';
  const role = agent.guard ? 'garde' : agent.scribe ? 'scribe' : agent.role;
  lines.push(`${lineage} · ${agent.children} réplique(s) · rôle : ${role}`);
  if (agent.task) lines.push(`Tâche : ${agent.task}`);
  if (agent.social.length > 0) {
    const peers = agent.social.slice(0, 3).map((p) => {
      const work = p.shared > 0 ? `, ${p.shared} projet(s)` : '';
      return `#${p.id} (${p.talks} échange(s)${work})`;
    });
    lines.push(`Liens : ${peers.join(' · ')}`);
  }
  const vital = `eau ${agent.knownWater.length}, nourriture ${agent.knownFood.length}`;
  lines.push(`${memoryTitle} (${vital}) :`);
  for (const p of agent.memory.slice(0, MEMORY_LINES)) {
    const name = subjectLabel(p.subject, names).padEnd(14).slice(0, 14);
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
