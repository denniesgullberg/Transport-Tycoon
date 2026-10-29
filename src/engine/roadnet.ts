/**
 * roadnet.ts
 * Road network for buses and trucks: finds routes with A*, answers "is there a route?",
 * makes vehicles queue behind each other, and gives a slope speed factor.
 * No imports.
 */

export interface Pt { x: number; y: number }

const STRIDE = 4096;
const num = (x: number, y: number) => y * STRIDE + x;
const pt = (n: number): Pt => ({ x: n % STRIDE, y: Math.floor(n / STRIDE) });
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class MinHeap {
  private a: { id: number; p: number }[] = [];
  size() { return this.a.length; }
  push(id: number, p: number) {
    const a = this.a; a.push({ id, p });
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (a[par].p <= a[i].p) break;
      [a[par], a[i]] = [a[i], a[par]]; i = par;
    }
  }
  pop(): number | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0].id, last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

interface CachedPath { version: number; dest: number; path: number[]; i: number }

export class RoadNetwork {
  private roads = new Set<number>();
  private version = 0;
  private comp = new Map<number, number>();
  private compVersion = -1;
  private occ = new Map<number, Set<string>>();
  private cache = new Map<string, CachedPath>();
  private heightAt?: (x: number, y: number) => number;
  /** How many vehicles fit on one road tile before the next one has to wait. */
  laneCapacity: number;
  /** Extra cost of a bend when finding a route (0 lets a route zigzag freely, as ships on open water do). */
  turnCost = 0.35;
  /** Optional rule for one-way roads: return false to forbid stepping from a to b. */
  stepOk?: (a: Pt, b: Pt) => boolean;

  constructor(heightAt?: (x: number, y: number) => number, laneCapacity = 2) {
    this.heightAt = heightAt;
    this.laneCapacity = laneCapacity;
  }

  // ------------------------------------------------------------- building

  addRoad(x: number, y: number): void {
    const n = num(x, y);
    if (!this.roads.has(n)) { this.roads.add(n); this.version++; }
  }

  removeRoad(x: number, y: number): void {
    if (this.roads.delete(num(x, y))) this.version++;
  }

  hasRoad(x: number, y: number): boolean { return this.roads.has(num(x, y)); }

  /** Call after changing stepOk rules so cached routes are recalculated. */
  invalidate(): void { this.version++; }

  /** All road tiles, e.g. for saving the game. */
  tiles(): Pt[] { return Array.from(this.roads, pt); }

  /** Closest road tile within maxR tiles, for snapping a bus stop or depot onto the network. */
  nearestRoad(x: number, y: number, maxR = 4): Pt | null {
    let best: Pt | null = null, bd = Infinity;
    for (let dy = -maxR; dy <= maxR; dy++) for (let dx = -maxR; dx <= maxR; dx++) {
      if (!this.roads.has(num(x + dx, y + dy))) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; }
    }
    return best;
  }

  // ----------------------------------------------------------- connectivity

  private rebuildComponents(): void {
    if (this.compVersion === this.version) return;
    this.comp.clear();
    let id = 0;
    for (const start of this.roads) {
      if (this.comp.has(start)) continue;
      this.comp.set(start, id);
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        const p = pt(cur);
        for (const [dx, dy] of DIRS) {
          const nn = num(p.x + dx, p.y + dy);
          if (this.roads.has(nn) && !this.comp.has(nn)) { this.comp.set(nn, id); stack.push(nn); }
        }
      }
      id++;
    }
    this.compVersion = this.version;
  }

  /** Fast check: is there any road route between two tiles? Use it to warn "no route". */
  connected(a: Pt, b: Pt): boolean {
    this.rebuildComponents();
    const ca = this.comp.get(num(a.x, a.y)), cb = this.comp.get(num(b.x, b.y));
    return ca !== undefined && ca === cb;
  }

  // ------------------------------------------------------------ pathfinding

  private stepCost(from: number, to: number): number {
    if (!this.heightAt) return 1;
    const a = pt(from), b = pt(to);
    const d = this.heightAt(b.x, b.y) - this.heightAt(a.x, a.y);
    return d > 0 ? 1 + d * 0.6 : 1;     // prefer flatter routes
  }

  /**
   * Shortest route including both ends, or null. Each turn costs a little extra, so of two
   * routes the same length the one with fewer bends wins and vehicles do not zigzag.
   */
  findPath(a: Pt, b: Pt, maxNodes = 60000): Pt[] | null {
    const s = num(a.x, a.y), goal = num(b.x, b.y);
    if (!this.roads.has(s) || !this.roads.has(goal)) return null;
    if (!this.connected(a, b)) return null;
    if (s === goal) return [a];
    const TURN = this.turnCost;
    // a search state is a tile plus the direction we arrived in (4 = start)
    const key = (n: number, d: number) => n * 5 + d;
    const g = new Map<number, number>([[key(s, 4), 0]]);
    const prev = new Map<number, number>();
    const closed = new Set<number>();
    const heap = new MinHeap();
    heap.push(key(s, 4), Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    let n = 0, end = -1;
    while (heap.size() && n++ < maxNodes) {
      const cur = heap.pop()!;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const tile = Math.floor(cur / 5), din = cur % 5;
      if (tile === goal) { end = cur; break; }
      const p = pt(tile);
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d];
        const nn = num(p.x + dx, p.y + dy);
        if (!this.roads.has(nn)) continue;
        if (this.stepOk && !this.stepOk(p, pt(nn))) continue;
        const nk = key(nn, d);
        const ng = g.get(cur)! + this.stepCost(tile, nn) + (din !== 4 && din !== d ? TURN : 0);
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng); prev.set(nk, cur);
          heap.push(nk, ng + Math.abs(p.x + dx - b.x) + Math.abs(p.y + dy - b.y));
        }
      }
    }
    if (end < 0) return null;
    const out: number[] = [];
    for (let c = end; c !== undefined; c = prev.get(c)!) { out.push(Math.floor(c / 5)); if (c === key(s, 4)) break; }
    return out.reverse().map(pt);
  }

  /** The tile k steps further along this vehicle's planned route, or null. */
  peek(vehicleId: string, k = 1): Pt | null {
    const c = this.cache.get(vehicleId); if (!c || c.version !== this.version) return null;
    const n = c.path[c.i + k]; return n === undefined ? null : pt(n);
  }

  // ----------------------------------------------------------------- driving

  /**
   * The next tile this vehicle should enter on its way to `dest`, or null if it has arrived
   * or there is no route. Paths are cached per vehicle and rebuilt when roads change.
   */
  nextTile(vehicleId: string, from: Pt, dest: Pt): Pt | null {
    const f = num(from.x, from.y), d = num(dest.x, dest.y);
    if (f === d) return null;
    let c = this.cache.get(vehicleId);
    if (!c || c.version !== this.version || c.dest !== d || c.path[c.i] !== f) {
      const p = this.findPath(from, dest);
      if (!p) { this.cache.delete(vehicleId); return null; }
      c = { version: this.version, dest: d, path: p.map(q => num(q.x, q.y)), i: 0 };
      this.cache.set(vehicleId, c);
    }
    const nx = c.path[c.i + 1];
    return nx === undefined ? null : pt(nx);
  }

  /** Can this vehicle enter the tile, or is the road ahead full (a queue or a broken-down vehicle)? */
  canEnter(vehicleId: string, tile: Pt): boolean {
    const o = this.occ.get(num(tile.x, tile.y));
    return !o || o.has(vehicleId) || o.size < this.laneCapacity;
  }

  /** Call after the vehicle has actually moved. */
  moveVehicle(vehicleId: string, from: Pt | null, to: Pt): void {
    if (from) {
      const fo = this.occ.get(num(from.x, from.y));
      if (fo) { fo.delete(vehicleId); if (!fo.size) this.occ.delete(num(from.x, from.y)); }
    }
    const k = num(to.x, to.y);
    if (!this.occ.has(k)) this.occ.set(k, new Set());
    this.occ.get(k)!.add(vehicleId);
    const c = this.cache.get(vehicleId);
    if (c && c.path[c.i + 1] === k) c.i++;
  }

  removeVehicle(vehicleId: string): void {
    for (const [k, set] of this.occ) { set.delete(vehicleId); if (!set.size) this.occ.delete(k); }
    this.cache.delete(vehicleId);
  }

  vehiclesAt(tile: Pt): string[] {
    return Array.from(this.occ.get(num(tile.x, tile.y)) ?? []);
  }

  /** Speed multiplier for going from tile a to tile b (hills slow vehicles down). */
  speedFactor(a: Pt, b: Pt, kind: "road" | "steam" | "diesel" | "electric" = "road"): number {
    if (!this.heightAt) return 1;
    const d = this.heightAt(b.x, b.y) - this.heightAt(a.x, a.y);
    if (d <= 0) return 1;
    const f = { road: 0.7, steam: 0.55, diesel: 0.75, electric: 0.9 }[kind];
    return f;
  }
}

/*
 * HOW TO USE
 *
 *   const roads = new RoadNetwork((x, y) => map.height[y * map.w + x]);
 *   roads.addRoad(x, y);                         // when the player builds a road tile
 *   roads.removeRoad(x, y);                      // when demolished
 *
 *   // Placing a bus stop: snap it to a road
 *   const spot = roads.nearestRoad(clickX, clickY);
 *   if (!spot) toast("Build a road first.");
 *
 *   // Validating a route before buying a bus:
 *   if (!roads.connected(stopA, stopB)) toast("These stops are not connected by road.");
 *
 *   // Each move step for a bus:
 *   const next = roads.nextTile(bus.id, bus.tile, destinationTile);
 *   if (next && roads.canEnter(bus.id, next)) {
 *     roads.moveVehicle(bus.id, bus.tile, next);
 *     bus.tile = next;
 *   }                                             // otherwise it waits in the queue
 */
