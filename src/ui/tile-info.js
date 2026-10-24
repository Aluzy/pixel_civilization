/**
 * One-line description of a tile for the inspection panel.
 * @param {import('../sim/world/chunk-store.js').TileInfo} tile
 * @param {import('../sim/world/world-data.js').WorldTables} tables
 * @param {{ name: string }[]} [structures] - Index = structure code − 1.
 * @returns {string}
 */
export function formatTile(tile, tables, structures = []) {
  const parts = [`(${tile.x}, ${tile.y})`, tables.biomes[tile.biome].name];
  if (tile.structure) parts.push(structures[tile.structure - 1]?.name ?? 'construction');
  if (tile.resource !== 0) {
    parts.push(`${tables.resources[tile.resource - 1].name} × ${tile.quantity}`);
  }
  parts.push(`altitude ${Math.round((tile.altitude / 255) * 100)} %`);
  return parts.join(' · ');
}
