import { PACK } from '../world/chunk-store.js';

// The town's map (decision 0030): what the people of a large colony know of their land, shared by
// all its commoners instead of each one looking around. Every `mapTicks`, the cheapest ways from
// the camp to every tile within `mapRadius` are computed once (a tree of paths rooted at the
// camp), with the nearest places to drink and the nearest tiles of each resource. A commoner's
// trip from one tile to another follows that tree, through the point where their two ways to the
// camp meet: the town's streets.

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);

// Scratch shared by every map (computed one at a time): a binary heap with lazy deletion, the
// tiles read, and a trail of cells.
let heapCell = new Int32Array(0);
let heapKey = new Float64Array(0);
let stepCost = new Float64Array(0);
let tileResource = new Uint8Array(0);
let tileQuantity = new Uint8Array(0);
let tileWet = new Uint8Array(0);
let trail = new Int32Array(0);

/**
 * @param {number} n - Cells of a map.
 * @returns {void}
 */
function scratch(n) {
  if (stepCost.length >= n) return;
  heapCell = new Int32Array(n * 8 + 1);
  heapKey = new Float64Array(n * 8 + 1);
  stepCost = new Float64Array(n);
  tileResource = new Uint8Array(n);
  tileQuantity = new Uint8Array(n);
  tileWet = new Uint8Array(n);
  trail = new Int32Array(n);
}

export class TownMap {
  /**
   * @param {number} radius - Tiles around the camp.
   * @param {number} resources - Resource slots (ids 1..n-1).
   * @param {number} slots - Nearest places kept per resource.
   * @param {number} drinkSlots - Nearest places to drink kept.
   */
  constructor(radius, resources, slots, drinkSlots) {
    this.radius = radius;
    this.side = 2 * radius + 1;
    const n = this.side * this.side;
    this.originX = 0;
    this.originY = 0;
    this.root = 0;
    /** Cost of the way from the camp to each cell (Infinity: not reachable). */
    this.dist = new Float64Array(n);
    /** Next cell on the way to the camp, -1 at the camp or off the map. */
    this.prev = new Int32Array(n);
    /** Tag of the last trip that went through each cell (meeting point of two ways). */
    this.stamp = new Int32Array(n);
    this.tag = 0;
    this.slots = slots;
    /** Nearest tiles beside water (or a canal) to drink at, nearest first. */
    this.drink = new Int32Array(drinkSlots);
    this.drinkCount = 0;
    /** Wells on the map. */
    this.wells = 0;
    /** 1 for each tile beside water (or a canal): one drinks there. */
    this.wetSide = new Uint8Array(n);
    /** Cost of the way from each cell to the nearest place to drink, and the next cell on it. */
    this.wetDist = new Float64Array(n);
    this.wetPrev = new Int32Array(n);
    /** Nearest tiles of each resource (beside the water for fish), nearest first. */
    this.sources = new Int32Array(resources * slots);
    this.sourceCount = new Uint8Array(resources);
    /** Tick it was last drawn, -1 never, and the world's count of changes then. */
    this.builtTick = -1;
    this.worldStamp = 0;
    scratch(n);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {number} Cell of (x, y), -1 off the map.
   */
  cellAt(x, y) {
    const col = x - this.originX;
    const row = y - this.originY;
    if (col < 0 || row < 0 || col >= this.side || row >= this.side) return -1;
    return row * this.side + col;
  }

  /**
   * @param {number} cell
   * @returns {number}
   */
  cellX(cell) {
    return this.originX + (cell % this.side);
  }

  /**
   * @param {number} cell
   * @returns {number}
   */
  cellY(cell) {
    return this.originY + Math.floor(cell / this.side);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {boolean} True if (x, y) is on the map and the way from the camp reaches it.
   */
  reaches(x, y) {
    const c = this.cellAt(x, y);
    return c >= 0 && this.dist[c] !== Infinity;
  }

  /**
   * Draws the map around the camp (cx, cy): reads the tiles, computes the cheapest way from the
   * camp to every tile, and lists the nearest places to drink and of each resource.
   * @param {import('../simulation.js').SimState} state
   * @param {import('../simulation.js').SimContext} ctx
   * @param {number} cx
   * @param {number} cy
   * @returns {void}
   */
  build(state, ctx, cx, cy) {
    const world = state.world;
    const side = this.side;
    const n = side * side;
    const r = this.radius;
    this.originX = cx - r;
    this.originY = cy - r;
    this.root = r * side + r;
    this.builtTick = state.tick;
    this.worldStamp = world.builds;
    this.wells = 0;
    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side; col++) {
        const i = row * side + col;
        const p = world.packedAt(this.originX + col, this.originY + row);
        const biome = p & PACK.MASK;
        const code = (p >>> PACK.STRUCTURE_SHIFT) & PACK.MASK;
        tileResource[i] = (p >> PACK.RESOURCE_SHIFT) & PACK.MASK;
        tileQuantity[i] = (p >> PACK.QUANTITY_SHIFT) & PACK.MASK;
        // A commoner walks: water only on a pier.
        let ground = ctx.biomeSpeed[biome];
        if (biome === ctx.waterBiome) ground = ctx.deck[code] === 1 ? 1 : 0;
        const worn = world.lastWear() >= ctx.trailSteps ? ctx.trailSpeed : 1;
        const speed = ctx.blocksAgent[code] === 1 ? 0 : ground * worn * ctx.structureSpeed[code];
        stepCost[i] = speed > 0 ? 1 / speed : Infinity;
        tileWet[i] = biome === ctx.waterBiome || ctx.wet[code] === 1 ? 1 : 0;
        if (code !== 0 && code === ctx.wellCode) this.wells++;
      }
    }
    this.drinkCount = 0;
    this.wetSide.fill(0);
    this.sourceCount.fill(0);
    this.dijkstra(ctx, n);
  }

  /**
   * Cheapest ways from the camp, 8 directions without cutting corners (as one walks); cells are
   * listed as places to drink and sources as they are reached, nearest first. Then the cheapest
   * way from every cell to the nearest place to drink.
   * @param {import('../simulation.js').SimContext} ctx
   * @param {number} n
   * @returns {void}
   */
  dijkstra(ctx, n) {
    trail[0] = this.root;
    this.spread(ctx, n, this.dist, this.prev, 1, true);
    let roots = 0;
    for (let i = 0; i < n; i++) {
      if (this.wetSide[i] === 1 && this.dist[i] !== Infinity) trail[roots++] = i;
    }
    this.spread(ctx, n, this.wetDist, this.wetPrev, roots, false);
  }

  /**
   * Dijkstra from the `roots` first cells of the trail: cost of the cheapest way to each cell in
   * `dist`, the next cell back towards the roots in `prev`.
   * @param {import('../simulation.js').SimContext} ctx
   * @param {number} n
   * @param {Float64Array} dist
   * @param {Int32Array} prev
   * @param {number} roots
   * @param {boolean} noting - List places to drink and sources as cells are reached.
   * @returns {void}
   */
  spread(ctx, n, dist, prev, roots, noting) {
    const side = this.side;
    dist.fill(Infinity, 0, n);
    prev.fill(-1, 0, n);
    let size = 0;
    const push = (cell, key) => {
      let i = ++size;
      while (i > 1) {
        const parent = i >> 1;
        if (heapKey[parent] < key || (heapKey[parent] === key && heapCell[parent] < cell)) break;
        heapCell[i] = heapCell[parent];
        heapKey[i] = heapKey[parent];
        i = parent;
      }
      heapCell[i] = cell;
      heapKey[i] = key;
    };
    const pop = () => {
      const lastCell = heapCell[size];
      const lastKey = heapKey[size];
      size--;
      let i = 1;
      for (;;) {
        let child = i * 2;
        if (child > size) break;
        if (
          child + 1 <= size &&
          (heapKey[child + 1] < heapKey[child] ||
            (heapKey[child + 1] === heapKey[child] && heapCell[child + 1] < heapCell[child]))
        ) {
          child++;
        }
        if (heapKey[child] > lastKey || (heapKey[child] === lastKey && heapCell[child] > lastCell))
          break;
        heapCell[i] = heapCell[child];
        heapKey[i] = heapKey[child];
        i = child;
      }
      heapCell[i] = lastCell;
      heapKey[i] = lastKey;
    };
    for (let k = 0; k < roots; k++) {
      dist[trail[k]] = 0;
      push(trail[k], 0);
    }
    while (size > 0) {
      const i = heapCell[1];
      const d = heapKey[1];
      pop();
      if (d > dist[i]) continue;
      const col = i % side;
      const row = (i - col) / side;
      if (noting) this.note(ctx, i, col, row);
      for (let k = 0; k < 8; k++) {
        const nc = col + DX[k];
        const nr = row + DY[k];
        if (nc < 0 || nr < 0 || nc >= side || nr >= side) continue;
        const ni = nr * side + nc;
        if (stepCost[ni] === Infinity) continue;
        let step = 1;
        if (k >= 4) {
          if (stepCost[row * side + nc] === Infinity) continue;
          if (stepCost[nr * side + col] === Infinity) continue;
          step = Math.SQRT2;
        }
        const nd = d + step * stepCost[ni];
        if (nd < dist[ni]) {
          dist[ni] = nd;
          prev[ni] = i;
          push(ni, nd);
        }
      }
    }
  }

  /**
   * A cell just reached: a place to drink if water is beside it, a source of the resource it
   * holds, and of the fish in the water beside it.
   * @param {import('../simulation.js').SimContext} ctx
   * @param {number} i
   * @param {number} col
   * @param {number} row
   * @returns {void}
   */
  note(ctx, i, col, row) {
    const res = tileResource[i];
    if (res !== 0 && tileQuantity[i] > 0 && ctx.fromShore[res] !== 1) this.addSource(res, i);
    const side = this.side;
    let water = false;
    for (let k = 0; k < 8; k++) {
      const nc = col + DX[k];
      const nr = row + DY[k];
      if (nc < 0 || nr < 0 || nc >= side || nr >= side) continue;
      const ni = nr * side + nc;
      if (tileWet[ni] !== 1) continue;
      water = true;
      // Fish is taken from the shore.
      const r = tileResource[ni];
      if (r !== 0 && ctx.fromShore[r] === 1 && tileQuantity[ni] > 0) this.addSource(r, i);
    }
    this.wetSide[i] = water ? 1 : 0;
    if (water && this.drinkCount < this.drink.length) this.drink[this.drinkCount++] = i;
  }

  /**
   * @param {number} res
   * @param {number} cell
   * @returns {void}
   */
  addSource(res, cell) {
    const k = this.sourceCount[res];
    if (k >= this.slots) return;
    const base = res * this.slots;
    // The same shore tile can hold fish on several sides: listed once.
    if (k > 0 && this.sources[base + k - 1] === cell) return;
    this.sources[base + k] = cell;
    this.sourceCount[res] = k + 1;
  }

  /**
   * Writes the way from (ax, ay) to the nearest place to drink, as x, y pairs (the start
   * excluded), cut at what `out` holds.
   * @param {number} ax
   * @param {number} ay
   * @param {Int32Array} out
   * @returns {number} Steps written, -1 if off the map or no water is reached from there.
   */
  pathToWater(ax, ay, out) {
    const a = this.cellAt(ax, ay);
    if (a < 0 || this.wetDist[a] === Infinity) return -1;
    const max = out.length >> 1;
    let steps = 0;
    for (let c = this.wetPrev[a]; c >= 0 && steps < max; c = this.wetPrev[c]) {
      out[steps * 2] = this.cellX(c);
      out[steps * 2 + 1] = this.cellY(c);
      steps++;
    }
    return steps;
  }

  /**
   * Writes the way from (ax, ay) to (bx, by) along the town's tree of ways, as x, y pairs (the
   * start excluded), cut at what `out` holds.
   * @param {number} ax
   * @param {number} ay
   * @param {number} bx
   * @param {number} by
   * @param {Int32Array} out
   * @returns {number} Steps written, -1 if either end is off the map or out of reach.
   */
  path(ax, ay, bx, by, out) {
    const a = this.cellAt(ax, ay);
    const b = this.cellAt(bx, by);
    if (a < 0 || b < 0 || this.dist[a] === Infinity || this.dist[b] === Infinity) return -1;
    if (a === b) return 0;
    const prev = this.prev;
    const stamp = this.stamp;
    const tag = ++this.tag;
    for (let c = a; c >= 0; c = prev[c]) stamp[c] = tag;
    // From the end back to where it meets the start's way.
    let m = 0;
    let meet = b;
    while (stamp[meet] !== tag) {
      trail[m++] = meet;
      meet = prev[meet];
    }
    const max = out.length >> 1;
    let steps = 0;
    // Up the start's way to the meeting point (included), then down the end's way.
    for (let c = a; c !== meet && steps < max;) {
      c = prev[c];
      out[steps * 2] = this.cellX(c);
      out[steps * 2 + 1] = this.cellY(c);
      steps++;
    }
    for (let k = m - 1; k >= 0 && steps < max; k--) {
      out[steps * 2] = this.cellX(trail[k]);
      out[steps * 2 + 1] = this.cellY(trail[k]);
      steps++;
    }
    return steps;
  }
}
