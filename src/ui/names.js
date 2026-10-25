/**
 * @typedef {object} Names
 * @property {{ name: string }[]} resources - Index = resource id − 1.
 * @property {string[]} [structures] - Index = structure code − 1.
 * @property {boolean[]} [feminine] - Per structure code − 1: its name is feminine.
 * @property {string[]} [recipes] - Name of what each recipe makes.
 * @property {string[]} [projects]
 */

/**
 * Display names of everything the simulation refers to by number.
 * @param {import('../sim/world/world-data.js').WorldTables} tables
 * @param {import('../sim/crafting/catalog.js').Catalog} catalog
 * @param {import('../sim/ai/projects.js').ProjectTable} projects
 * @returns {Names}
 */
export function buildNames(tables, catalog, projects) {
  return {
    resources: tables.resources,
    structures: catalog.structures.map((s) => s.name),
    feminine: catalog.structures.map((s) => s.feminine),
    recipes: catalog.recipes.map((r) => r.name),
    projects: projects.projects.map((p) => p.name),
  };
}

/**
 * Name of a memory subject: water (0), a resource, a structure, or a danger (the last one).
 * @param {number} subject
 * @param {Names} names
 * @returns {string}
 */
export function subjectLabel(subject, names) {
  if (subject === 0) return 'Eau';
  const r = names.resources.length;
  if (subject <= r) return names.resources[subject - 1].name;
  const structures = names.structures ?? [];
  return subject - r <= structures.length ? structures[subject - r - 1] : 'Danger';
}
