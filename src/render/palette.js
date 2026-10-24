/**
 * @param {string} hex - "#rrggbb".
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * @typedef {object} Palette
 * @property {Uint8Array} biomes - RGB triplets, indexed by biome index.
 * @property {Uint8Array} resources - RGB triplets, indexed by resource id (0 unused).
 */

/**
 * Colour lookup tables built from the world data.
 * @param {import('../sim/world/world-data.js').WorldTables} tables
 * @returns {Palette}
 */
export function buildPalette(tables) {
  const biomes = new Uint8Array(tables.biomes.length * 3);
  tables.biomes.forEach((b, i) => biomes.set(hexToRgb(b.color), i * 3));
  const resources = new Uint8Array((tables.resources.length + 1) * 3);
  tables.resources.forEach((r, i) => resources.set(hexToRgb(r.color), (i + 1) * 3));
  return { biomes, resources };
}

/**
 * Fills an RGBA buffer with the colours of a chunk: the resource if any, else the biome.
 * @param {Uint8ClampedArray} rgba - Length = tiles × 4.
 * @param {{ biome: Uint8Array, resource: Uint8Array }} chunk
 * @param {Palette} palette
 * @returns {void}
 */
export function paintChunk(rgba, chunk, palette) {
  const { biome, resource } = chunk;
  for (let i = 0, o = 0; i < biome.length; i++, o += 4) {
    const r = resource[i];
    const table = r === 0 ? palette.biomes : palette.resources;
    const c = (r === 0 ? biome[i] : r) * 3;
    rgba[o] = table[c];
    rgba[o + 1] = table[c + 1];
    rgba[o + 2] = table[c + 2];
    rgba[o + 3] = 255;
  }
}
