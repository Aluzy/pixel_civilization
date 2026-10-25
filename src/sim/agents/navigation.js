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
   * @param {Uint8Array} [options.blocks] - 1 for each structure code that cannot be crossed.
   */
  constructor({ biomeSpeed, waterBiome, blocks = new Uint8Array(256) }) {
    this.biomeSpeed = biomeSpeed;
    this.blocks = blocks;
    /**
     * Colonies whose enclosures are known to everyone who walks by them (set by the simulation):
     * a target across a wall is reached through its gate.
     * @type {{ encState: number, gatesBuilt: number, gateCount: number, encX0: number,
     *   encY0: number, encX1: number, encY1: number, gateX: Int32Array, gateY: Int32Array,
     *   inside: (x: number, y: number) => boolean, onRing: (x: number, y: number) => boolean }[]}
     */
    this.colonies = [];
    /** Waypoint written by {@link Navigator#detour}. */
    this.wayX = 0;
    this.wayY = 0;
    this.waterBiome = waterBiome;
    this.biome = new Uint8Array(MAX_CELLS);
    this.resource = new Uint8Array(MAX_CELLS);
    this.quantity = new Uint8Array(MAX_CELLS);
    this.structure = new Uint8Array(MAX_CELLS);
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
        this.structure[i] = (p >>> PACK.STRUCTURE_SHIFT) & PACK.MASK;
        const speed = this.blocks[this.structure[i]] === 1 ? 0 : this.biomeSpeed[biome];
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
   * Cheapest reachable cell holding a structure of `code`, or -1.
   * @param {number} code
   * @returns {number}
   */
  nearestStructure(code) {
    let best = -1;
    const n = this.side * this.side;
    for (let i = 0; i < n; i++) {
      if (this.dist[i] === Infinity || this.structure[i] !== code) continue;
      if (best < 0 || this.dist[i] < this.dist[best]) best = i;
    }
    return best;
  }

  /**
   * True if a cell can take a new structure: passable, no resource, no structure.
   * @param {number} cell
   * @returns {boolean}
   */
  buildable(cell) {
    if (this.dist[cell] === Infinity || this.resource[cell] !== 0 || this.structure[cell] !== 0) {
      return false;
    }
    // The ring of an enclosure is kept for its wall.
    const x = this.cellX(cell);
    const y = this.cellY(cell);
    for (const c of this.colonies) if (c.onRing(x, y)) return false;
    return true;
  }

  /**
   * Waypoint towards (tx, ty) around the enclosures (docs/design/16-guerre-et-forteresses.md,
   * « Navigation avec obstacles »): the local search only sees the window, so a wall longer than
   * the window would trap it. Crossing a wall goes through a gate (to the tile just beyond), the
   * one that makes the shortest trip; from a side with no gate, along the wall to the corner
   * first; and a target on the far side of an enclosure is reached by its nearest corner.
   * Writes the waypoint in `wayX`, `wayY` (the target itself if no wall is in the way).
   * @param {number} tx
   * @param {number} ty
   * @returns {void}
   */
  detour(tx, ty) {
    const ax = this.cellX(this.center);
    const ay = this.cellY(this.center);
    this.wayX = tx;
    this.wayY = ty;
    for (const c of this.colonies) {
      if (c.encState === 0 || c.gatesBuilt === 0 || c.onRing(tx, ty)) continue;
      const inA = c.inside(ax, ay);
      const inT = c.inside(tx, ty);
      if (inA !== inT) {
        // Out through any gate; in through a gate on a side it stands before (or any, from the
        // ring itself).
        const any = inA || c.onRing(ax, ay);
        let best = -1;
        let bestD = Infinity;
        let near = -1;
        let nearD = Infinity;
        for (let i = 0; i < c.gateCount; i++) {
          if ((c.gatesBuilt & (1 << i)) === 0) continue;
          const gx = c.gateX[i];
          const gy = c.gateY[i];
          const d =
            Math.max(Math.abs(gx - ax), Math.abs(gy - ay)) +
            Math.max(Math.abs(gx - tx), Math.abs(gy - ty));
          if (d < nearD) {
            nearD = d;
            near = i;
          }
          if (!any && !this.facesGate(c, ax, ay, this.normalX(c, i), this.normalY(c, i))) continue;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0) {
          const side = inA ? 1 : -1;
          this.wayX = c.gateX[best] + side * this.normalX(c, best);
          this.wayY = c.gateY[best] + side * this.normalY(c, best);
        } else {
          this.toCorner(c, ax, ay, this.normalX(c, near), this.normalY(c, near));
        }
        return;
      }
      if (inA) continue;
      // Both outside: the enclosure stands between them along one axis.
      const acrossY = (ay < c.encY0 && ty > c.encY1) || (ay > c.encY1 && ty < c.encY0);
      const acrossX = (ax < c.encX0 && tx > c.encX1) || (ax > c.encX1 && tx < c.encX0);
      if (acrossY && ax >= c.encX0 && ax <= c.encX1) {
        this.wayX = ax - c.encX0 <= c.encX1 - ax ? c.encX0 - 1 : c.encX1 + 1;
        this.wayY = ay < c.encY0 ? c.encY0 - 1 : c.encY1 + 1;
        return;
      }
      if (acrossX && ay >= c.encY0 && ay <= c.encY1) {
        this.wayX = ax < c.encX0 ? c.encX0 - 1 : c.encX1 + 1;
        this.wayY = ay - c.encY0 <= c.encY1 - ay ? c.encY0 - 1 : c.encY1 + 1;
        return;
      }
    }
  }

  /**
   * Outward step of gate i, x part: -1 on the west side, 1 on the east side, else 0.
   * @param {{ encX0: number, encX1: number, gateX: Int32Array }} c
   * @param {number} i
   * @returns {number}
   */
  normalX(c, i) {
    return c.gateX[i] === c.encX0 ? -1 : c.gateX[i] === c.encX1 ? 1 : 0;
  }

  /**
   * Outward step of gate i, y part (0 for a gate on the west or east side).
   * @param {{ encX0: number, encX1: number, encY0: number, gateX: Int32Array,
   *   gateY: Int32Array }} c
   * @param {number} i
   * @returns {number}
   */
  normalY(c, i) {
    if (this.normalX(c, i) !== 0) return 0;
    return c.gateY[i] === c.encY0 ? -1 : 1;
  }

  /**
   * True if (x, y), outside the ring, lies beyond the side of the gate.
   * @param {{ encX0: number, encY0: number, encX1: number, encY1: number }} c
   * @param {number} x
   * @param {number} y
   * @param {number} nx
   * @param {number} ny
   * @returns {boolean}
   */
  facesGate(c, x, y, nx, ny) {
    if (nx < 0) return x < c.encX0;
    if (nx > 0) return x > c.encX1;
    if (ny < 0) return y < c.encY0;
    return y > c.encY1;
  }

  /**
   * Waypoint of an agent outside the ring, not facing the gate: the outer corner on its way to
   * the gate's side (along the wall it stands by).
   * @param {{ encX0: number, encY0: number, encX1: number, encY1: number }} c
   * @param {number} x
   * @param {number} y
   * @param {number} nx
   * @param {number} ny
   * @returns {void}
   */
  toCorner(c, x, y, nx, ny) {
    if (ny !== 0) {
      // Gate on the north or south side.
      const gy = ny < 0 ? c.encY0 - 1 : c.encY1 + 1;
      const backY = ny < 0 ? c.encY1 + 1 : c.encY0 - 1;
      const nearX = x - c.encX0 <= c.encX1 - x ? c.encX0 - 1 : c.encX1 + 1;
      if (x < c.encX0 || x > c.encX1) {
        this.wayX = x < c.encX0 ? c.encX0 - 1 : c.encX1 + 1;
        this.wayY = gy;
      } else {
        this.wayX = nearX;
        this.wayY = backY;
      }
      return;
    }
    const gx = nx < 0 ? c.encX0 - 1 : c.encX1 + 1;
    const backX = nx < 0 ? c.encX1 + 1 : c.encX0 - 1;
    const nearY = y - c.encY0 <= c.encY1 - y ? c.encY0 - 1 : c.encY1 + 1;
    if (y < c.encY0 || y > c.encY1) {
      this.wayX = gx;
      this.wayY = y < c.encY0 ? c.encY0 - 1 : c.encY1 + 1;
    } else {
      this.wayX = backX;
      this.wayY = nearY;
    }
  }

  /**
   * Reachable cell closest to a world target (beyond the window if need be), ties broken by
   * path cost. Returns -1 when no reachable cell is closer than where the agent stands.
   * @param {number} tx
   * @param {number} ty
   * @returns {number}
   */
  toward(tx, ty) {
    this.detour(tx, ty);
    return this.towardPoint(this.wayX, this.wayY);
  }

  /**
   * {@link Navigator#toward} without the detour around enclosures.
   * @param {number} tx
   * @param {number} ty
   * @returns {number}
   */
  towardPoint(tx, ty) {
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
