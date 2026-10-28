/**
 * terrain.ts
 * Terraforming, slope rules, bridges and tunnels.
 *
 * Uses one height per tile (simple). Rule: neighbouring tiles may differ by at most 1,
 * so raising or lowering one tile pulls its neighbours along and leaves smooth slopes.
 */

export interface Terrain {
  w: number;
  h: number;
  height: Uint8Array;    // 0 .. MAX_HEIGHT
  water: Uint8Array;     // 1 = water tile (height is 0)
  occupied: Uint8Array;  // 1 = something is built here (track, road, station, building)
}

export const MAX_HEIGHT = 12;
const TILE_COST = 250;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const idx = (t: Terrain, x: number, y: number) => y * t.w + x;
export const inBounds = (t: Terrain, x: number, y: number) => x >= 0 && y >= 0 && x < t.w && y < t.h;

export function createTerrain(w: number, h: number): Terrain {
  return {
    w, h,
    height: new Uint8Array(w * h),
    water: new Uint8Array(w * h),
    occupied: new Uint8Array(w * h),
  };
}

export interface Result { ok: boolean; cost: number; reason?: string }
const fail = (reason: string): Result => ({ ok: false, cost: 0, reason });

// --------------------------------------------------------------- planning

/** Spread slope limits outward from the changed tiles. Returns every tile that must change. */
function plan(t: Terrain, seeds: Map<number, number>): Map<number, number> | string {
  const planned = new Map(seeds);
  const get = (i: number) => planned.get(i) ?? t.height[i];
  const queue = [...seeds.keys()];
  let guard = t.w * t.h * 8;

  while (queue.length) {
    if (guard-- <= 0) return "Slope too steep";
    const i = queue.pop()!;
    const x = i % t.w, y = (i / t.w) | 0;
    const n = get(i);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(t, nx, ny)) continue;
      const j = idx(t, nx, ny);
      if (seeds.has(j)) continue;
      const nh = get(j);
      if (nh > n + 1) { planned.set(j, n + 1); queue.push(j); }
      else if (nh < n - 1) { planned.set(j, n - 1); queue.push(j); }
    }
  }

  // Final check that every changed tile fits with all of its neighbours
  for (const [i, v] of planned) {
    const x = i % t.w, y = (i / t.w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(t, nx, ny)) continue;
      if (Math.abs(get(idx(t, nx, ny)) - v) > 1) return "Slope too steep";
    }
  }
  return planned;
}

function commit(t: Terrain, changes: Map<number, number>, inflation: number): Result {
  for (const i of changes.keys()) {
    if (t.occupied[i]) return fail("Something is built here");
  }
  let n = 0;
  for (const [i, v] of changes) {
    if (t.height[i] !== v) n++;
    t.height[i] = v;
    if (v > 0) t.water[i] = 0;
  }
  return { ok: true, cost: Math.round(n * TILE_COST * inflation) };
}

// ------------------------------------------------------------- operations

export function raiseTile(t: Terrain, x: number, y: number, inflation = 1): Result {
  if (!inBounds(t, x, y)) return fail("Out of bounds");
  const i = idx(t, x, y);
  if (t.occupied[i]) return fail("Something is built here");

  // Reclaim sea: water becomes land at sea level
  if (t.water[i]) {
    t.water[i] = 0;
    return { ok: true, cost: Math.round(TILE_COST * inflation) };
  }
  if (t.height[i] >= MAX_HEIGHT) return fail("Maximum height reached");

  const p = plan(t, new Map([[i, t.height[i] + 1]]));
  if (typeof p === "string") return fail(p);
  return commit(t, p, inflation);
}

export function lowerTile(t: Terrain, x: number, y: number, inflation = 1): Result {
  if (!inBounds(t, x, y)) return fail("Out of bounds");
  const i = idx(t, x, y);
  if (t.occupied[i]) return fail("Something is built here");
  if (t.water[i]) return fail("Already water");

  // Dig out sea level land to make water
  if (t.height[i] === 0) {
    t.water[i] = 1;
    return { ok: true, cost: Math.round(TILE_COST * inflation) };
  }
  const p = plan(t, new Map([[i, t.height[i] - 1]]));
  if (typeof p === "string") return fail(p);
  return commit(t, p, inflation);
}

/** Drag-select a rectangle and flatten it to one height. */
export function levelArea(
  t: Terrain, x0: number, y0: number, x1: number, y1: number, target: number, inflation = 1
): Result {
  const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
  const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
  const goal = Math.max(0, Math.min(MAX_HEIGHT, target));
  const seeds = new Map<number, number>();
  for (let y = lo.y; y <= hi.y; y++) {
    for (let x = lo.x; x <= hi.x; x++) {
      if (!inBounds(t, x, y)) return fail("Out of bounds");
      const i = idx(t, x, y);
      if (t.water[i]) return fail("Cannot level water");
      seeds.set(i, goal);
    }
  }
  const p = plan(t, seeds);
  if (typeof p === "string") return fail(p);
  return commit(t, p, inflation);
}

// ------------------------------------------------------------- slope rules

export function canBuildTrack(t: Terrain, x: number, y: number): boolean {
  if (!inBounds(t, x, y)) return false;
  const i = idx(t, x, y);
  return !t.water[i] && !t.occupied[i];
}

/** Height difference moving from tile a to tile b. Positive = uphill. */
export function gradient(t: Terrain, ax: number, ay: number, bx: number, by: number): number {
  return t.height[idx(t, bx, by)] - t.height[idx(t, ax, ay)];
}

export type TractionKind = "steam" | "diesel" | "electric" | "road";

/** Multiply vehicle speed by this when climbing. Downhill is not penalised. */
export function slopeSpeedFactor(delta: number, kind: TractionKind): number {
  if (delta <= 0) return 1;
  const uphill: Record<TractionKind, number> = { steam: 0.55, diesel: 0.75, electric: 0.9, road: 0.7 };
  return uphill[kind];
}

// -------------------------------------------------------- bridges / tunnels

export interface Span {
  kind: "bridge" | "tunnel";
  endX: number;
  endY: number;
  length: number;   // tiles between the two ends
  cost: number;
}

/**
 * Start from the last buildable tile (x,y) and look in direction (dx,dy).
 * A bridge crosses water or lower ground and lands at the SAME height on the far side.
 */
export function findBridge(
  t: Terrain, x: number, y: number, dx: number, dy: number, maxLen = 10, inflation = 1
): Span | null {
  if (!inBounds(t, x, y)) return null;
  const h0 = t.height[idx(t, x, y)];

  for (let i = 1; i <= maxLen + 1; i++) {
    const nx = x + dx * i, ny = y + dy * i;
    if (!inBounds(t, nx, ny)) return null;
    const j = idx(t, nx, ny);
    const isGap = t.water[j] === 1 || t.height[j] < h0;

    if (isGap) {
      if (t.occupied[j]) return null;
      continue;
    }
    if (i === 1) return null;                         // nothing to cross
    if (t.height[j] !== h0 || t.occupied[j]) return null;
    const length = i - 1;
    return { kind: "bridge", endX: nx, endY: ny, length, cost: Math.round((2000 + 900 * length) * inflation) };
  }
  return null;
}

/** A tunnel goes through a hill and comes out at the same height on the other side. */
export function findTunnel(
  t: Terrain, x: number, y: number, dx: number, dy: number, maxLen = 12, inflation = 1
): Span | null {
  if (!inBounds(t, x, y)) return null;
  const h0 = t.height[idx(t, x, y)];

  for (let i = 1; i <= maxLen + 1; i++) {
    const nx = x + dx * i, ny = y + dy * i;
    if (!inBounds(t, nx, ny)) return null;
    const j = idx(t, nx, ny);
    if (t.water[j]) return null;

    if (t.height[j] > h0) continue;                   // still inside the hill
    if (i === 1) return null;                         // not a hill
    if (t.height[j] !== h0 || t.occupied[j]) return null;
    const length = i - 1;
    return { kind: "tunnel", endX: nx, endY: ny, length, cost: Math.round((3000 + 1400 * length) * inflation) };
  }
  return null;
}

/** Try bridge first, then tunnel, in each of the 4 directions from a track end. */
export function findCrossing(t: Terrain, x: number, y: number, inflation = 1): Span[] {
  const out: Span[] = [];
  for (const [dx, dy] of DIRS) {
    const s = findBridge(t, x, y, dx, dy, 10, inflation) ?? findTunnel(t, x, y, dx, dy, 12, inflation);
    if (s) out.push(s);
  }
  return out;
}

/*
 * HOW TO USE
 *
 *   Build a Terrain from your existing map data (copy heights, set water=1 on lakes,
 *   set occupied=1 wherever you have roads, track, stations or buildings).
 *
 *   Toolbar "Raise land" click  ->  const r = raiseTile(terrain, x, y, inflation);
 *                                   if (r.ok) cash -= r.cost; else toast(r.reason);
 *
 *   When the player drags track to a tile that isn't buildable, call findCrossing(...)
 *   from the last valid tile and offer the returned bridge or tunnel with its cost.
 *
 *   In vehicle movement: speed *= slopeSpeedFactor(gradient(terrain, a, b), "steam").
 */
