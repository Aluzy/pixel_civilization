import { randomAt } from '../core/hash.js';
import { Chunk } from './chunk.js';
import { CHUNK_SIZE } from './coords.js';
import { SimplexNoise2D, fbm } from './noise.js';

// Salts for per-tile randomness, distinct from placement indices.
const SALT_QUANTITY = 0x5100;

/**
 * Applies a contrast stretch around 0.5; fbm values cluster near the middle otherwise.
 * @param {number} v
 * @param {number} contrast
 * @returns {number}
 */
function stretch(v, contrast) {
  const s = 0.5 + (v - 0.5) * contrast;
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

/**
 * Deterministic world generator: the content of a chunk depends only on the seed and its
 * coordinates, never on which chunks were generated before.
 */
export class WorldGenerator {
  /**
   * @param {import('../core/rng.js').Rng} rng - The simulation's "world" stream.
   * @param {import('./world-data.js').WorldTables} tables
   */
  constructor(rng, tables) {
    this.tables = tables;
    this.key = rng.key;
    const f = tables.fields;
    this.altitudeNoise = new SimplexNoise2D(rng.fork('altitude'));
    this.humidityNoise = new SimplexNoise2D(rng.fork('humidity'));
    this.temperatureNoise = new SimplexNoise2D(rng.fork('temperature'));
    this.altitudeParams = f.altitude;
    this.humidityParams = f.humidity;
    this.temperatureParams = f.temperature;
    /** @type {SimplexNoise2D[]} One cluster noise per placement rule. */
    this.placementNoise = [];
    for (let i = 0; i < tables.placementCount; i++) {
      this.placementNoise.push(new SimplexNoise2D(rng.fork(`placement-${i}`)));
    }
    // Pre-split biome conditions into flat arrays for the per-tile loop.
    this.rules = tables.biomes.map((b) => ({
      a: b.when.altitude ?? [-Infinity, Infinity],
      h: b.when.humidity ?? [-Infinity, Infinity],
      t: b.when.temperature ?? [-Infinity, Infinity],
    }));
    this.clusterParams = { scale: 0, octaves: 2, lacunarity: 2, gain: 0.5 };
    /** Reused output of {@link WorldGenerator#sampleFields}: altitude, humidity, temperature. */
    this.fields = new Float64Array(3);
  }

  /**
   * @param {number} altitude
   * @param {number} humidity
   * @param {number} temperature
   * @returns {number} Biome index (first matching rule).
   */
  classify(altitude, humidity, temperature) {
    const rules = this.rules;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (
        altitude >= r.a[0] &&
        altitude < r.a[1] &&
        humidity >= r.h[0] &&
        humidity < r.h[1] &&
        temperature >= r.t[0] &&
        temperature < r.t[1]
      ) {
        return i;
      }
    }
    return rules.length - 1;
  }

  /**
   * Writes altitude, humidity and temperature at a tile into {@link WorldGenerator#fields}.
   * Allocation-free: called for every generated tile.
   * @param {number} x
   * @param {number} y
   * @returns {Float64Array}
   */
  sampleFields(x, y) {
    const out = this.fields;
    const a = this.altitudeParams;
    const h = this.humidityParams;
    const t = this.temperatureParams;
    out[0] = stretch(fbm(this.altitudeNoise, x, y, a), a.contrast);
    out[1] = stretch(fbm(this.humidityNoise, x, y, h), h.contrast);
    out[2] = stretch(fbm(this.temperatureNoise, x, y, t), t.contrast);
    return out;
  }

  /**
   * Environmental fields at a tile, as an object (for inspection and tests, not hot loops).
   * @param {number} x
   * @param {number} y
   * @returns {{ altitude: number, humidity: number, temperature: number }}
   */
  fieldsAt(x, y) {
    const f = this.sampleFields(x, y);
    return { altitude: f[0], humidity: f[1], temperature: f[2] };
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @returns {Chunk}
   */
  generateChunk(cx, cy) {
    const chunk = new Chunk(cx, cy);
    const { placementsByBiome } = this.tables;
    const cluster = this.clusterParams;
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const y = y0 + ly;
        const f = this.sampleFields(x, y);
        const altitude = f[0];
        const biome = this.classify(altitude, f[1], f[2]);
        const i = ly * CHUNK_SIZE + lx;
        chunk.biome[i] = biome;
        chunk.altitude[i] = Math.round(altitude * 255);

        const placements = placementsByBiome[biome];
        for (let p = 0; p < placements.length; p++) {
          const rule = placements[p];
          if (altitude < rule.minAltitude) continue;
          cluster.scale = rule.scale;
          if (fbm(this.placementNoise[rule.index], x, y, cluster) < rule.threshold) continue;
          if (randomAt(this.key, x, y, rule.index) >= rule.density) continue;
          const q = randomAt(this.key, x, y, SALT_QUANTITY + rule.index);
          chunk.resource[i] = rule.resource;
          chunk.quantity[i] = rule.qMin + Math.floor(q * (rule.qMax - rule.qMin + 1));
          break;
        }
      }
    }
    return chunk;
  }
}
