import { Expedition } from '../colony/colony-store.js';
import { PACK } from '../world/chunk-store.js';

// On water (docs/design/18-expansion-et-commerce.md): one who carries a boat goes on water, case
// by case like on land, at its own speed; a colony whose ship lies at its quay sails its voyages
// (the scout, the expedition, the caravans) with it.

/**
 * Speed on water for the agent: the ship's on a voyage of a colony that has one, the boat's when
 * it carries a boat, a swimmer's when left on water, else 0.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function sailSpeed(state, ctx, id) {
  const a = ctx.agents;
  const cfg = ctx.balance.sailing;
  const c = a.colony[id];
  if (c >= 0) {
    const colony = state.colonies[c];
    // The colony's ship carries its voyages: the scout, the expedition on its way, the caravans.
    const voyage =
      colony.scout === id ||
      (colony.expState === Expedition.TRAVELLING && colony.inExpedition(id)) ||
      a.caravanTo[id] >= 0;
    if (voyage && hasShip(state, ctx, colony)) return cfg.shipSpeed;
  }
  if (ctx.boatGood > 0 && a.carried(id, ctx.boatGood) > 0) return cfg.boatSpeed;
  // Left on water without a boat (it gave it away): it swims back, slowly.
  const p = state.world.packedAt(a.x[id], a.y[id]);
  if ((p & PACK.MASK) === ctx.waterBiome && ctx.deck[p >>> PACK.STRUCTURE_SHIFT] !== 1) {
    return cfg.swimSpeed;
  }
  return 0;
}

/**
 * True if the colony's ship is at its quay (it was built and still stands).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {boolean}
 */
export function hasShip(state, ctx, colony) {
  if (!colony.hasShip) return false;
  const code = state.world.packedAt(colony.shipX, colony.shipY) >>> PACK.STRUCTURE_SHIFT;
  if (code === ctx.shipCode) return true;
  colony.hasShip = false;
  return false;
}

/**
 * Walking (or sailing) speed factor of a tile's ground: a deck (a pier) over water is walked like
 * land; open water takes the agent's speed on water (0: impassable on foot).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} biome
 * @param {number} code - Structure on the tile.
 * @param {number} sail - The agent's speed on water.
 * @returns {number}
 */
export function groundSpeed(ctx, biome, code, sail) {
  if (biome !== ctx.waterBiome) return ctx.biomeSpeed[biome];
  if (ctx.deck[code] === 1) return 1;
  return sail;
}
