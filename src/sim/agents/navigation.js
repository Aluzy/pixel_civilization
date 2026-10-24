import { PACK } from '../world/chunk-store.js';

/** Largest perception radius supported by the navigation window. */
export const MAX_RADIUS = 22;
const MAX_SIDE = 2 * MAX_RADIUS + 1;
const MAX_CELLS = MAX_SIDE * MAX_SIDE;

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);

/**
 * Local navigation inside an agent's perception window. Everything it knows comes from the tiles
 * the agent can see right now (rule "beliefs, not omniscience"), so paths never cross unseen land.
 * One shared instance; its buffers are reused for every query (no allocation).
 */
export class Navigator {
  /**
   * @param {object} options
   * @param {Float64Array} options.biomeSpeed - Speed factor per biome index; 0 = impassable.
   * @param {number} options.waterBiome - Biome index of water.
   */
  constructor({ biomeSpeed, waterBiome }) {
    this.biomeSpeed = biomeSpeed;
    this.waterBiome = waterBiome;
    this.biome = new Uint8Array(MAX_CELLS);
    this.resource = new Uint8Array(MAX_CELLS);
    this.quantity = new Uint8Array(MAX_CELLS);
    this.stepCost = new Float64Array(MAX_CELLS);
    this.dist = new Float64Array(MAX_CELLS);
    this.prev = new Int32Array(MAX_CELLS);
    // Binary heap with lazy deletion: up to 8 pushes per cell.
    this.heapCell = new Int32Array(MAX_CELLS * 8 + 1);
    this.heapKey = new Float64Array(MAX_CELLS * 8 + 1);
    this.heapSize = 0;
    this.side = 0;
    this.radius = 0;
    this.originX = 0;
    this.originY = 0;
    this.center = 0;
  }

  /**
   * Reads the window around (cx, cy) and computes the cheapest path cost to every visible cell.
   * @param {import('../world/chunk-store.js').ChunkStore} world
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @returns {void}
   */
  prepare(world, cx, cy, radius) {
    const r = radius > MAX_RADIUS ? MAX_RADIUS : radius;
    const side = 2 * r + 1;
    this.radius = r;
    this.side = side;
    this.originX = cx - r;
    this.originY = cy - r;
    this.center = r * side + r;
    const n = side * side;
    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side; col++) {
        const i = row * side + col;
        const p = world.packedAt(this.originX + col, this.originY + row);
        const biome = p & PACK.MASK;
        this.biome[i] = biome;
        this.resource[i] = (p >> PACK.RESOURCE_SHIFT) & PACK.MASK;
        this.quantity[i] = (p >> PACK.QUANTITY_SHIFT) & PACK.MASK;
        const speed = this.biomeSpeed[biome];
        this.stepCost[i] = speed > 0 ? 1 / speed : Infinity;
      }
    }
    this.dijkstra(n);
  }

  /**
   * @param {number} n - Number of cells in the window.
   * @returns {void}
   */
  dijkstra(n) {
    const side = this.side;
    const dist = this.dist;
    dist.fill(Infinity, 0, n);
    this.prev.fill(-1, 0, n);
    dist[this.center] = 0;
    this.heapSize = 0;
    this.push(this.center, 0);
    while (this.heapSize > 0) {
      const i = this.heapCell[1];
      const d = this.heapKey[1];
      this.pop();
      if (d > dist[i]) continue;
      const col = i % side;
      const row = (i - col) / side;
      for (let k = 0; k < 8; k++) {
        const nc = col + DX[k];
        const nr = row + DY[k];
        if (nc < 0 || nr < 0 || nc >= side || nr >= side) continue;
        const ni = nr * side + nc;
        if (this.stepCost[ni] === Infinity) continue;
        let step = 1;
        if (k >= 4) {
          // No corner cutting: both orthogonal neighbours must be passable.
          if (this.stepCost[row * side + nc] === Infinity) continue;
          if (this.stepCost[nr * side + col] === Infinity) continue;
          step = Math.SQRT2;
        }
        const nd = d + step * this.stepCost[ni];
        if (nd < dist[ni]) {
          dist[ni] = nd;
          this.prev[ni] = i;
          this.push(ni, nd);
        }
      }
    }
  }

  /**
   * @param {number} cell
   * @param {number} key
   * @returns {void}
   */
  push(cell, key) {
    let i = ++this.heapSize;
    const hc = this.heapCell;
    const hk = this.heapKey;
    while (i > 1) {
      const parent = i >> 1;
      if (hk[parent] < key || (hk[parent] === key && hc[parent] < cell)) break;
      hc[i] = hc[parent];
      hk[i] = hk[parent];
      i = parent;
    }
    hc[i] = cell;
    hk[i] = key;
  }

  /** @returns {void} */
  pop() {
    const hc = this.heapCell;
    const hk = this.heapKey;
    const lastCell = hc[this.heapSize];
    const lastKey = hk[this.heapSize];
    const size = --this.heapSize;
    let i = 1;
    for (;;) {
      let child = i * 2;
      if (child > size) break;
      if (
        child + 1 <= size &&
        (hk[child + 1] < hk[child] || (hk[child + 1] === hk[child] && hc[child + 1] < hc[child]))
      ) {
        child++;
      }
      if (hk[child] > lastKey || (hk[child] === lastKey && hc[child] > lastCell)) break;
      hc[i] = hc[child];
      hk[i] = hk[child];
      i = child;
    }
    hc[i] = lastCell;
    hk[i] = lastKey;
  }

  /**
   * @param {number} cell
   * @returns {number} World x.
   */
  cellX(cell) {
    return this.originX + (cell % this.side);
  }

  /**
   * @param {number} cell
   * @returns {number} World y.
   */
  cellY(cell) {
    return this.originY + Math.floor(cell / this.side);
  }

  /**
   * Window cell of a world position, or -1 if outside the window.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  cellAt(x, y) {
    const col = x - this.originX;
    const row = y - this.originY;
    if (col < 0 || row < 0 || col >= this.side || row >= this.side) return -1;
    return row * this.side + col;
  }

  /**
   * Window cell of a world position whose 8 neighbours are all inside the window, or -1.
   * Only such cells can be fully checked against what the agent sees.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  innerCellAt(x, y) {
    const col = x - this.originX;
    const row = y - this.originY;
    if (col < 1 || row < 1 || col >= this.side - 1 || row >= this.side - 1) return -1;
    return row * this.side + col;
  }

  /**
   * @param {number} cell
   * @returns {boolean} True if a path from the agent reaches this cell.
   */
  reachable(cell) {
    return this.dist[cell] !== Infinity;
  }

  /**
   * True if one of the 8 neighbours inside the window is water.
   * @param {number} cell
   * @returns {boolean}
   */
  besideWater(cell) {
    const side = this.side;
    const col = cell % side;
    const row = (cell - col) / side;
    for (let k = 0; k < 8; k++) {
      const nc = col + DX[k];
      const nr = row + DY[k];
      if (nc < 0 || nr < 0 || nc >= side || nr >= side) continue;
      if (this.biome[nr * side + nc] === this.waterBiome) return true;
    }
    return false;
  }

  /**
   * Cheapest reachable cell next to water, or -1.
   * @returns {number}
   */
  nearestWaterSide() {
    let best = -1;
    const n = this.side * this.side;
    for (let i = 0; i < n; i++) {
      if (this.dist[i] === Infinity) continue;
      if (best >= 0 && this.dist[i] >= this.dist[best]) continue;
      if (this.besideWater(i)) best = i;
    }
    return best;
  }

  /**
   * Cheapest reachable cell holding a resource flagged in `wanted`, or -1.
   * @param {Uint8Array} wanted - 1 for each wanted resource id.
   * @returns {number}
   */
  nearestResource(wanted) {
    let best = -1;
    const n = this.side * this.side;
    for (let i = 0; i < n; i++) {
      if (this.dist[i] === Infinity || wanted[this.resource[i]] !== 1) continue;
      if (this.quantity[i] === 0) continue;
      if (best < 0 || this.dist[i] < this.dist[best]) best = i;
    }
    return best;
  }

  /**
   * Reachable cell closest to a world target (beyond the window if need be), ties broken by
   * path cost. Returns -1 when no reachable cell is closer than where the agent stands.
   * @param {number} tx
   * @param {number} ty
   * @returns {number}
   */
  toward(tx, ty) {
    const cdx = this.cellX(this.center) - tx;
    const cdy = this.cellY(this.center) - ty;
    let bestD2 = cdx * cdx + cdy * cdy;
    let best = -1;
    const n = this.side * this.side;
    for (let i = 0; i < n; i++) {
      if (this.dist[i] === Infinity) continue;
      const dx = this.cellX(i) - tx;
      const dy = this.cellY(i) - ty;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2 || (d2 === bestD2 && best >= 0 && this.dist[i] < this.dist[best])) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  /**
   * Writes the path from the agent to `cell` (agent's cell excluded) as x, y pairs.
   * @param {number} cell - A reachable cell.
   * @param {Int32Array} out
   * @returns {number} Number of steps.
   */
  writePath(cell, out) {
    let steps = 0;
    for (let c = cell; c !== this.center && c >= 0; c = this.prev[c]) steps++;
    let k = steps - 1;
    for (let c = cell; c !== this.center && c >= 0; c = this.prev[c]) {
      out[k * 2] = this.cellX(c);
      out[k * 2 + 1] = this.cellY(c);
      k--;
    }
    return steps;
  }
}
