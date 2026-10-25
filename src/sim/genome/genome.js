// Decision genome (docs/design/06-ia.md, couche 8): a few genes per individual that weigh its
// goals. The founder carries the start values; each replica inherits its parent's genes, each
// moved by a normal draw of standard deviation `mutation` × range, kept within the range. There
// is no explicit selection: genes that help survive and replicate spread on their own.

/**
 * @typedef {object} GeneDef
 * @property {string} id
 * @property {string} name
 * @property {number} min
 * @property {number} max
 * @property {number} start - Founder value, the middle of the range.
 * @property {number[]} goals - Goal indices weighed by this gene.
 */

/**
 * @typedef {object} GeneTable
 * @property {GeneDef[]} genes
 * @property {Record<string, number>} index - Gene index per id.
 */

/**
 * Builds the gene table from data/genome.json and the goal table.
 * @param {{ genes: { id: string, name: string, range: number[], start: number,
 *   goals: string[] }[] }} data
 * @param {{ goals: { id: string }[] }} goalTable
 * @returns {GeneTable}
 */
export function buildGeneTable(data, goalTable) {
  const goalIds = goalTable.goals.map((g) => g.id);
  const genes = data.genes.map((g) => {
    const [min, max] = g.range;
    if (!(min < max) || g.start < min || g.start > max) throw new Error(`Gene ${g.id}: bad range`);
    const goals = g.goals.map((id) => {
      const i = goalIds.indexOf(id);
      if (i < 0) throw new Error(`Gene ${g.id}: unknown goal ${id}`);
      return i;
    });
    return { id: g.id, name: g.name, min, max, start: g.start, goals };
  });
  return { genes, index: Object.fromEntries(genes.map((g, i) => [g.id, i])) };
}

/**
 * Approximately normal draw (Irwin–Hall: 12 uniforms), mean 0, standard deviation 1. Uses only
 * additions, so it is identical on every engine (decision 0005).
 * @param {import('../core/rng.js').Rng} rng
 * @returns {number}
 */
export function normal(rng) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += rng.next();
  return s - 6;
}

/**
 * Writes the child's genes: the parent's, each mutated and kept in range.
 * @param {GeneTable} table
 * @param {Float64Array} genes - All agents' genes, `table.genes.length` per agent.
 * @param {number} parent
 * @param {number} child
 * @param {number} mutation - Standard deviation, as a share of each gene's range.
 * @param {import('../core/rng.js').Rng} rng
 * @returns {void}
 */
export function inherit(table, genes, parent, child, mutation, rng) {
  const n = table.genes.length;
  for (let k = 0; k < n; k++) {
    const g = table.genes[k];
    const v = genes[parent * n + k] + normal(rng) * mutation * (g.max - g.min);
    genes[child * n + k] = v < g.min ? g.min : v > g.max ? g.max : v;
  }
}

/**
 * Founder genes: the start values.
 * @param {GeneTable} table
 * @param {Float64Array} genes
 * @param {number} id
 * @returns {void}
 */
export function founder(table, genes, id) {
  const n = table.genes.length;
  for (let k = 0; k < n; k++) genes[id * n + k] = table.genes[k].start;
}

/**
 * Multiplier of each goal's score for one agent: the product, over the genes that weigh the goal,
 * of 1 + (gene − start) / range (1 for a founder; 0.5 to 1.5 over the range).
 * @param {GeneTable} table
 * @param {Float64Array} genes
 * @param {number} id
 * @param {Float64Array} out - One per goal.
 * @returns {void}
 */
export function goalWeights(table, genes, id, out) {
  out.fill(1);
  const n = table.genes.length;
  for (let k = 0; k < n; k++) {
    const g = table.genes[k];
    if (g.goals.length === 0) continue;
    const f = 1 + (genes[id * n + k] - g.start) / (g.max - g.min);
    for (const goal of g.goals) out[goal] *= f;
  }
}

/**
 * Share of the gene's effect in [0, 1]: 0 at the bottom of its range, 1 at the top.
 * @param {GeneTable} table
 * @param {Float64Array} genes
 * @param {number} id
 * @param {number} k - Gene index.
 * @returns {number}
 */
export function geneLevel(table, genes, id, k) {
  const g = table.genes[k];
  return (genes[id * table.genes.length + k] - g.min) / (g.max - g.min);
}
