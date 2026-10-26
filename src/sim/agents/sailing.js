import { Expedition } from '../colony/colony-store.js';
import { PACK } from '../world/chunk-store.js';

// On water (docs/design/18-expansion-et-commerce.md): one who carries a boat or a ship goes on
// water, case by case like on land, at its own speed; a travelling expedition whose leader carries
// a ship sails with it, every member aboard.

/**
 * Speed on water for the agent: 0 on foot, the ship's when it carries one or sails with its
 * expedition's ship, the boat's when it carries a boat.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function sailSpeed(state, ctx, id) {
  const a = ctx.agents;
  const cfg = ctx.balance.sailing;
  if (ctx.shipGood > 0) {
    if (a.carried(id, ctx.shipGood) > 0) return cfg.shipSpeed;
    const c = a.colony[id];
    if (c >= 0) {
      const colony = state.colonies[c];
      const leader = colony.expLeader;
      if (
        colony.expState === Expedition.TRAVELLING &&
        leader >= 0 &&
        colony.inExpedition(id) &&
        a.carried(leader, ctx.shipGood) > 0
      ) {
        return cfg.shipSpeed;
      }
    }
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
