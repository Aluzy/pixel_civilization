/**
 * Turns the raw content of data/world.json and data/resources.json into indexed tables used by
 * the generator and the renderer. Biome ids are indices into `biomes`; resource ids are indices
 * into `resources` plus one (0 means "no resource").
 */

/**
 * @typedef {object} BiomeDef
 * @property {string} id
 * @property {string} name
 * @property {string} color - "#rrggbb".
 * @property {Record<string, [number, number]>} when - Field ranges [min, max).
 */

/**
 * @typedef {object} ResourceDef
 * @property {string} id
 * @property {string} name
 * @property {string} color - "#rrggbb".
 * @property {boolean} renewable
 * @property {[number, number]} quantity - Inclusive range of units per tile.
 * @property {string} [tool] - Item needed to harvest it (data/recipes.json).
 */

/**
 * @typedef {object} Placement
 * @property {number} resource - Resource id (index + 1).
 * @property {number} index - Index of this rule, used as a noise and hash salt.
 * @property {number} scale
 * @property {number} threshold
 * @property {number} density
 * @property {number} minAltitude
 * @property {number} qMin
 * @property {number} qMax
 */

/**
 * @typedef {object} WorldTables
 * @property {number} chunkSize
 * @property {Record<string, import('./noise.js').FbmParams & { contrast: number }>} fields
 * @property {BiomeDef[]} biomes
 * @property {ResourceDef[]} resources - Index 0 is resource id 1.
 * @property {Placement[][]} placementsByBiome
 * @property {number} placementCount
 * @property {number[]} spawnBiomes - Biome indices where an individual may appear.
 * @property {number} spawnMaxRadius
 */

/**
 * @param {object} world - Content of data/world.json.
 * @param {object} resourceData - Content of data/resources.json.
 * @returns {WorldTables}
 */
export function buildWorldTables(world, resourceData) {
  const biomeIndex = new Map(world.biomes.map((b, i) => [b.id, i]));
  const resourceId = new Map(resourceData.resources.map((r, i) => [r.id, i + 1]));
  if (biomeIndex.size > 255 || resourceId.size > 255) {
    throw new Error('At most 255 biomes and 255 resources.');
  }

  /** @type {Placement[][]} */
  const placementsByBiome = world.biomes.map(() => []);
  resourceData.placement.forEach((p, index) => {
    const b = biomeIndex.get(p.biome);
    const r = resourceId.get(p.resource);
    if (b === undefined) throw new Error(`Unknown biome in placement: ${p.biome}`);
    if (r === undefined) throw new Error(`Unknown resource in placement: ${p.resource}`);
    const [qMin, qMax] = resourceData.resources[r - 1].quantity;
    placementsByBiome[b].push({
      resource: r,
      index,
      scale: p.scale,
      threshold: p.threshold,
      density: p.density,
      minAltitude: p.minAltitude ?? 0,
      qMin,
      qMax,
    });
  });

  const spawnBiomes = world.spawn.biomes.map((id) => {
    const b = biomeIndex.get(id);
    if (b === undefined) throw new Error(`Unknown spawn biome: ${id}`);
    return b;
  });

  return {
    chunkSize: world.chunkSize,
    fields: world.fields,
    biomes: world.biomes,
    resources: resourceData.resources,
    placementsByBiome,
    placementCount: resourceData.placement.length,
    spawnBiomes,
    spawnMaxRadius: world.spawn.maxRadius,
  };
}
