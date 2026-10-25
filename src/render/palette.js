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
 * @property {Uint8Array} structures - RGB triplets, indexed by structure code (0 unused).
 * @property {Uint8Array} [cropBeds] - 1 per structure code that shows what grows on it (a plot).
 */

/**
 * Colour lookup tables built from the world data.
 * @param {import('../sim/world/world-data.js').WorldTables} tables
 * @param {{ color: string, kind?: string }[]} [structureDefs] - Structures, index = code − 1.
 * @returns {Palette}
 */
export function buildPalette(tables, structureDefs = []) {
  const biomes = new Uint8Array(tables.biomes.length * 3);
  tables.biomes.forEach((b, i) => biomes.set(hexToRgb(b.color), i * 3));
  const resources = new Uint8Array((tables.resources.length + 1) * 3);
  tables.resources.forEach((r, i) => resources.set(hexToRgb(r.color), (i + 1) * 3));
  const structures = new Uint8Array((structureDefs.length + 1) * 3);
  structureDefs.forEach((s, i) => structures.set(hexToRgb(s.color), (i + 1) * 3));
  const cropBeds = new Uint8Array(structureDefs.length + 1);
  structureDefs.forEach((s, i) => (cropBeds[i + 1] = s.kind === 'plot' ? 1 : 0));
  return { biomes, resources, structures, cropBeds };
}

/**
 * Fills an RGBA buffer with the colours of a chunk: the structure if any (but a ripe crop shows on
 * its plot), else the resource, else the biome.
 * @param {Uint8ClampedArray} rgba - Length = tiles × 4.
 * @param {{ biome: Uint8Array, resource: Uint8Array, structure?: Uint8Array }} chunk
 * @param {Palette} palette
 * @returns {void}
 */
export function paintChunk(rgba, chunk, palette) {
  const { biome, resource, structure } = chunk;
  for (let i = 0, o = 0; i < biome.length; i++, o += 4) {
    const s = structure ? structure[i] : 0;
    const r = resource[i];
    let table = palette.biomes;
    let c = biome[i] * 3;
    if (s !== 0 && !(r !== 0 && palette.cropBeds?.[s] === 1)) {
      table = palette.structures;
      c = s * 3;
    } else if (r !== 0) {
      table = palette.resources;
      c = r * 3;
    }
    rgba[o] = table[c];
    rgba[o + 1] = table[c + 1];
    rgba[o + 2] = table[c + 2];
    rgba[o + 3] = 255;
  }
}
