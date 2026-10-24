/**
 * One-line description of a tile for the inspection panel.
 * @param {import('../sim/world/chunk-store.js').TileInfo} tile
 * @param {import('../sim/world/world-data.js').WorldTables} tables
 * @returns {string}
 */
export function formatTile(tile, tables) {
  const parts = [`(${tile.x}, ${tile.y})`, tables.biomes[tile.biome].name];
  if (tile.resource !== 0) {
    parts.push(`${tables.resources[tile.resource - 1].name} × ${tile.quantity}`);
  }
  parts.push(`altitude ${Math.round((tile.altitude / 255) * 100)} %`);
  return parts.join(' · ');
}
