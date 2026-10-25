import aiGoals from '../../data/ai-goals.json' with { type: 'json' };
import cropData from '../../data/crops.json' with { type: 'json' };
import genomeData from '../../data/genome.json' with { type: 'json' };
import projectData from '../../data/ai-projects.json' with { type: 'json' };
import recipeData from '../../data/recipes.json' with { type: 'json' };
import resourceData from '../../data/resources.json' with { type: 'json' };
import worldData from '../../data/world.json' with { type: 'json' };
import { ACTION_NAMES, Action } from './agents/action-types.js';
import { AgentStore } from './agents/agent-store.js';
import { describeExperience } from './agents/experience.js';
import { attackMultiplier, defenseBonus } from './agents/equipment.js';
import { MAX_RADIUS, Navigator } from './agents/navigation.js';
import { WATER_SUBJECT } from './agents/memory.js';
import { Planner, Step } from './ai/planner.js';
import { buildProjects } from './ai/projects.js';
import { INPUT, buildGoalTable } from './ai/utility.js';
import { describeTick, phaseIndexAt } from './core/clock.js';
import { EventLog, EventType } from './core/events.js';
import { createHasher, hashCoords } from './core/hash.js';
import { createRng, seedToKey } from './core/rng.js';
import { Colony } from './colony/colony-store.js';
import { History } from './colony/history.js';
import { lifespanOf } from './colony/replication.js';
import { buildCatalog } from './crafting/catalog.js';
import { CropStore } from './farming/crop-store.js';
import { buildFood, stockPortions } from './farming/food.js';
import { buildGeneTable } from './genome/genome.js';
import { DocKind, DocumentStore } from './knowledge/document-store.js';
import { KnowledgeLog } from './knowledge/knowledge-log.js';
import { SYSTEMS } from './systems/index.js';
import { ThreatStore } from './threats/threat-store.js';
import { ChunkStore, PACK, findSpawn } from './world/chunk-store.js';
import { WorldGenerator } from './world/generator.js';
import { buildWorldTables } from './world/world-data.js';

/** Indexed world tables built from data/, shared by every simulation (read-only). */
export const WORLD_TABLES = buildWorldTables(worldData, resourceData);

/** Compiled utility goals from data/ai-goals.json (read-only). */
export const GOAL_TABLE = buildGoalTable(aiGoals);
export const GENE_TABLE = buildGeneTable(genomeData, GOAL_TABLE);

/** Goods, structures and recipes from data/recipes.json (read-only). */
export const CATALOG = buildCatalog(recipeData, WORLD_TABLES);

/** Long-term projects from data/ai-projects.json (read-only). */
export const PROJECTS = buildProjects(projectData, GOAL_TABLE);

/** Independent random streams, one per subsystem, so that systems cannot disturb each other. */
export const RNG_STREAMS = Object.freeze([
  'world',
  'threats',
  'ai',
  'social',
  'lifecycle',
  'genome',
]);

/**
 * @typedef {object} Regrowth
 * @property {number} tick - When the resource comes back.
 * @property {number} x
 * @property {number} y
 * @property {number} resource
 * @property {number} quantity
 */

/**
 * Everything that defines a game at a given tick (hashed by {@link Simulation#hash}).
 * @typedef {object} SimState
 * @property {number} seedKey - 32-bit key derived from the seed.
 * @property {number} tick - Number of ticks simulated so far.
 * @property {Record<string, import('./core/rng.js').Rng>} rng - One stream per subsystem.
 * @property {object} balance - Content of data/balance.json.
 * @property {ChunkStore} world - Tiles, generated on demand.
 * @property {{ x: number, y: number }} spawn - Where the first individual appears.
 * @property {AgentStore} agents
 * @property {ThreatStore} threats - Predators.
 * @property {Colony[]} colonies - Index = colony id.
 * @property {DocumentStore} documents - Books and maps.
 * @property {KnowledgeLog} knowledge - Collective knowledge over time (observation only).
 * @property {EventLog} events
 * @property {Regrowth[]} regrowth - Sorted by tick.
 * @property {History} history - Daily record for the dashboard.
 * @property {CropStore} crops - Plots and their plants.
 */

/**
 * Read-only tables, per-tick derived values and scratch buffers shared by the systems.
 * Rebuilt from data and state; never part of the hash.
 * @typedef {object} SimContext
 * @property {object} balance
 * @property {import('./world/world-data.js').WorldTables} tables
 * @property {import('./ai/utility.js').GoalTable} goals
 * @property {string[]} goalKinds - Goal id per goal index.
 * @property {Record<string, number>} goalIndex - Goal index per goal id.
 * @property {import('./genome/genome.js').GeneTable} genes - Decision genome.
 * @property {Float64Array} goalWeights - Scratch: genome multiplier per goal.
 * @property {Float64Array} geneMean - Scratch for the daily gene statistics.
 * @property {Float64Array} geneSpread
 * @property {Int32Array} hullX - Scratch for the compactness of buildings.
 * @property {Int32Array} hullY
 * @property {Int32Array} hullOrder
 * @property {Int32Array} zoneCounts - Scratch for the specialisation of zones.
 * @property {Int32Array} regrowTicks - Per resource id, 0 if not renewable.
 * @property {Uint8Array} plantBiome - 1 per biome where a field can be planted.
 * @property {Uint8Array} denBiomes - 1 per biome where a den can be.
 * @property {number} denCode - Structure code of a den.
 * @property {number} carcass - Resource id of a carcass (0 if none).
 * @property {number} carcassUnits - Units of meat in a carcass.
 * @property {number} hideGood - Good id of a hide (0 if none).
 * @property {AgentStore} agents
 * @property {Navigator} nav
 * @property {Float64Array} biomeSpeed
 * @property {number} waterBiome
 * @property {Uint8Array} edible - 1 per resource id eaten where it grows (foraged).
 * @property {Float64Array} nutrition - Hunger removed per unit, per resource id.
 * @property {Float64Array} harvestTicks - Base ticks to harvest one unit, per resource id.
 * @property {number} harvestForceScale
 * @property {number} ticksPerSecond
 * @property {{ hunger: number, thirst: number, fatigue: number, fatigueRecovery: number,
 *   curiosity: number, curiosityRelief: number, damage: number, regen: number }} rates - Per tick.
 * @property {Float64Array} darknessByPhase
 * @property {number} nightPhase
 * @property {number} darkness - Current light level input, 0 (day) to 1 (night).
 * @property {boolean} dark - True at night (reduced perception).
 * @property {Float64Array} inputs - Scratch utility inputs.
 * @property {Float64Array} scores - Scratch utility scores.
 * @property {import('./agents/movement.js').Plan} plan - Scratch plan.
 * @property {(id: number) => number} capacity - Units an agent can carry.
 * @property {number} placeTau - Initial memory time constant, in ticks.
 * @property {number} maxTau - Longest memory time constant, in ticks.
 * @property {number} staleTicks - Age at which an explored area counts as unknown again.
 * @property {Uint8Array} waterSubjects - Memory subject mask for water.
 * @property {number} firstEdible - A food subject, for "searching for food" events.
 * @property {Int32Array} nearestBySubject - Scratch: nearest window cell per resource, structure.
 * @property {Int32Array} exploreTarget - Scratch: x, y of a chosen exploration target.
 * @property {Int32Array} recallTarget - Scratch: x, y where a memory is believed to be.
 * @property {(state: SimState, x: number, y: number, resource: number) => void} scheduleRegrowth
 * @property {Crop[]} crops - Crops of data/crops.json.
 * @property {Int8Array} cropOfResource - Crop index per resource id, -1 if none.
 * @property {number} plotCode - Structure code of a plot (0 if none).
 * @property {number} plotRecipe - Recipe making a plot (sowing), -1 if none.
 * @property {import('./farming/food.js').FoodTables} foodTables
 * @property {Int16Array} cookRecipes - Kitchen recipes: dishes and their prepared ingredients.
 * @property {Uint8Array} produce - 1 per good the farm and the kitchen put in the stock.
 * @property {Int16Array} sourceOf - Per good: resource that yields it as a by-product, 0 if none.
 */

/**
 * @typedef {object} Crop
 * @property {string} id
 * @property {number} resource - Resource id it yields.
 * @property {number} seed - Good id of its seed.
 * @property {number} stages - Watered days to ripen.
 * @property {number} yield - Units of the resource when ripe.
 * @property {number} seedChance - Chance of a seed with each unit harvested.
 * @property {number} hintChance - Chance, with a seed from wild grain, of guessing it can be sown.
 */

/**
 * @param {import('./crafting/catalog.js').Catalog} catalog
 * @param {import('./world/world-data.js').WorldTables} tables
 * @returns {Crop[]}
 */
function buildCrops(catalog, tables) {
  return cropData.crops.map((c) => {
    const resource = tables.resources.findIndex((r) => r.id === c.resource) + 1;
    const seed = catalog.items.find((i) => i.id === c.seed)?.good ?? 0;
    if (resource === 0 || seed === 0) throw new Error(`Crop ${c.id}: unknown resource or seed`);
    return {
      id: c.id,
      resource,
      seed,
      stages: c.stages,
      yield: c.yield,
      seedChance: c.seedChance,
      hintChance: c.hintChance ?? 0,
    };
  });
}

/**
 * @param {number} slots - Number of memory subjects.
 * @param {number[]} subjects
 * @returns {Uint8Array} Subject mask selecting the given subjects.
 */
function subjectMask(slots, subjects) {
  const mask = new Uint8Array(slots);
  for (const s of subjects) mask[s] = 1;
  return mask;
}

/**
 * Planning targets of the crafting goals: a goal is satisfied by any of these goods or
 * structures (data/ai-goals.json ids → catalogue kinds).
 * @param {import('./crafting/catalog.js').Catalog} catalog
 * @param {string[]} goalKinds
 * @returns {(import('./ai/planner.js').PlanTarget | null)[]}
 */
function buildTargets(catalog, goalKinds) {
  const itemKind = { equip: 'weapon', tool: 'tool' };
  return goalKinds.map((kind, id) => {
    const goods = new Uint8Array(catalog.goodCount);
    const structures = new Uint8Array(catalog.structures.length + 1);
    if (kind === 'shelter') {
      for (const s of catalog.structures) if (s.kind === 'shelter') structures[s.code] = 1;
    } else if (itemKind[kind]) {
      for (const item of catalog.items) if (item.kind === itemKind[kind]) goods[item.good] = 1;
    } else {
      return null;
    }
    return { id, goods, structures };
  });
}

/**
 * Goods vector (index = good id) from a `{ resourceId: count }` object of data.
 * @param {import('./crafting/catalog.js').Catalog} catalog
 * @param {import('./world/world-data.js').WorldTables} tables
 * @param {Record<string, number>} counts
 * @returns {Int32Array}
 */
function goodVector(catalog, tables, counts) {
  const v = new Int32Array(catalog.goodCount);
  for (const [id, n] of Object.entries(counts)) {
    const r = tables.resources.findIndex((res) => res.id === id);
    if (r < 0) throw new Error(`Unknown resource: ${id}`);
    v[r + 1] = n;
  }
  return v;
}

/**
 * @param {import('./crafting/catalog.js').Catalog} catalog
 * @returns {Int32Array} Good id per {@link DocKind}.
 */
function docGoods(catalog) {
  const out = new Int32Array(3);
  out[DocKind.BOOK] = catalog.items.find((i) => i.kind === 'book')?.good ?? 0;
  out[DocKind.MAP] = catalog.items.find((i) => i.kind === 'map')?.good ?? 0;
  return out;
}

/**
 * Planning target "have an item of this kind".
 * @param {import('./crafting/catalog.js').Catalog} catalog
 * @param {string} kind
 * @param {number} id
 * @returns {import('./ai/planner.js').PlanTarget}
 */
function itemTarget(catalog, kind, id) {
  const goods = new Uint8Array(catalog.goodCount);
  for (const item of catalog.items) if (item.kind === kind) goods[item.good] = 1;
  return { id, goods, structures: new Uint8Array(catalog.structures.length + 1) };
}

/**
 * One planning target per structure code (index 0 unused), to build a given station.
 * @param {import('./crafting/catalog.js').Catalog} catalog
 * @returns {(import('./ai/planner.js').PlanTarget | null)[]}
 */
function buildStructureTargets(catalog) {
  return [null].concat(
    catalog.structures.map((st) => {
      const structures = new Uint8Array(catalog.structures.length + 1);
      structures[st.code] = 1;
      return { id: 64 + st.code, goods: new Uint8Array(catalog.goodCount), structures };
    }),
  );
}

/**
 * Builds the shared context for a simulation.
 * @param {object} balance
 * @param {import('./world/world-data.js').WorldTables} tables
 * @param {AgentStore} agents
 * @param {number} seedKey
 * @returns {SimContext}
 */
function buildContext(balance, tables, agents, seedKey) {
  const time = balance.time;
  const perTick = (perDay) => perDay / time.ticksPerDay;
  const n = balance.needs;
  const resourceSlots = tables.resources.length + 1;
  const edible = new Uint8Array(resourceSlots);
  const nutrition = new Float64Array(resourceSlots);
  const harvestTicks = new Float64Array(resourceSlots);
  const regrowTicks = new Int32Array(resourceSlots);
  const zoneSide = Math.ceil((2 * balance.harmony.territoryRadius + 1) / balance.harmony.zoneCell);
  tables.resources.forEach((r, i) => {
    const id = i + 1;
    // Edible where it grows (foraged, gathered for the pantry), unless it is only eaten once
    // brought home (grain): its food worth is in the food tables either way.
    if (r.nutrition > 0 && r.forage !== false) {
      edible[id] = 1;
      nutrition[id] = r.nutrition;
    }
    harvestTicks[id] = r.harvestTicks ?? 1;
    regrowTicks[id] = r.renewable ? (r.regrowTicks ?? 0) : 0;
  });
  const biomeSpeed = Float64Array.from(tables.biomes.map((b) => b.speed ?? 1));
  const waterBiome = tables.biomes.findIndex((b) => b.id === 'water');
  const goalKinds = GOAL_TABLE.goals.map((g) => g.id);
  const goalIndex = Object.fromEntries(goalKinds.map((id, i) => [id, i]));
  if (goalIndex.sleep === undefined) throw new Error('data/ai-goals.json needs a "sleep" goal');
  const phases = time.phases.map((p) => p.name);
  const catalog = CATALOG;
  const subjects = catalog.subjectCount;
  const R = catalog.resourceCount;
  const shelterCodes = new Uint8Array(catalog.structures.length + 1);
  for (const st of catalog.structures) if (st.kind === 'shelter') shelterCodes[st.code] = 1;
  const predator = worldData.threats.predator;
  const den = worldData.threats.den;
  const days = (d) => d * time.ticksPerDay;
  const crops = buildCrops(catalog, tables);
  const cropOfResource = new Int8Array(resourceSlots).fill(-1);
  crops.forEach((c, i) => (cropOfResource[c.resource] = i));
  const cropResource = Uint8Array.from(cropOfResource, (c) => (c >= 0 ? 1 : 0));
  const plotCode = catalog.structures.find((st) => st.kind === 'plot')?.code ?? 0;
  // Kitchen recipes: dishes, and what prepares their ingredients (flour).
  const isFood = (g) => g > R && catalog.items[g - R - 1].kind === 'food';
  const dishes = catalog.recipes.filter((r) => r.outputKind === 'item' && isFood(r.output));
  const prepared = new Set(dishes.flatMap((r) => r.inputs.map((i) => i.good)));
  const cookRecipes = catalog.recipes
    .filter((r) => r.outputKind === 'item' && (isFood(r.output) || prepared.has(r.output)))
    .map((r) => r.index);
  // By-products found while gathering a resource: seeds in grain, a hide in a carcass.
  const sourceOf = new Int16Array(catalog.goodCount);
  for (const c of crops) sourceOf[c.seed] = c.resource;
  const hide = catalog.items.find((i) => i.id === 'hide');
  const carcassId = tables.resources.findIndex((r) => r.id === 'carcass') + 1;
  if (hide && carcassId > 0) sourceOf[hide.good] = carcassId;
  const produce = new Uint8Array(catalog.goodCount);
  for (const c of crops) produce[c.resource] = produce[c.seed] = 1;
  for (const r of cookRecipes) produce[catalog.recipes[r].output] = 1;
  const darknessByPhase = Float64Array.from(phases.map((p) => worldData.darkness[p] ?? 0));
  const phase0 = phaseIndexAt(0, time);
  /** @type {SimContext} */
  const ctx = {
    balance,
    tables,
    goals: GOAL_TABLE,
    genes: GENE_TABLE,
    goalWeights: new Float64Array(GOAL_TABLE.goals.length),
    geneMean: new Float64Array(GENE_TABLE.genes.length),
    geneSpread: new Float64Array(GENE_TABLE.genes.length),
    hullX: new Int32Array(1024),
    hullY: new Int32Array(1024),
    hullOrder: new Int32Array(3 * 1024),
    zoneCounts: new Int32Array(zoneSide * zoneSide * 4),
    regrowTicks,
    plantBiome: Uint8Array.from(tables.biomes, (b) =>
      balance.harmony.fieldBiomes.includes(b.id) ? 1 : 0,
    ),
    goalKinds,
    goalIndex,
    agents,
    nav: new Navigator({ biomeSpeed, waterBiome }),
    biomeSpeed,
    waterBiome,
    edible,
    nutrition,
    harvestTicks,
    harvestForceScale: balance.actions.harvestForceScale,
    ticksPerSecond: time.ticksPerSecond,
    rates: {
      hunger: perTick(n.hungerPerDay),
      thirst: perTick(n.thirstPerDay),
      fatigue: perTick(n.fatiguePerDayAwake),
      fatigueRecovery: perTick(n.fatigueRecoveryPerDayAsleep),
      curiosity: perTick(n.curiosityPerDay),
      curiosityRelief: perTick(n.curiosityReliefPerDayExploring),
      damage: perTick(n.damagePerDayPerCriticalNeed),
      regen: perTick(n.regenPerDay),
    },
    darknessByPhase,
    nightPhase: phases.indexOf('night'),
    darkness: darknessByPhase[phase0],
    dark: phases.indexOf('night') === phase0,
    inputs: new Float64Array(Object.keys(INPUT).length),
    scores: new Float64Array(GOAL_TABLE.goals.length),
    plan: { action: 0, x: 0, y: 0, note: 0 },
    capacity: (id) => agents.force[id] * balance.agent.carryPerForce,
    placeTau: balance.memory.placeTauDays * time.ticksPerDay,
    maxTau: balance.memory.maxTauDays * time.ticksPerDay,
    staleTicks: balance.exploration.staleDays * time.ticksPerDay,
    waterSubjects: subjectMask(subjects, [WATER_SUBJECT]),
    subjectCount: subjects,
    /** One mask per memory subject, selecting it alone. */
    subjectMasks: Array.from({ length: subjects }, (_, i) => subjectMask(subjects, [i])),
    shelterSubjects: subjectMask(
      subjects,
      catalog.structures.filter((st) => st.kind === 'shelter').map((st) => R + st.code),
    ),
    materialSubjects: subjectMask(
      subjects,
      [...catalog.material].flatMap((m, g) => (m === 1 ? [g] : [])),
    ),
    catalog,
    projects: PROJECTS,
    targets: buildTargets(catalog, goalKinds),
    planner: new Planner(catalog, {
      nodeBudget: balance.ai.planNodeBudget,
      maxSteps: balance.ai.planMaxSteps,
      travelCost: balance.ai.planTravelCost,
      exploreCost: balance.ai.planExploreCost,
      harvestTicks,
    }),
    shelterCodes,
    predatorBiomes: Uint8Array.from(tables.biomes, (b) => (predator.biomes.includes(b.id) ? 1 : 0)),
    predatorPhases: Uint8Array.from(phases, (p) => (predator.phases.includes(p) ? 1 : 0)),
    denBiomes: Uint8Array.from(tables.biomes, (b) => (den.biomes.includes(b.id) ? 1 : 0)),
    denCode: catalog.structures.find((st) => st.kind === 'den')?.code ?? 0,
    carcass: tables.resources.findIndex((r) => r.id === 'carcass') + 1,
    carcassUnits: tables.resources.find((r) => r.id === 'carcass')?.quantity[0] ?? 0,
    hideGood: catalog.items.find((i) => i.id === 'hide')?.good ?? 0,
    phase: phase0,
    structureTau: days(balance.memory.structureTauDays),
    dangerTau: days(balance.memory.dangerTauDays),
    recipeTau: days(balance.crafting.recipeTauDays),
    failureTau: days(balance.crafting.failureTauDays),
    trialOut: new Int32Array(3),
    trialTypes: new Int32Array(catalog.goodCount),
    trialStations: new Uint8Array(catalog.structures.length + 1),
    stationCost: new Float64Array(catalog.structures.length + 1),
    fetchCost: new Float64Array(catalog.goodCount),
    replicationCost: goodVector(catalog, tables, balance.replication.cost),
    costOut: new Int32Array(2),
    imagined: { hp: 0, maxHp: 0, attack: 0, defense: 0 },
    contentOut: new Int32Array(3),
    /** Good id of each document kind. */
    docGood: docGoods(catalog),
    bookTarget: itemTarget(catalog, 'book', 70),
    mapTarget: itemTarget(catalog, 'map', 71),
    weaponTarget: itemTarget(catalog, 'weapon', 72),
    armorTarget: itemTarget(catalog, 'armor', 73),
    /** One planning target per good ("have one"), for crafted trial ingredients. */
    goodTargets: Array.from({ length: catalog.goodCount }, (_, g) => {
      const goods = new Uint8Array(catalog.goodCount);
      goods[g] = 1;
      return { id: 96 + g, goods, structures: new Uint8Array(catalog.structures.length + 1) };
    }),
    trialAgent: 0,
    acquired: null,
    structureTargets: buildStructureTargets(catalog),
    firstEdible: Math.max(0, edible.indexOf(1)),
    nearestBySubject: new Int32Array(CATALOG.dangerSubject),
    exploreTarget: new Int32Array(2),
    recallTarget: new Int32Array(2),
    crops,
    cropOfResource,
    plotCode,
    cookRecipes: Int16Array.from(cookRecipes),
    produce,
    sourceOf,
    plotRecipe: plotCode > 0 ? catalog.recipeForStructure[plotCode] : -1,
    foodTables: buildFood(catalog, tables, cropResource, balance.cooking.dishFactor),
    scheduleRegrowth(state, x, y, resource) {
      const delay = regrowTicks[resource];
      // A crop does not grow back by itself on its plot: it is sown again.
      if (delay <= 0 || state.crops.at(x, y) >= 0) return;
      const [qMin, qMax] = tables.resources[resource - 1].quantity;
      const q = qMin + (hashCoords(seedKey, x, y, state.tick) % (qMax - qMin + 1));
      const entry = { tick: state.tick + delay, x, y, resource, quantity: q };
      const queue = state.regrowth;
      let i = queue.length;
      while (i > 0 && queue[i - 1].tick > entry.tick) i--;
      queue.splice(i, 0, entry);
    },
  };
  // Reader for the trial heuristic, bound to the agent being served (no closure per call).
  ctx.acquired = (g) => agents.acquiredTick[ctx.trialAgent * agents.goodSlots + g];
  return ctx;
}

/**
 * Readable plan for the inspector.
 * @param {SimContext} ctx
 * @param {import('./ai/planner.js').PlanResult | null} plan
 * @returns {{ status: number, cost: number, nodes: number, steps: string[] } | null}
 */
function describePlan(ctx, plan) {
  if (!plan) return null;
  const steps = plan.steps.map((st) => {
    const recipe = ctx.catalog.recipes[st.arg];
    switch (st.kind) {
      case Step.EXPLORE:
        return `chercher ${ctx.catalog.goodName(st.arg)}`;
      case Step.GATHER:
        return `réunir ${st.count} ${ctx.catalog.goodName(st.arg)}`;
      case Step.CRAFT:
        return `fabriquer ${recipe.name}${st.count > 1 ? ` × ${st.count}` : ''}`;
      default:
        return `bâtir ${recipe.name}`;
    }
  });
  return { status: plan.status, cost: Math.round(plan.cost), nodes: plan.nodes, steps };
}

/** Project kinds and names for the inspector, indexed by ProjectKind. */
const PROJECT_KINDS = ['none', 'shelter', 'pantry', 'library', 'field'];
const PROJECT_NAMES = ['', 'Abri', 'Réserve', 'Bibliothèque', 'Champ'];

/**
 * Readable colony project: what it still needs and who contributed.
 * @param {SimContext} ctx
 * @param {import('./colony/colony-store.js').Colony} colony
 * @param {import('./colony/colony-store.js').Project} p
 * @param {object} cfg - balance.colony.
 * @returns {object}
 */
function describeProject(ctx, colony, p, cfg) {
  const pantry = p.kind === 2;
  const goods = [];
  if (pantry) {
    // One line in portions of any food.
    const need = Math.round((colony.members + 1) * cfg.foodPerMember * colony.pantryBoost);
    const have = stockPortions(ctx.foodTables, colony.stock, ctx.balance.cooking.portion);
    let reserved = 0;
    for (let g = 1; g < p.needs.length; g++) reserved += p.reserved[g];
    goods.push({ name: 'Portions', have: Math.min(need, have), need, reserved });
  }
  for (let g = 1; g < p.needs.length && !pantry; g++) {
    if (p.needs[g] === 0) continue;
    const need = p.needs[g];
    goods.push({
      name: ctx.catalog.goodName(g),
      have: Math.min(need, Math.min(p.delivered[g], colony.stock[g])),
      need,
      reserved: p.reserved[g],
    });
  }
  return {
    kind: PROJECT_KINDS[p.kind],
    name: pantry ? 'Réserve de nourriture' : `${PROJECT_NAMES[p.kind]} n°${p.number}`,
    goods,
    contributors: [...p.contributors].filter((id) => id >= 0),
    builder: p.builder,
  };
}

/**
 * The agent's colony task, in words, or null.
 * @param {SimContext} ctx
 * @param {SimState} state
 * @param {AgentStore} a
 * @param {number} id
 * @returns {string | null}
 */
function describeTask(ctx, state, a, id) {
  const slot = a.taskProject[id];
  if (slot < 0 || a.colony[id] < 0) return null;
  const colony = state.colonies[a.colony[id]];
  const p = colony.projects[slot];
  const label = p.kind === 3 ? 'Bibliothèque' : 'Abri';
  const name = p.kind === 2 ? 'la réserve de nourriture' : `« ${label} n°${p.number} »`;
  if (a.taskBuild[id] === 1) return `bâtir ${name}`;
  return `apporter ${a.taskAmount[id]} ${ctx.catalog.goodName(a.taskGood[id])} pour ${name}`;
}

/**
 * The others it knows best (affinity first), for the inspector.
 * @param {AgentStore} a
 * @param {number} id
 * @returns {{ id: number, affinity: number, talks: number, shared: number, skills: number }[]}
 */
function describeSocial(a, id) {
  const m = a.social[id];
  const out = [];
  for (let i = 0; i < m.count; i++) {
    out.push({
      id: m.other[i],
      affinity: m.affinity[i],
      talks: m.talks[i],
      shared: m.shared[i],
      skills: m.skills[i],
    });
  }
  return out.sort((p, q) => q.affinity - p.affinity || p.id - q.id);
}

/**
 * Role an agent has taken, from its habits (displayed only, never assigned).
 * @param {SimContext} ctx
 * @param {AgentStore} a
 * @param {number} id
 * @returns {string}
 */
function roleOf(ctx, a, id) {
  if (a.builds[id] >= 2) return 'bâtisseur';
  let best = 0;
  let bestGood = 0;
  for (let g = 1; g < a.goodSlots; g++) {
    const n = a.gathered[id * a.goodSlots + g];
    if (n > best) {
      best = n;
      bestGood = g;
    }
  }
  if (best >= 10) {
    const name = ctx.catalog.goodName(bestGood).toLowerCase();
    return ctx.edible[bestGood] === 1 ? 'cueilleur' : `récolteur (${name})`;
  }
  return a.delivers[id] > 0 ? 'porteur' : '—';
}

/**
 * Deterministic simulation: same seed and same number of ticks give the same state.
 * Contains no real-time logic; pacing is done by the host (src/worker).
 */
export class Simulation {
  /**
   * @param {object} options
   * @param {number | string} options.seed
   * @param {object} options.balance - Content of data/balance.json.
   * @param {import('./world/world-data.js').WorldTables} [options.tables]
   * @param {number} [options.founders=1] - Individuals at the start (more only for benchmarks).
   */
  constructor({ seed, balance, tables = WORLD_TABLES, founders = 1 }) {
    const root = createRng(seed);
    /** @type {Record<string, import('./core/rng.js').Rng>} */
    const rng = {};
    for (const name of RNG_STREAMS) rng[name] = root.fork(name);
    const world = new ChunkStore(new WorldGenerator(rng.world.fork('generator'), tables));
    const spawn = findSpawn(world, tables);
    if (balance.agent.start.perception > MAX_RADIUS) throw new Error('Perception above maximum');
    const agents = new AgentStore({
      max: balance.agent.maxEntities,
      goodCount: CATALOG.goodCount,
      recipeCount: CATALOG.recipes.length,
      failureSlots: balance.crafting.failureSlots,
      sheets: balance.social.sheets,
      journalSize: balance.ai.journalSize,
      exploration: balance.exploration,
      geneStart: Float64Array.from(GENE_TABLE.genes, (g) => g.start),
      dangerSlots: balance.learning.dangerSlots,
    });
    const seedKey = seedToKey(seed);
    /** @type {SimState} */
    this.state = {
      seedKey,
      tick: 0,
      rng,
      balance,
      world,
      spawn,
      agents,
      threats: new ThreatStore(balance.threats.maxPredators),
      colonies: [new Colony(0, CATALOG.goodCount, balance.colony, balance.harmony)],
      history: new History(balance.harmony.historyDays, GENE_TABLE.genes.length),
      documents: new DocumentStore(balance.writing.maxDocuments, balance.writing.mapEntries),
      knowledge: new KnowledgeLog(CATALOG.recipes.length),
      events: new EventLog(),
      regrowth: [],
      crops: new CropStore(),
    };
    /** @type {SimContext} */
    this.ctx = buildContext(balance, tables, agents, seedKey);
    this.tables = tables;

    const first = agents.create({
      x: spawn.x,
      y: spawn.y,
      tick: 0,
      attributes: balance.agent.start,
      needs: balance.agent.startNeeds,
      rng: rng.ai.fork('agent-0-0'),
      colony: 0,
      lifespan: lifespanOf(balance, rng.lifecycle),
    });
    this.state.colonies[0].members = 1;
    this.state.events.push(0, EventType.BIRTH, first, spawn.x, spawn.y);
    // Extra founders (benchmarks only, tools/bench.js): around the spawn, on passable tiles.
    const spread = balance.agent.founderSpread;
    for (let i = 1; i < founders; i++) {
      let x = spawn.x;
      let y = spawn.y;
      for (let tries = 0; tries < 20; tries++) {
        const tx = spawn.x + rng.lifecycle.int(-spread, spread);
        const ty = spawn.y + rng.lifecycle.int(-spread, spread);
        if (this.ctx.biomeSpeed[world.packedAt(tx, ty) & PACK.MASK] > 0) {
          x = tx;
          y = ty;
          break;
        }
      }
      const id = agents.create({
        x,
        y,
        tick: 0,
        attributes: balance.agent.start,
        needs: balance.agent.startNeeds,
        rng: rng.ai.fork(`agent-0-${i}`),
        colony: 0,
        lifespan: lifespanOf(balance, rng.lifecycle),
      });
      this.state.colonies[0].members++;
      this.state.events.push(0, EventType.BIRTH, id, x, y);
    }
  }

  /** @returns {ChunkStore} */
  get world() {
    return this.state.world;
  }

  /** @returns {{ x: number, y: number }} */
  get spawn() {
    return this.state.spawn;
  }

  /** @returns {number} */
  get tick() {
    return this.state.tick;
  }

  /** @returns {AgentStore} */
  get agents() {
    return this.state.agents;
  }

  /** @returns {EventLog} */
  get events() {
    return this.state.events;
  }

  /**
   * Runs `count` ticks. Batching never changes the result.
   * @param {number} [count=1]
   * @returns {void}
   */
  step(count = 1) {
    const state = this.state;
    const ctx = this.ctx;
    for (let i = 0; i < count; i++) {
      for (let s = 0; s < SYSTEMS.length; s++) SYSTEMS[s](state, ctx);
    }
  }

  /** @returns {import('./core/clock.js').TickInfo} */
  time() {
    return describeTick(this.state.tick, this.state.balance.time);
  }

  /**
   * Positions of alive agents, interpolated along their path, for the renderer.
   * @returns {{ id: number, x: number, y: number, asleep: boolean }[]}
   */
  agentPositions() {
    const a = this.state.agents;
    const out = [];
    for (let id = 0; id < a.highWater; id++) {
      if (a.alive[id] !== 1) continue;
      let x = a.x[id];
      let y = a.y[id];
      const i = a.pathIndex[id];
      if (a.action[id] === Action.MOVE && i < a.pathLength[id]) {
        const t = Math.min(1, a.moveProgress[id]);
        x += (a.path[id][i * 2] - x) * t;
        y += (a.path[id][i * 2 + 1] - y) * t;
      }
      out.push({ id, x, y, asleep: a.asleep[id] === 1 });
    }
    return out;
  }

  /**
   * Summary of a colony for the observer: population, beds, stock, projects and who worked on
   * them. Null if it does not exist.
   * @param {number} c
   * @returns {object | null}
   */
  describeColony(c) {
    const colony = this.state.colonies[c];
    if (!colony) return null;
    const catalog = this.ctx.catalog;
    const cfg = this.state.balance.colony;
    const stock = [];
    for (let g = 1; g < colony.stock.length; g++) {
      if (colony.stock[g] > 0) stock.push({ name: catalog.goodName(g), count: colony.stock[g] });
    }
    const projects = colony.projects
      .filter((p) => p.kind !== 0)
      .map((p) => describeProject(this.ctx, colony, p, cfg));
    return {
      id: c,
      members: colony.members,
      births: colony.births,
      deaths: colony.deaths,
      shelters: colony.shelterCount,
      beds: colony.beds(cfg.bedsPerShelter),
      camp: colony.hasCamp ? { x: colony.campX, y: colony.campY } : null,
      stock,
      projects,
      lastProject: [...colony.lastProject].filter((id) => id >= 0),
      libraries: this.describeLibraries(c),
      harmony: {
        score: colony.harmony[0],
        components: Array.from(colony.harmony.subarray(1)),
        focus: colony.focus,
      },
      planted: colony.planted,
      guards: [...colony.guards].filter((g) => g >= 0 && this.state.agents.alive[g] === 1),
      lastThreat: colony.lastThreat,
      fields: colony.fields,
      farm: {
        plots: colony.plots,
        harvests: colony.cropHarvests,
        withered: colony.withered,
        cropShare: colony.eatenYesterday > 0 ? colony.cropYesterday / colony.eatenYesterday : 0,
        dishes: colony.dishes,
        dishesYesterday: colony.dishesYesterday,
        cooks: [...colony.cooks].filter((k) => k >= 0 && this.state.agents.alive[k] === 1),
      },
      inventor: colony.inventor,
      scribe: colony.scribe,
      knowledge: this.describeKnowledge(),
    };
  }

  /**
   * Books and maps an agent carries, with what is written in them.
   * @param {number} id
   * @returns {{ kind: 'book' | 'map', recipes: string[], places: number }[]}
   */
  describeDocuments(id) {
    const docs = this.state.documents;
    const out = [];
    for (let d = 0; d < docs.max; d++) {
      if (docs.kind[d] === DocKind.NONE || docs.holder[d] !== id) continue;
      out.push({
        kind: docs.kind[d] === DocKind.BOOK ? 'book' : 'map',
        recipes: this.recipeNames(docs.recipes[d]),
        places: docs.entryCount[d],
      });
    }
    return /** @type {{ kind: 'book' | 'map', recipes: string[], places: number }[]} */ (out);
  }

  /**
   * Libraries of a colony, with what is written there.
   * @param {number} c
   * @returns {{ x: number, y: number, abandoned: boolean, documents: number, recipes: string[] }[]}
   */
  describeLibraries(c) {
    const colony = this.state.colonies[c];
    const out = [];
    const content = new Int32Array(3);
    for (let li = 0; li < colony.libraryCount; li++) {
      if (colony.libraryStanding[li] !== 1) continue;
      const documents = this.state.documents.libraryContent(c, li, content);
      out.push({
        x: colony.libraryX[li],
        y: colony.libraryY[li],
        abandoned: colony.libraryAbandoned[li] === 1,
        documents,
        recipes: this.recipeNames(content[0]),
      });
    }
    return out;
  }

  /**
   * Collective knowledge (docs/design/05-savoir.md): recipes known by the living, written within
   * reach, lost, saved by a book, found again.
   * @returns {{ known: string[], written: string[], lost: string[], saved: string[],
   *   recovered: string[] }}
   */
  describeKnowledge() {
    const k = this.state.knowledge;
    const pick = (/** @type {Int32Array} */ ticks) => {
      let m = 0;
      for (let r = 0; r < ticks.length; r++) if (ticks[r] >= 0) m |= 1 << r;
      return this.recipeNames(m);
    };
    return {
      known: this.recipeNames(k.known),
      written: this.recipeNames(k.written),
      lost: this.recipeNames(k.lostMask),
      saved: pick(k.savedByBook),
      recovered: pick(k.recovered),
    };
  }

  /**
   * @param {number} mask - Bit set of recipes.
   * @returns {string[]} Names of what they make.
   */
  recipeNames(mask) {
    const catalog = this.ctx.catalog;
    const out = [];
    for (let r = 0; r < catalog.recipes.length; r++) {
      if ((mask & (1 << r)) !== 0) out.push(catalog.recipes[r].name);
    }
    return out;
  }

  /**
   * Positions of predators, for the renderer.
   * @returns {{ id: number, x: number, y: number, fleeing: boolean }[]}
   */
  threatPositions() {
    const t = this.state.threats;
    const out = [];
    for (let i = 0; i < t.highWater; i++) {
      if (t.alive[i] === 1) out.push({ id: i, x: t.x[i], y: t.y[i], fleeing: t.mood[i] === 2 });
    }
    return out;
  }

  /**
   * Full description of one agent for the inspector, or null if it does not exist.
   * @param {number} id
   * @param {boolean} [withMap=false] - Include the explored cells (for the memory layer).
   * @returns {object | null}
   */
  describeAgent(id, withMap = false) {
    const a = this.state.agents;
    if (id < 0 || id >= a.highWater || a.alive[id] !== 1) return null;
    const goals = this.ctx.goals.goals;
    const catalog = this.ctx.catalog;
    const inventory = [];
    for (let g = 1; g < a.goodSlots; g++) {
      const n = a.carried(id, g);
      if (n > 0) inventory.push({ good: g, name: catalog.goodName(g), count: n });
    }
    const memory = a.memory[id];
    const tick = this.state.tick;
    const remembered = [];
    for (let i = 0; i < memory.count; i++) {
      remembered.push({
        subject: memory.subject[i],
        x: memory.x[i],
        y: memory.y[i],
        quantity: memory.quantity[i],
        seen: memory.seen[i],
        strength: memory.strength(i, tick),
      });
    }
    remembered.sort((p, q) => q.strength - p.strength);
    const book = a.recipes[id];
    const recipes = catalog.recipes
      .filter((r) => book.knows(r.index))
      .map((r) => ({ id: r.id, name: r.name, strength: book.strength(r.index, tick) }));
    const made = catalog.recipes
      .filter((r) => a.madeAt(id, r.index) >= 0)
      .map((r) => ({ name: r.name, tick: a.madeAt(id, r.index) }));
    const project = a.project[id] >= 0 ? this.ctx.projects.projects[a.project[id]] : null;
    return {
      id,
      x: a.x[id],
      y: a.y[id],
      age: this.state.tick - a.bornTick[id],
      hp: a.hp[id],
      maxHp: a.maxHp[id],
      needs: {
        hunger: a.hunger[id],
        thirst: a.thirst[id],
        fatigue: a.fatigue[id],
        curiosity: a.curiosity[id],
      },
      attributes: {
        force: a.force[id],
        speed: a.speed[id],
        attack: a.attack[id],
        defense: a.defense[id],
        perception: a.perception[id],
        memory: a.memorySize[id],
      },
      inventory,
      recipes,
      failures: book.failureCount(),
      made,
      kills: a.kills[id],
      fightRisk: a.fightRisk[id],
      generation: a.generation[id],
      lifespan: a.lifespan[id],
      fear: a.fear[id],
      combatSkill: a.combatSkill[id],
      armor: defenseBonus(this.ctx, id),
      guard: a.colony[id] >= 0 && this.state.colonies[a.colony[id]].guards.includes(id),
      genes: GENE_TABLE.genes.map((g, k) => ({
        id: g.id,
        name: g.name,
        value: a.genes[id * a.geneCount + k],
        start: g.start,
        min: g.min,
        max: g.max,
      })),
      experience: (() => {
        const e = describeExperience(this.ctx, id);
        return {
          costs: e.costs.map((c) => ({ name: catalog.goodName(c.good), ticks: c.ticks })),
          zones: e.zones,
        };
      })(),
      documents: this.describeDocuments(id),
      scribe: a.colony[id] >= 0 && this.state.colonies[a.colony[id]].scribe === id,
      parent: a.parent[id],
      children: a.children[id],
      role: roleOf(this.ctx, a, id),
      task: describeTask(this.ctx, this.state, a, id),
      social: describeSocial(a, id),
      weapon: attackMultiplier(this.ctx, id),
      plan: describePlan(this.ctx, a.lastPlan[id]),
      project: project && {
        name: project.name,
        step: a.projectStep[id],
        steps: project.steps.map((st) => st.name),
      },
      goal: a.goal[id] >= 0 ? goals[a.goal[id]].name : '—',
      action: ACTION_NAMES[a.action[id]],
      asleep: a.asleep[id] === 1,
      exploration: withMap
        ? { cellSize: a.explored[id].cellSize, cells: a.explored[id].entries() }
        : null,
      memory: remembered,
      memoryCapacity: memory.capacity,
      knownWater: remembered.filter((p) => p.subject === WATER_SUBJECT),
      knownFood: remembered.filter((p) => this.ctx.edible[p.subject] === 1),
      journal: a.journal[id].latest(6).map((e) => ({
        ...e,
        goal: goals[e.goal]?.name ?? '—',
        top: e.top
          .filter((g) => g >= 0)
          .map((g, k) => ({ goal: goals[g].name, score: e.topScore[k] })),
        action: ACTION_NAMES[e.action],
      })),
    };
  }

  /**
   * Hash of everything that defines the simulation state, used by determinism tests.
   * Generated-but-untouched chunks are a pure function of the seed, so only modified chunks
   * count: what the observer looked at never changes the hash.
   * @returns {string}
   */
  hash() {
    const s = this.state;
    const h = createHasher().uint32(s.seedKey).uint32(s.tick);
    h.uint32(s.spawn.x).uint32(s.spawn.y);
    for (const name of RNG_STREAMS) h.string(name).typedArray(s.rng[name].s);
    for (const c of s.world.modifiedChunks()) {
      h.uint32(c.cx).uint32(c.cy).typedArray(c.resource).typedArray(c.quantity);
      h.typedArray(c.structure);
    }
    s.agents.hashInto(h);
    s.threats.hashInto(h);
    for (const colony of s.colonies) colony.hashInto(h);
    s.documents.hashInto(h);
    s.knowledge.hashInto(h);
    s.history.hashInto(h);
    s.crops.hashInto(h);
    h.uint32(s.events.count);
    for (const e of s.events.events) h.uint32(e.tick).string(e.type).uint32(e.agent);
    for (const g of s.regrowth) h.uint32(g.tick).uint32(g.x).uint32(g.y).uint32(g.resource);
    return h.hex();
  }
}
