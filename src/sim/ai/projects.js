/**
 * @typedef {object} ProjectDef
 * @property {string} id
 * @property {string} name
 * @property {{ goal: number, name: string }[]} steps - Goal index of each step, in order.
 */

/**
 * @typedef {object} ProjectTable
 * @property {number} bonus - Utility bonus of the goal of the current step (score × (1 + bonus)).
 * @property {ProjectDef[]} projects
 */

/**
 * Compiles data/ai-projects.json (docs/design/06-ia.md, couche 5): a project is an ordered list
 * of steps, each one an ordinary goal planned by the GOAP.
 * @param {object} data
 * @param {import('./utility.js').GoalTable} goals
 * @returns {ProjectTable}
 */
export function buildProjects(data, goals) {
  const index = (id) => {
    const i = goals.goals.findIndex((g) => g.id === id);
    if (i < 0) throw new Error(`Project step refers to unknown goal: ${id}`);
    return i;
  };
  return {
    bonus: data.bonus,
    projects: data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      steps: p.steps.map((s) => ({ goal: index(s.goal), name: s.name })),
    })),
  };
}
