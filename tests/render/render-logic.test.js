import { describe, expect, it } from 'vitest';
import { nextZoom, scrollToKeepPoint, visibleRect } from '../../src/render/camera-math.js';
import { buildPalette, hexToRgb, paintChunk } from '../../src/render/palette.js';
import { CATALOG, WORLD_TABLES } from '../../src/sim/simulation.js';
import { CHUNK_SIZE } from '../../src/sim/world/coords.js';
import { formatTile } from '../../src/ui/tile-info.js';

const AREA = CHUNK_SIZE * CHUNK_SIZE;

describe('palette', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('never gives a biome or a resource the colour reserved for individuals', () => {
    const p = buildPalette(WORLD_TABLES);
    for (let i = 0; i < p.biomes.length; i += 3) {
      expect(p.biomes[i] + p.biomes[i + 1] + p.biomes[i + 2]).toBeGreaterThan(0);
    }
    for (let i = 3; i < p.resources.length; i += 3) {
      expect(p.resources[i] + p.resources[i + 1] + p.resources[i + 2]).toBeGreaterThan(0);
    }
  });

  it('paints resources over their biome', () => {
    const p = buildPalette(WORLD_TABLES);
    const chunk = {
      biome: new Uint8Array(AREA),
      resource: new Uint8Array(AREA),
    };
    chunk.biome.fill(0);
    chunk.resource[1] = 2;
    const rgba = new Uint8ClampedArray(AREA * 4);
    paintChunk(rgba, chunk, p);
    expect([...rgba.slice(0, 4)]).toEqual([...hexToRgb(WORLD_TABLES.biomes[0].color), 255]);
    expect([...rgba.slice(4, 8)]).toEqual([...hexToRgb(WORLD_TABLES.resources[1].color), 255]);
  });

  it('paints structures over everything, never in pure black', () => {
    const p = buildPalette(WORLD_TABLES, CATALOG.structures);
    const chunk = {
      biome: new Uint8Array(AREA),
      resource: new Uint8Array(AREA),
      structure: new Uint8Array(AREA),
    };
    chunk.resource[0] = 2;
    chunk.structure[0] = 1;
    const rgba = new Uint8ClampedArray(AREA * 4);
    paintChunk(rgba, chunk, p);
    expect([...rgba.slice(0, 4)]).toEqual([...hexToRgb(CATALOG.structures[0].color), 255]);
    for (let i = 3; i < p.structures.length; i += 3) {
      expect(p.structures[i] + p.structures[i + 1] + p.structures[i + 2]).toBeGreaterThan(0);
    }
  });
});

describe('camera math', () => {
  it('keeps the world point under the cursor fixed when zooming', () => {
    const view = { width: 800, height: 600 };
    const pointer = { x: 600, y: 150 };
    const before = { scrollX: 100, scrollY: -40, zoom: 2 };
    const world = visibleRect({ ...before, ...view });
    const wx = world.x0 + pointer.x / before.zoom;
    const wy = world.y0 + pointer.y / before.zoom;
    const scroll = scrollToKeepPoint({ ...before, ...view }, pointer, 8);
    const after = visibleRect({ ...scroll, zoom: 8, ...view });
    expect(after.x0 + pointer.x / 8).toBeCloseTo(wx, 9);
    expect(after.y0 + pointer.y / 8).toBeCloseTo(wy, 9);
  });

  it('steps through zoom levels and clamps at the ends', () => {
    const steps = [1, 2, 4, 8, 16];
    expect(nextZoom(4, 1, steps)).toBe(8);
    expect(nextZoom(4, -1, steps)).toBe(2);
    expect(nextZoom(16, 1, steps)).toBe(16);
    expect(nextZoom(1, -1, steps)).toBe(1);
    expect(nextZoom(5, 1, steps)).toBe(8);
    expect(nextZoom(5, -1, steps)).toBe(4);
  });

  it('computes the visible tile rectangle', () => {
    const r = visibleRect({ scrollX: 0, scrollY: 0, zoom: 4, width: 400, height: 200 });
    expect(r.x1 - r.x0).toBeCloseTo(100, 9);
    expect(r.y1 - r.y0).toBeCloseTo(50, 9);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(200, 9);
  });
});

describe('tile info', () => {
  it('describes a tile with its biome, resource and quantity', () => {
    const forest = WORLD_TABLES.biomes.findIndex((b) => b.id === 'forest');
    const wood = WORLD_TABLES.resources.findIndex((r) => r.id === 'wood') + 1;
    const text = formatTile(
      { x: -3, y: 12, biome: forest, resource: wood, quantity: 14, altitude: 128 },
      WORLD_TABLES,
    );
    expect(text).toBe('(-3, 12) · Forêt · Bois × 14 · altitude 50 %');
  });

  it('omits the resource when there is none', () => {
    expect(
      formatTile({ x: 0, y: 0, biome: 0, resource: 0, quantity: 0, altitude: 0 }, WORLD_TABLES),
    ).toBe(`(0, 0) · ${WORLD_TABLES.biomes[0].name} · altitude 0 %`);
  });
});
