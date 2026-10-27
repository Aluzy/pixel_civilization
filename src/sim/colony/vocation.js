// Vocations of the towns (decision 0030, docs/design/19-grand-essor.md): a colony sends its scout
// for a site suited to what it lacks most (the goods dearest at its counter): a plain to farm, a
// quarry, a fishing shore, a forest. The town founded there works its land first: its people
// gather its goods faster and sell them at the counter, and the caravans carry them away.

/**
 * @typedef {object} Vocation
 * @property {string} id
 * @property {string} name
 * @property {number[]} goods - Goods it lives from (resource ids).
 * @property {Uint8Array} biomes - 1 for each biome its site is made of (with `share`).
 * @property {number} share - Share of the scout's sight in those biomes, 0 if none.
 * @property {number} resource - Resource its site must hold, 0 if none.
 * @property {number} tiles - Tiles of that resource in sight.
 * @property {number} plots - Fields it wants per member, as a multiple of the usual.
 */

/**
 * @param {{ vocations: object[] }} data - Content of data/vocations.json.
 * @param {import('../world/world-data.js').WorldTables} tables
 * @returns {Vocation[]}
 */
export function buildVocations(data, tables) {
  const resourceOf = (id) => {
    const g = tables.resources.findIndex((r) => r.id === id) + 1;
    if (g <= 0) throw new Error(`Unknown resource: ${id}`);
    return g;
  };
  return data.vocations.map((v) => {
    const biomes = Uint8Array.from(tables.biomes, (b) => (v.site.biomes?.includes(b.id) ? 1 : 0));
    return {
      id: v.id,
      name: v.name,
      goods: v.goods.map(resourceOf),
      biomes,
      share: v.site.share ?? 0,
      resource: v.site.resource ? resourceOf(v.site.resource) : 0,
      tiles: v.site.tiles ?? 0,
      plots: v.plots ?? 1,
    };
  });
}

/**
 * What the colony's next town should live from: the vocation whose goods are dearest at its
 * counter (against their reference price), fewer towns of that vocation already breaking ties.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('./colony-store.js').Colony} colony
 * @returns {number} Vocation index.
 */
export function chooseVocation(state, ctx, colony) {
  const vocations = ctx.vocations;
  let best = 0;
  let bestScore = -Infinity;
  for (let v = 0; v < vocations.length; v++) {
    let dear = 0;
    for (const g of vocations[v].goods) {
      const ratio = colony.price[g] / ctx.basePrices[g];
      if (ratio > dear) dear = ratio;
    }
    let towns = 0;
    for (const c of state.colonies) if (c.members > 0 && c.vocation === v) towns++;
    const score = dear - ctx.balance.migration.vocationSpread * towns;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/**
 * Whether the scout's sight (the navigation window, prepared) suits a vocation: enough of its
 * biomes, or enough tiles of its resource (fish beside the shore).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Vocation} vocation
 * @returns {boolean}
 */
export function siteFits(ctx, vocation) {
  const nav = ctx.nav;
  const n = nav.side * nav.side;
  let land = 0;
  let biome = 0;
  let tiles = 0;
  for (let i = 0; i < n; i++) {
    if (nav.biome[i] !== nav.waterBiome) land++;
    if (vocation.biomes[nav.biome[i]] === 1) biome++;
    const r = vocation.resource;
    if (r > 0 && nav.resource[i] === r && nav.quantity[i] > 0) tiles++;
  }
  if (vocation.share > 0 && (land === 0 || biome / land < vocation.share)) return false;
  return vocation.tiles === 0 || tiles >= vocation.tiles;
}

/**
 * The vocation of the agent's town, or null.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {Vocation | null}
 */
export function vocationOf(state, ctx, id) {
  const c = ctx.agents.colony[id];
  if (c < 0) return null;
  const v = state.colonies[c].vocation;
  return v >= 0 ? ctx.vocations[v] : null;
}

/**
 * Speed of a commoner's harvest of `good`: faster for the goods its town lives from.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} good
 * @returns {number} Factor, 1 or more.
 */
export function craftOfTown(state, ctx, id, good) {
  const vocation = vocationOf(state, ctx, id);
  if (vocation === null || !vocation.goods.includes(good)) return 1;
  return 1 + ctx.balance.people.vocationBonus;
}
