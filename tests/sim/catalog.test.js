import { describe, expect, it } from 'vitest';
import recipeData from '../../data/recipes.json' with { type: 'json' };
import {
  BARE_HANDS,
  buildCatalog,
  matchRecipe,
  structureSubject,
} from '../../src/sim/crafting/catalog.js';
import { WORLD_TABLES } from '../../src/sim/simulation.js';

const catalog = buildCatalog(recipeData, WORLD_TABLES);
const good = (id) => {
  const r = WORLD_TABLES.resources.findIndex((x) => x.id === id);
  if (r >= 0) return r + 1;
  return catalog.items.find((i) => i.id === id).good;
};
const code = (id) => catalog.structures.find((s) => s.id === id).code;
const mask = (...ids) => ids.reduce((m, id) => m | (1 << good(id)), 0);

describe('catalog', () => {
  it('puts resources and items in one id space', () => {
    expect(catalog.goodCount).toBe(WORLD_TABLES.resources.length + recipeData.items.length + 1);
    expect(catalog.goodName(good('wood'))).toBe('Bois');
    expect(catalog.goodName(good('spear'))).toBe('Lance');
  });

  it('matches a trial by station and exact set of ingredients', () => {
    const workbench = code('workbench');
    expect(catalog.recipes[matchRecipe(catalog, BARE_HANDS, mask('wood', 'fiber'))].id).toBe(
      'workbench',
    );
    const spear = matchRecipe(catalog, workbench, mask('wood', 'fiber'));
    expect(catalog.recipes[spear].id).toBe('spear');
    expect(matchRecipe(catalog, BARE_HANDS, mask('wood'))).toBe(-1);
    expect(matchRecipe(catalog, workbench, mask('wood', 'fiber', 'berries'))).toBe(-1);
  });

  it('knows which recipe makes each good and structure', () => {
    const axe = catalog.recipes[catalog.recipeForGood[good('stone_axe')]];
    expect(axe.station).toBe(code('workbench'));
    expect(catalog.recipeForGood[good('wood')]).toBe(-1);
    expect(catalog.recipes[catalog.recipeForStructure[code('shelter')]].inputs).toHaveLength(3);
  });

  it('marks non-edible resources as experiment materials', () => {
    expect(catalog.material[good('wood')]).toBe(1);
    expect(catalog.material[good('berries')]).toBe(0);
    expect(catalog.material[good('spear')]).toBe(0);
  });

  it('gives structures and danger their own memory subjects', () => {
    const subject = structureSubject(catalog, code('shelter'));
    expect(subject).toBeGreaterThan(WORLD_TABLES.resources.length);
    expect(catalog.dangerSubject).toBe(catalog.subjectCount - 1);
  });

  it('rejects two recipes with the same station and inputs', () => {
    const clash = {
      ...recipeData,
      recipes: [...recipeData.recipes, { ...recipeData.recipes[0], id: 'copy' }],
    };
    expect(() => buildCatalog(clash, WORLD_TABLES)).toThrow();
  });
});
