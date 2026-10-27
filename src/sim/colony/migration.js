import { EventType } from '../core/events.js';
import { geneLevel } from '../genome/genome.js';
import { releaseFarm } from '../farming/farm-jobs.js';
import { Colony, Expedition, MAX_COLONIES, MAX_EXPEDITION } from './colony-store.js';
import { releaseTask } from './colony-logic.js';
import { registerHouse } from './house.js';
import { tauOf } from '../agents/beliefs.js';
import { chooseVocation, siteFits } from './vocation.js';

// Migration (docs/design/15-colonies-et-migration.md): in a crowded colony, a member scouts for a
// site far from the camp (water with food near it); found, it posts an expedition on the
// blackboard, members who also feel the crowd join it, take provisions and walk there together,
// and the first shelter built on the site founds a new colony, daughter of the first.

/**
 * How much the agent wants to leave, 0 to 1: the crowd it saw at its camp (members as read on the
 * blackboard), drawn up by curiosity and held back by sociability.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function migrationPressure(ctx, id) {
  const cfg = ctx.balance.migration;
  const crowd = (ctx.agents.crowdSeen[id] - cfg.minMembers) / (cfg.fullMembers - cfg.minMembers);
  if (crowd <= 0) return 0;
  const level = (gene) => {
    const k = ctx.genes.index[gene];
    return k === undefined ? 0.5 : geneLevel(ctx.genes, ctx.agents.genes, id, k);
  };
  const pull = 1 + cfg.genePull * (level('curiosity') - level('sociability'));
  const p = (crowd > 1 ? 1 : crowd) * pull;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * True if one more colony may be founded: fewer living colonies than `maxColonies` (a dead colony
 * frees its place, decision 0029), and room left in the game's table of colonies.
 * @param {import('../simulation.js').SimState} state
 * @param {{ maxColonies: number }} cfg
 * @returns {boolean}
 */
export function roomForColony(state, cfg) {
  if (state.colonies.length >= MAX_COLONIES) return false;
  let living = 0;
  for (const c of state.colonies) if (c.members > 0) living++;
  return living < cfg.maxColonies;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if the agent knows how to raise a shelter.
 */
function buildsShelter(ctx, id) {
  const r = ctx.catalog.recipeForStructure[ctx.shelterCode];
  return r >= 0 && ctx.agents.recipes[id].knows(r);
}

/**
 * Whether (x, y) is far enough from every camp the colony knows of (its own included).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Colony} colony
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function farFromCamps(ctx, colony, x, y) {
  const cfg = ctx.balance.migration;
  // A relay on a road needs less room around it (decision 0029): the roads fill with hamlets.
  const min = onRoad(ctx, x, y) ? cfg.relayDistance : cfg.minDistance;
  const d = Math.max(Math.abs(x - colony.campX), Math.abs(y - colony.campY));
  if (d < min || d > cfg.maxDistance) return false;
  for (let c = 0; c < MAX_COLONIES; c++) {
    if (colony.relKnown[c] !== 1) continue;
    const e = Math.max(Math.abs(colony.relCampX[c] - x), Math.abs(colony.relCampY[c] - y));
    if (e < min) return false;
  }
  return true;
}

/**
 * True if a paved tile lies within `relayRoad` of (x, y), as the scout sees it.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function onRoad(ctx, x, y) {
  const nav = ctx.nav;
  const r = ctx.balance.migration.relayRoad;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const cell = nav.cellAt(x + dx, y + dy);
      if (cell >= 0 && nav.structure[cell] === ctx.pavementCode) return true;
    }
  }
  return false;
}

/**
 * True if the agent sees food, or remembers some within `radius` of (x, y).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @returns {boolean}
 */
function nearFood(ctx, id, x, y, radius) {
  if (ctx.nav.nearestResource(ctx.edible) >= 0) return true;
  const memory = ctx.agents.memory[id];
  for (let i = 0; i < memory.count; i++) {
    const s = memory.subject[i];
    if (s <= 0 || ctx.edible[s] !== 1) continue;
    if (Math.max(Math.abs(memory.x[i] - x), Math.abs(memory.y[i] - y)) <= radius) return true;
  }
  return false;
}

/**
 * The scout looks around for a site for a new colony: far from every known camp, water within
 * `siteView` of it (it surveys the land), food there or remembered within `siteRadius`. The
 * leader brings the materials of a first shelter; the colony will look for more. The site must
 * suit the vocation chosen for the new town (decision 0030), until the scout has spent half its
 * time.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Colony} colony
 * @param {number} id
 * @param {Int32Array} out - Receives x, y (beside the water).
 * @returns {boolean}
 */
export function findSite(state, ctx, colony, id, out) {
  const cfg = ctx.balance.migration;
  const a = ctx.agents;
  const nav = ctx.nav;
  if (!farFromCamps(ctx, colony, a.x[id], a.y[id])) return false;
  // The scout surveys the land around (decision 0030): it looks farther than when it walks.
  nav.prepare(state.world, a.x[id], a.y[id], cfg.siteView);
  const water = nav.nearestWaterSide();
  if (water < 0) return false;
  const x = nav.cellX(water);
  const y = nav.cellY(water);
  if (!nearFood(ctx, id, x, y, cfg.siteRadius)) return false;
  // A site suited to the town's vocation; after half its time, the scout takes any.
  const v = colony.expVocation;
  if (v >= 0 && !siteFits(ctx, ctx.vocations[v])) {
    if (state.tick - colony.scoutTick < cfg.scoutTicks / 2) return false;
    colony.expVocation = -1;
    for (let k = 0; k < ctx.vocations.length; k++) {
      if (siteFits(ctx, ctx.vocations[k])) colony.expVocation = k;
    }
  }
  out[0] = x;
  out[1] = y;
  return true;
}

/**
 * Drops the colony tasks, farm job and kitchen work of a member who leaves.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
function leaveWork(state, ctx, id) {
  const a = ctx.agents;
  releaseTask(state, ctx, id);
  releaseFarm(state, ctx, id);
  a.cookRecipe[id] = -1;
  a.saleGood[id] = 0;
  const colony = state.colonies[a.colony[id]];
  for (let k = 0; k < colony.cooks.length; k++) if (colony.cooks[k] === id) colony.cooks[k] = -1;
  for (let k = 0; k < colony.guards.length; k++) if (colony.guards[k] === id) colony.guards[k] = -1;
  if (colony.inventor === id) colony.inventor = -1;
  if (colony.scribe === id) colony.scribe = -1;
}

/**
 * The scout found a site: it will lead the expedition, posted when it is back at the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Colony} colony
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function openExpedition(state, ctx, colony, id, x, y) {
  colony.clearExpedition();
  colony.expState = Expedition.RECRUITING;
  colony.expLeader = id;
  colony.expX = x;
  colony.expY = y;
  // Recruiting starts when the leader is back at the camp to post it.
  colony.expTick = -1;
  colony.expMembers[0] = id;
  colony.lastExpedition = state.tick;
  colony.scout = -1;
  ctx.agents.provisioned[id] = 0;
  leaveWork(state, ctx, id);
}

/**
 * The leader is back at the camp: the expedition is posted on the blackboard (recruiting).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Colony} colony
 * @param {number} id
 * @returns {void}
 */
export function postExpedition(state, ctx, colony, id) {
  if (colony.expTick >= 0) return;
  colony.expTick = state.tick;
  const a = ctx.agents;
  state.events.push(state.tick, EventType.EXPEDITION, id, a.x[id], a.y[id], colony.id);
}

/**
 * The agent's part in migration, as a utility input: 1 in an expedition (it joins one posted on
 * the blackboard when at the camp and feeling the crowd enough) or for the scout (one member at a
 * time, when the colony may send an expedition), else 0.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Colony | null} home
 * @param {boolean} atHome - At the camp.
 * @returns {number}
 */
export function senseMigration(state, ctx, id, home, atHome) {
  if (home === null) return 0;
  if (home.inExpedition(id)) return 1;
  const cfg = ctx.balance.migration;
  const a = ctx.agents;
  const pressure = migrationPressure(ctx, id);
  if (home.expState === Expedition.RECRUITING) {
    if (
      home.expTick < 0 ||
      !atHome ||
      pressure < cfg.joinPressure ||
      home.expeditionSize() >= cfg.maxSize
    )
      return 0;
    const slot = home.expMembers.indexOf(-1);
    if (slot < 0) return 0;
    home.expMembers[slot] = id;
    a.provisioned[id] = 0;
    leaveWork(state, ctx, id);
    // The site is on the blackboard: where the water is there.
    const m = ctx.balance.memory;
    a.memory[id].remember(0, home.expX, home.expY, 0, state.tick, 1, tauOf(ctx, 0), m.sameRadius);
    return 1;
  }
  if (home.expState !== Expedition.NONE) return 0;
  const day = ctx.balance.time.ticksPerDay;
  const ready =
    roomForColony(state, cfg) && state.tick - home.lastExpedition >= cfg.everyDays * day;
  if (!ready) return 0;
  const current = home.scout >= 0 && a.alive[home.scout] === 1 ? home.scout : -1;
  if (current === id) {
    if (state.tick - home.scoutTick <= cfg.scoutTicks) return 1;
    home.scout = -1;
    return 0;
  }
  if (current >= 0 || !atHome || pressure < cfg.scoutPressure) return 0;
  // The scout leads the expedition: it must know how to raise the first shelter.
  if (!buildsShelter(ctx, id)) return 0;
  home.scout = id;
  home.scoutTick = state.tick;
  // What the new town will live from: what the colony lacks most (decision 0030).
  home.expVocation = chooseVocation(state, ctx, home);
  a.provisioned[id] = 0;
  return 1;
}

/**
 * Every pass of the colony system: the expedition loses its dead (a new leader if needed); it
 * leaves once recruiting time is over with enough members (or is given up); it is given up when
 * the journey lasts too long.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {Colony} colony
 * @returns {void}
 */
export function updateExpedition(state, ctx, colony) {
  if (colony.expState === Expedition.NONE) return;
  const a = ctx.agents;
  const cfg = ctx.balance.migration;
  for (let k = 0; k < MAX_EXPEDITION; k++) {
    const m = colony.expMembers[k];
    if (m >= 0 && (a.alive[m] !== 1 || a.colony[m] !== colony.id)) colony.expMembers[k] = -1;
  }
  if (colony.expLeader < 0 || colony.expMembers.indexOf(colony.expLeader) < 0) {
    // One who knows how to raise the first shelter takes the lead, else anyone.
    colony.expLeader = -1;
    for (let k = 0; k < MAX_EXPEDITION && colony.expLeader < 0; k++) {
      const m = colony.expMembers[k];
      if (m >= 0 && buildsShelter(ctx, m)) colony.expLeader = m;
    }
    for (let k = 0; k < MAX_EXPEDITION && colony.expLeader < 0; k++) {
      if (colony.expMembers[k] >= 0) colony.expLeader = colony.expMembers[k];
    }
  }
  const size = colony.expeditionSize();
  // Not posted yet: the leader is on its way back from the site.
  if (colony.expTick < 0) {
    if (size === 0) colony.clearExpedition();
    return;
  }
  const since = state.tick - colony.expTick;
  if (colony.expState === Expedition.RECRUITING && since >= cfg.recruitTicks) {
    if (size >= cfg.minSize) {
      colony.expState = Expedition.TRAVELLING;
      colony.expTick = state.tick;
      return;
    }
    if (since >= 2 * cfg.recruitTicks) colony.clearExpedition();
    return;
  }
  const late = since > cfg.travelDays * ctx.balance.time.ticksPerDay;
  if (size === 0 || (colony.expState === Expedition.TRAVELLING && late)) colony.clearExpedition();
}

/**
 * A shelter built by a member of a travelling expedition near its site founds a new colony: its
 * members change colony, with the first shelter as camp; both colonies know each other as kin.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id - Builder.
 * @param {number} x
 * @param {number} y
 * @returns {boolean} True if a colony was founded.
 */
export function foundColony(state, ctx, id, x, y) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return false;
  const mother = state.colonies[c];
  if (mother.expState !== Expedition.TRAVELLING || !mother.inExpedition(id)) return false;
  const cfg = ctx.balance.migration;
  const near = Math.max(Math.abs(x - mother.expX), Math.abs(y - mother.expY));
  if (near > cfg.siteRadius || !roomForColony(state, cfg)) return false;
  const d = state.colonies.length;
  const b = ctx.balance;
  const colony = new Colony(d, ctx.catalog.goodCount, b.colony, b.harmony, ctx.jobs.jobs.length);
  colony.price.set(ctx.basePrices);
  colony.parent = c;
  colony.foundedTick = state.tick;
  colony.overseas = mother.expSailed;
  colony.vocation = mother.expVocation;
  state.colonies.push(colony);
  registerHouse(ctx, colony, x, y);
  colony.sheltersBuilt = 1;
  for (let k = 0; k < MAX_EXPEDITION; k++) {
    const m = mother.expMembers[k];
    if (m < 0) continue;
    a.colony[m] = d;
    a.boardTick[m] = -1e9;
    mother.members--;
    colony.members++;
  }
  // Kin: each knows the other's camp.
  mother.relKnown[d] = 1;
  mother.relKin[d] = 1;
  mother.relCampX[d] = colony.campX;
  mother.relCampY[d] = colony.campY;
  colony.relKnown[c] = 1;
  colony.relKin[c] = 1;
  colony.relCampX[c] = mother.campX;
  colony.relCampY[c] = mother.campY;
  // The founders know the mother's prices; the mother knows a new counter opens at base prices.
  const G = ctx.catalog.goodCount;
  colony.relPrice.set(mother.price, c * G);
  colony.relPriceTick[c] = state.tick;
  mother.relPrice.set(ctx.basePrices, d * G);
  mother.relPriceTick[d] = state.tick;
  mother.clearExpedition();
  state.events.push(state.tick, EventType.COLONY_FOUNDED, id, x, y, d, c);
  if (colony.overseas) state.events.push(state.tick, EventType.OVERSEAS, id, x, y, d, c);
  return true;
}
