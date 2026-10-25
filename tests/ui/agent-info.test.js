import { describe, expect, it } from 'vitest';
import balance from '../../data/balance.json' with { type: 'json' };
import { CATALOG, PROJECTS, Simulation, WORLD_TABLES } from '../../src/sim/simulation.js';
import { bar, formatAgent } from '../../src/ui/agent-info.js';
import { formatEvent } from '../../src/ui/chronicle.js';
import { formatColony } from '../../src/ui/colony-info.js';
import { buildNames, subjectLabel } from '../../src/ui/names.js';
import { formatTile } from '../../src/ui/tile-info.js';

const NAMES = buildNames(WORLD_TABLES, CATALOG, PROJECTS);

describe('agent panel', () => {
  it('draws proportional bars', () => {
    expect(bar(0, 100, 10)).toBe('░░░░░░░░░░');
    expect(bar(50, 100, 10)).toBe('█████░░░░░');
    expect(bar(100, 100, 10)).toBe('██████████');
    expect(bar(130, 100, 4)).toBe('████');
  });

  it('describes a live agent with needs, goal, memory and recent decisions', () => {
    const sim = new Simulation({ seed: 2, balance });
    sim.step(600);
    const lines = formatAgent(sim.describeAgent(0), NAMES, balance.time);
    const text = lines.join('\n');
    expect(lines[0]).toMatch(/^Individu #0/);
    for (const label of ['PV', 'Faim', 'Soif', 'Fatigue', 'Curiosité', 'Objectif', 'Porte']) {
      expect(text).toContain(label);
    }
    expect(text).toMatch(/Décisions récentes/);
    expect(text).toMatch(/J1 \d\d:\d\d/);
  });
});

describe('chronicle', () => {
  it('formats events with day and time', () => {
    const event = { seq: 0, tick: 0, type: 'birth', agent: 0, x: 3, y: -2 };
    expect(formatEvent(event, balance.time)).toBe('J1 06:00 · Premier pas de l’individu #0.');
    const death = { seq: 5, tick: 1200 * 3, type: 'death', agent: 0, x: 0, y: 0 };
    expect(formatEvent(death, balance.time)).toBe('J4 06:00 · Mort de l’individu #0.');
  });
});

describe('memory chronicle', () => {
  it('describes forgetting, failing and rediscovering places', () => {
    const at = { seq: 1, tick: 0, agent: 0, x: 4, y: -7 };
    const water = { ...at, subject: 0 };
    const berries = { ...at, subject: 1 };
    expect(formatEvent({ ...water, type: 'forgotPlace' }, balance.time, WORLD_TABLES)).toBe(
      'J1 06:00 · L’individu #0 a oublié un point d’eau (4, -7).',
    );
    expect(formatEvent({ ...berries, type: 'notFound' }, balance.time, WORLD_TABLES)).toBe(
      'J1 06:00 · L’individu #0 ne retrouve pas un lieu de baies dont il se souvenait.',
    );
    expect(formatEvent({ ...water, type: 'rediscovered' }, balance.time, WORLD_TABLES)).toBe(
      'J1 06:00 · L’individu #0 retrouve un point d’eau oublié (4, -7).',
    );
    expect(formatEvent({ ...berries, type: 'searching' }, balance.time, WORLD_TABLES)).toBe(
      'J1 06:00 · L’individu #0 cherche de quoi manger sans savoir où.',
    );
  });

  it('lists remembered places with their strength in the panel', () => {
    const sim = new Simulation({ seed: 3, balance });
    sim.step(1200);
    const text = formatAgent(sim.describeAgent(0), NAMES, balance.time).join('\n');
    expect(text).toMatch(/Mémoire \d+\/20/);
    expect(text).toMatch(/ +\(-?\d+, -?\d+\) +[█░]{8} vu J1/);
  });
});

describe('crafting in the panel and the chronicle', () => {
  it('shows the plan, the project, the recipes and the fights', () => {
    const sim = new Simulation({ seed: 3, balance });
    sim.step(1200 * 2);
    const text = formatAgent(sim.describeAgent(0), NAMES, balance.time).join('\n');
    expect(text).toMatch(/Plan : /);
    expect(text).toMatch(/Recettes \(échecs retenus \d+\) : .*Établi/);
    expect(text).toMatch(/Arme ×\d · combat \d+ % · prédateurs tués \d+/);
  });

  it('names structures and dangers among memories', () => {
    const r = WORLD_TABLES.resources.length;
    expect(subjectLabel(r + 1, NAMES)).toBe('Établi');
    expect(subjectLabel(CATALOG.dangerSubject, NAMES)).toBe('Danger');
  });

  it('tells discoveries, buildings, projects and attacks', () => {
    const at = { seq: 1, tick: 0, agent: 0, x: 4, y: -7 };
    const workbench = CATALOG.recipes.findIndex((x) => x.id === 'workbench');
    const line = (type, subject = -1) => formatEvent({ ...at, type, subject }, balance.time, NAMES);
    expect(line('discovered', workbench)).toBe(
      'J1 06:00 · L’individu #0 découvre comment faire : Établi.',
    );
    expect(line('built', workbench)).toBe('J1 06:00 · L’individu #0 bâtit : Établi (4, -7).');
    expect(line('projectDone', 0)).toBe(
      'J1 06:00 · L’individu #0 achève son projet « S’installer ».',
    );
    expect(line('attacked')).toBe('J1 06:00 · Un prédateur attaque l’individu #0 !');
    expect(line('predatorKilled')).toBe('J1 06:00 · L’individu #0 tue un prédateur.');
  });

  it('shows a structure on an inspected tile', () => {
    const tile = { x: 1, y: 2, biome: 1, resource: 0, quantity: 0, structure: 2, altitude: 128 };
    expect(formatTile(tile, WORLD_TABLES, CATALOG.structures)).toContain('Abri');
  });
});

describe('written knowledge in the panels and the chronicle', () => {
  const recipe = (id) => CATALOG.recipes.findIndex((r) => r.id === id);
  const at = { seq: 1, tick: 0, agent: 3, x: 2, y: 5 };

  it('tells writing, reading, fires, abandonment, lost and found knowledge, old age', () => {
    const spear = { ...at, subject: recipe('spear') };
    const say = (e) => formatEvent(e, balance.time, NAMES).slice('J1 06:00 · '.length);
    expect(say({ ...spear, type: 'written' })).toBe(
      'L’individu #3 écrit dans un livre comment faire : Lance.',
    );
    expect(say({ ...spear, type: 'read' })).toBe(
      'L’individu #3 apprend dans un livre comment faire : Lance.',
    );
    expect(say({ ...spear, type: 'knowledgeLost', agent: -1 })).toBe(
      'Savoir perdu : plus personne ne sait faire Lance.',
    );
    expect(say({ ...spear, type: 'knowledgeRecovered', agent: -1 })).toBe(
      'Savoir retrouvé : on sait de nouveau faire Lance.',
    );
    expect(say({ ...at, type: 'fire', agent: -1, subject: 4 })).toBe(
      'La bibliothèque (2, 5) brûle, et 4 document(s) avec elle.',
    );
    expect(say({ ...at, type: 'abandoned', agent: -1, subject: 0 })).toMatch(/abandonnée/);
    expect(say({ ...at, type: 'death', subject: 1 })).toBe('Mort de l’individu #3, de vieillesse.');
    const library = CATALOG.resourceCount + CATALOG.structures.find((s) => s.id === 'library').code;
    expect(say({ ...at, type: 'forgotPlace', subject: library })).toBe(
      'L’individu #3 a oublié sa bibliothèque (2, 5).',
    );
  });

  it('shows the libraries and the knowledge of the colony, and the books carried', () => {
    const sim = new Simulation({ seed: 3, balance });
    const a = sim.agents;
    const colony = sim.state.colonies[0];
    const [lx, ly] = [a.x[0] + 1, a.y[0]];
    colony.addLibrary(lx, ly, 0);
    colony.scribe = 0;
    sim.state.knowledge.noteDiscovery(recipe('spear'), 0, 0);
    a.recipes[0].learn(recipe('spear'), 0, 1000);
    const doc = sim.state.documents.create(1, 0, 0);
    sim.state.documents.recipes[doc] = 1 << recipe('spear');
    sim.step(100);
    const lines = formatColony(sim.describeColony(0));
    expect(lines).toContain(`Bibliothèque (${lx}, ${ly}) : 0 document(s), 0 recette(s)`);
    expect(lines).toContain('Scribe : #0');
    expect(lines).toContain('Savoir : 1 recette(s) connue(s), 1 écrite(s)');
    const text = formatAgent(sim.describeAgent(0), NAMES, balance.time).join('\n');
    expect(text).toContain('Livre : Lance');
    expect(text).toContain('rôle : scribe');
    expect(text).toMatch(/· 0\/\d+ j ·/);
  });
});
