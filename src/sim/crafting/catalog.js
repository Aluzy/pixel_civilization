import { MAX_BITS } from '../core/bits.js';
/**
 * Everything that can be owned or built, indexed for fast lookups (docs/design/04-fabrication.md).
 *
 * Goods share one id space: 0 is unused, 1…R are resources (same ids as in the world), R+1…R+I
 * are crafted items. Structures (stations and shelters) live on the world's structure layer with
 * codes 1…S. Memory subjects: 0 water, 1…R resources, R+1…R+S structures, R+S+1 danger.
 *
 * Trials and recipes name their ingredients as a bit set over the ingredients only (goods that
 * can be tried or are used by a recipe), so the number of goods is not bounded by 31: only the
 * number of ingredients is.
 */

/** Recipe station code meaning "bare hands, no station". */
export const BARE_HANDS = 0;

/**
 * @typedef {object} ItemDef
 * @property {number} good - Good id.
 * @property {string} id
 * @property {string} name
 * @property {string} kind - "weapon", "tool", "armor", "material" (paper, ink, hide, seed: tried
 *   in experiments), "ingredient" (flour: only tried when looking for its use), "food" (dishes),
 *   "book" or "map".
 * @property {number} attack - Attack multiplier (weapons), 1 otherwise.
 * @property {number} defense - Defense added while carried (armour, shields), 0 otherwise.
 * @property {number} pleasure - Pleasure of eating it (dishes), 0 otherwise.
 * @property {Float64Array} harvest - Harvest speed multiplier per resource id (tools).
 * @property {boolean} sail - Who carries it goes on water (a boat, a ship).
 */

/**
 * @typedef {object} StructureDef
 * @property {number} code - Value on the world's structure layer (1…S).
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {string} kind - "station", "shelter", "library", "den" or "plot".
 * @property {number} sleepRecovery - Fatigue recovery multiplier while sleeping inside.
 * @property {number[] | null} footprint - Width, height of a building with walls and a door
 *   (a shelter): its inside tiles are beds.
 * @property {string | null} wall - Structure id of its walls.
 * @property {string | null} door - Structure id of its door.
 * @property {number} speed - Walking speed factor on it (1, or less to wade through a canal).
 * @property {boolean} feminine - Grammatical gender of its French name, for the chronicle.
 * @property {boolean} shore - Built only beside water (a shipyard).
 * @property {boolean} great - A great library: four times the room, it does not burn.
 */

/**
 * @typedef {object} RecipeDef
 * @property {number} index
 * @property {string} id
 * @property {string} name - Name of what it makes.
 * @property {number} station - Structure code, or {@link BARE_HANDS}.
 * @property {{ good: number, count: number }[]} inputs
 * @property {number} mask - Bit set of input ingredients (identifies the recipe with the station).
 * @property {number} duration - Ticks.
 * @property {'item' | 'structure'} outputKind
 * @property {string} family - "structure", or "item:" + the item kind ("item:weapon"…): what the
 *   trial heuristic compares (all structures are alike; items are alike within a kind).
 * @property {number} output - Good id (item) or structure code.
 */

/**
 * @typedef {object} Catalog
 * @property {number} resourceCount
 * @property {number} goodCount - Size of a goods array (includes the unused 0).
 * @property {ItemDef[]} items
 * @property {StructureDef[]} structures - Index = code − 1.
 * @property {RecipeDef[]} recipes
 * @property {Int16Array} recipeForGood - Recipe index making each good, or −1.
 * @property {Int16Array} recipeForStructure - Recipe index making each structure code, or −1.
 * @property {Uint8Array} material - 1 for goods usable in experiments (non-edible resources).
 * @property {Int8Array} ingredientBit - Bit of each good in a trial or recipe mask, or −1.
 * @property {Int16Array} ingredientGood - Good of each mask bit.
 * @property {Int16Array} requiredTool - Per resource id: good id of the tool needed to harvest it,
 *   0 if none, -1 if that tool does not exist yet (out of reach).
 * @property {number} subjectCount - Number of memory subjects.
 * @property {number} dangerSubject
 * @property {(good: number) => string} goodName
 */

/**
 * Numeric key of a trial: station and set of ingredients (exact in a double, no allocation).
 * @param {number} station
 * @param {number} mask
 * @returns {number}
 */
export function recipeKey(station, mask) {
  return station * 0x80000000 + mask;
}

/**
 * @param {object} data - Content of data/recipes.json.
 * @param {import('../world/world-data.js').WorldTables} tables
 * @returns {Catalog & { byKey: Map<number, number> }}
 */
export function buildCatalog(data, tables) {
  const resourceCount = tables.resources.length;
  const goodIds = new Map(tables.resources.map((r, i) => [r.id, i + 1]));
  data.items.forEach((item, i) => goodIds.set(item.id, resourceCount + 1 + i));
  const goodCount = resourceCount + data.items.length + 1;
  const goodOf = (id) => {
    const g = goodIds.get(id);
    if (g === undefined) throw new Error(`Unknown good: ${id}`);
    return g;
  };

  /** @type {ItemDef[]} */
  const items = data.items.map((item, i) => {
    const harvest = new Float64Array(resourceCount + 1).fill(1);
    for (const [res, mult] of Object.entries(item.harvest ?? {})) harvest[goodOf(res)] = mult;
    return {
      good: resourceCount + 1 + i,
      id: item.id,
      name: item.name,
      kind: item.kind,
      attack: item.attack ?? 1,
      defense: item.defense ?? 0,
      pleasure: item.pleasure ?? 0,
      harvest,
      sail: item.sail === true,
    };
  });

  /** @type {StructureDef[]} */
  const structures = data.structures.map((s, i) => ({
    code: i + 1,
    id: s.id,
    name: s.name,
    color: s.color,
    kind: s.kind,
    sleepRecovery: s.sleepRecovery ?? 1,
    footprint: s.footprint ?? null,
    speed: s.speed ?? 1,
    wall: s.wall ?? null,
    door: s.door ?? null,
    feminine: s.feminine === true,
    shore: s.shore === true,
    great: s.great === true,
  }));
  const structureCode = new Map(structures.map((s) => [s.id, s.code]));

  const material = new Uint8Array(goodCount);
  const requiredTool = new Int16Array(resourceCount + 1);
  tables.resources.forEach((r, i) => {
    // Gold and gems are kept, not thrown into trials.
    if (!(r.nutrition > 0) && !r.treasure) material[i + 1] = 1;
    // A tool not in the recipes yet (a later tier) leaves the resource out of reach.
    if (r.tool) requiredTool[i + 1] = goodIds.get(r.tool) ?? -1;
  });

  // Crafted materials (paper, ink) can be combined in trials too.
  for (const item of items) if (item.kind === 'material') material[item.good] = 1;
  // Foods some recipe transforms (berries, meat) are ingredients too, but they are only tried
  // when looking for what can be done with one of them (cooking): never thrown into trials.
  const used = new Set(data.recipes.flatMap((r) => Object.keys(r.inputs).map(goodOf)));
  // Ingredient bits: every material and recipe input, in good order.
  const ingredientBit = new Int8Array(goodCount).fill(-1);
  const ingredientList = [];
  for (let g = 1; g < goodCount; g++) {
    if (material[g] !== 1 && !used.has(g)) continue;
    ingredientBit[g] = ingredientList.length;
    ingredientList.push(g);
  }
  if (ingredientList.length > 31) throw new Error('At most 31 ingredients (masks are 31-bit).');
  if (data.recipes.length > MAX_BITS) throw new Error(`At most ${MAX_BITS} recipes (53-bit sets).`);
  const ingredientGood = Int16Array.from(ingredientList);

  const recipeForGood = new Int16Array(goodCount).fill(-1);
  const recipeForStructure = new Int16Array(structures.length + 1).fill(-1);
  const byKey = new Map();
  /** @type {RecipeDef[]} */
  const recipes = data.recipes.map((r, index) => {
    const station = r.station === null ? BARE_HANDS : structureCode.get(r.station);
    if (station === undefined) throw new Error(`Unknown station: ${r.station}`);
    const inputs = Object.entries(r.inputs).map(([id, count]) => ({ good: goodOf(id), count }));
    if (inputs.length < 1 || inputs.length > 3) throw new Error(`Recipe ${r.id}: 1 to 3 inputs`);
    let mask = 0;
    for (const { good } of inputs) mask |= 1 << ingredientBit[good];
    const key = recipeKey(station, mask);
    if (byKey.has(key)) throw new Error(`Recipes ${r.id} and another share station and inputs`);
    byKey.set(key, index);
    const isItem = r.output.item !== undefined;
    const output = isItem ? goodOf(r.output.item) : structureCode.get(r.output.structure);
    if (output === undefined) throw new Error(`Recipe ${r.id}: unknown output`);
    if (isItem) recipeForGood[output] = index;
    else recipeForStructure[output] = index;
    const name = isItem ? items[output - resourceCount - 1].name : structures[output - 1].name;
    return {
      index,
      id: r.id,
      name,
      station,
      inputs,
      mask,
      duration: r.durationTicks,
      outputKind: isItem ? 'item' : 'structure',
      family: isItem ? `item:${items[output - resourceCount - 1].kind}` : 'structure',
      output,
    };
  });

  return {
    resourceCount,
    goodCount,
    items,
    structures,
    recipes,
    recipeForGood,
    recipeForStructure,
    material,
    ingredientBit,
    ingredientGood,
    requiredTool,
    byKey,
    subjectCount: resourceCount + structures.length + 2,
    dangerSubject: resourceCount + structures.length + 1,
    goodName: (good) =>
      good <= resourceCount
        ? tables.resources[good - 1].name
        : items[good - resourceCount - 1].name,
  };
}

/**
 * Good of the lowest bit of an ingredient mask (`m & -m` isolates it).
 * @param {Catalog} catalog
 * @param {number} m - Non-zero mask.
 * @returns {number}
 */
export function lowestIngredient(catalog, m) {
  return catalog.ingredientGood[31 - Math.clz32(m & -m)];
}

/**
 * Memory subject of a structure code.
 * @param {Catalog} catalog
 * @param {number} code
 * @returns {number}
 */
export function structureSubject(catalog, code) {
  return catalog.resourceCount + code;
}

/**
 * Recipe matching a trial (station + set of goods), or −1.
 * @param {Catalog & { byKey: Map<number, number> }} catalog
 * @param {number} station
 * @param {number} mask
 * @returns {number}
 */
export function matchRecipe(catalog, station, mask) {
  return catalog.byKey.get(recipeKey(station, mask)) ?? -1;
}
