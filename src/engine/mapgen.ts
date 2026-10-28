/**
 * mapgen.ts
 * Seeded random map generator. The same seed always gives the same map.
 *
 * Generates hills, lakes, rivers and forests, then places towns (each with its own street
 * layout, size and building mix) and industries (placed by rules, e.g. power stations by
 * water, coal mines on high ground, farms and factories near towns).
 *
 * No imports. The returned MapData can be passed straight to terrain.ts functions,
 * and toEndpoints() feeds the AI in ai-competitor.ts.
 */

export const MAX_HEIGHT = 12;

export interface Pt { x: number; y: number }

export interface MapOptions {
  size: number;           // map is size x size tiles (default 126)
  towns: number;          // default 24
  lakes: number;          // 0..1, default 0.5
  hills: number;          // 0..1, default 0.5
  forests: number;        // 0..1, default 0.5
  rivers: number;         // number of rivers, default 2
  industryScale: number;  // 1 = default number of industries
}

const DEFAULTS: MapOptions = { size: 126, towns: 24, lakes: 0.5, hills: 0.5, forests: 0.5, rivers: 2, industryScale: 1 };

export type TownSize = "village" | "town" | "city";
export type BuildingKind = "house" | "shop" | "apartments" | "tower" | "church";
export type IndustryKind = "coalMine" | "powerStation" | "forest" | "sawmill" | "farm" | "factory" | "steelMill";

export interface Building { x: number; y: number; kind: BuildingKind; floors: number }

export interface TownSite {
  id: string;
  name: string;
  x: number;
  y: number;
  size: TownSize;
  style: "cross" | "linear" | "grid" | "organic";
  radius: number;
  baseHeight: number;
  population: number;
  roads: Pt[];
  buildings: Building[];
  // fields used by tycoon-core.ts
  activeStations: number;
  growthTimer: number;
  fundedBuildDaysLeft: number;
}

export interface IndustrySite {
  id: string;
  name: string;
  kind: IndustryKind;
  x: number;
  y: number;
  footprint: number;      // it covers a (2*footprint+1) square around x,y
  productionPerMonth: number;
  input: Record<string, number>;
  output: Record<string, number>;
}

export interface MapData {
  seed: string;
  w: number;
  h: number;
  height: Uint8Array;
  water: Uint8Array;
  forest: Uint8Array;
  occupied: Uint8Array;
  towns: TownSite[];
  industries: IndustrySite[];
}

// ------------------------------------------------------------------ random

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rng: () => number): (x: number, y: number) => number {
  const P = 256;
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = yi & 255, y1 = (yi + 1) & 255;
    const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) { sum += n(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ------------------------------------------------------------------- names

const BASE_NAMES = [
  "Oakwood", "Briarfield", "Westhaven", "Lakeside", "Pinebridge", "Fairford", "Greenford", "Northbridge",
  "Ashwell", "Silverlake", "Elmstead", "Riverton", "Hillcrest", "Meadowbrook", "Kingswood", "Redbank",
  "Clearwater", "Stonefield", "Eastmere", "Willowton", "Highgate", "Brookside", "Southport", "Woodhaven",
];
const PRE = ["Ash", "Bram", "Cold", "Dun", "Elm", "Fern", "Glen", "Holm", "Iron", "Kirk", "Long", "Marsh", "Nether", "Over", "Quar", "Rush", "Sand", "Thorn", "Upper", "Wyn"];
const SUF = ["ton", "ham", "bury", "ford", "wick", "stead", "by", "mouth", "field", "dale", "ley", "worth"];

function townNames(n: number, rng: () => number): string[] {
  const names = [BASE_NAMES[0], ...shuffle(BASE_NAMES.slice(1), rng)];
  const used = new Set(names);
  while (names.length < n) {
    const nm = PRE[Math.floor(rng() * PRE.length)] + SUF[Math.floor(rng() * SUF.length)];
    if (!used.has(nm)) { used.add(nm); names.push(nm); }
  }
  return names.slice(0, n);
}

// ---------------------------------------------------------------- generator

export function generateMap(seed: string = randomSeed(), options: Partial<MapOptions> = {}): MapData {
  const o: MapOptions = { ...DEFAULTS, ...options };
  const rng = mulberry32(hashSeed(seed));
  const W = o.size, H = o.size, N = W * H;
  const at = (x: number, y: number) => y * W + x;
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  const height = new Uint8Array(N);
  const water = new Uint8Array(N);
  const forest = new Uint8Array(N);
  const occupied = new Uint8Array(N);

  const enforceSlopes = () => {
    for (let pass = 0; pass < 400; pass++) {
      let changed = false;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = at(x, y);
          let mn = 255;
          for (const [dx, dy] of DIRS4) {
            if (inB(x + dx, y + dy)) mn = Math.min(mn, height[at(x + dx, y + dy)]);
          }
          if (height[i] > mn + 1) { height[i] = mn + 1; changed = true; }
        }
      }
      if (!changed) break;
    }
  };

  // 1. Hills -----------------------------------------------------------------
  const nElev = makeNoise(rng), nLake = makeNoise(rng), nForest = makeNoise(rng);
  const hillAmp = 2 + o.hills * 7;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fbm(nElev, x / 30, y / 30, 4);
      const e = Math.max(0, Math.min(1, (v - 0.47) / 0.28));
      height[at(x, y)] = Math.min(MAX_HEIGHT, Math.round(Math.pow(e, 1.3) * hillAmp));
    }
  }

  const rectStats = (x0: number, y0: number, x1: number, y1: number) => {
    let mn = 255, mx = 0, hasWater = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = at(x, y);
      if (water[i]) hasWater = true;
      mn = Math.min(mn, height[i]); mx = Math.max(mx, height[i]);
    }
    return { mn, mx, hasWater };
  };

  const flattenRect = (x0: number, y0: number, x1: number, y1: number, clearForest: boolean) => {
    const { mn } = rectStats(x0, y0, x1, y1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      height[at(x, y)] = mn;
      if (clearForest) forest[at(x, y)] = 0;
    }
  };

  // 1b. Choose town sites BEFORE water, so lakes and rivers keep clear of them ---
  const names = townNames(o.towns, rng);
  const sizes: TownSize[] = [];
  for (let i = 0; i < o.towns; i++) {
    const r = rng();
    sizes.push(i === 0 ? "town" : r < 0.12 ? "city" : r < 0.45 ? "town" : "village");
  }
  const radiusFor = (s: TownSize) => (s === "village" ? 5 : s === "town" ? 8 : 11) + Math.floor(rng() * 2);
  const radii = sizes.map(radiusFor);
  const protect = new Uint8Array(N);

  const sites: { x: number; y: number; r: number }[] = [];
  let minDist = Math.max(14, Math.round(0.65 * Math.sqrt(N / o.towns)));
  let fails = 0;
  for (let attempt = 0; sites.length < o.towns && attempt < 40000; attempt++) {
    const k = sites.length;
    // If this town can't find room, make it smaller, then let towns sit closer together.
    if (fails > 0 && fails % 1200 === 0) {
      if (sizes[k] === "city") { sizes[k] = "town"; radii[k] = radiusFor("town"); }
      else if (sizes[k] === "town") { sizes[k] = "village"; radii[k] = radiusFor("village"); }
      else minDist = Math.max(9, Math.round(minDist * 0.9));
    }
    fails++;
    const r = radii[k];
    const lo = r + 5;
    if (W - lo - 1 <= lo) break;
    const x = lo + Math.floor(rng() * (W - 2 * lo));
    const y = lo + Math.floor(rng() * (H - 2 * lo));
    if (sites.some(s => Math.hypot(s.x - x, s.y - y) < Math.max(minDist, s.r + r + 4))) continue;
    const st = rectStats(x - r - 2, y - r - 2, x + r + 2, y + r + 2);
    if (st.mx - st.mn > 4 || st.mn > 3) continue;
    sites.push({ x, y, r });
    fails = 0;
    flattenRect(x - r - 2, y - r - 2, x + r + 2, y + r + 2, false);
    for (let yy = y - r - 3; yy <= y + r + 3; yy++) for (let xx = x - r - 3; xx <= x + r + 3; xx++) {
      if (inB(xx, yy)) protect[at(xx, yy)] = 1;
    }
  }

  // 2. Lakes (only in low ground) -------------------------------------------
  const lakeVal = new Float32Array(N);
  const low: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      lakeVal[i] = fbm(nLake, x / 12 + 100, y / 12 + 100, 3);
      if (height[i] <= 2 && !protect[i]) low.push(lakeVal[i]);
    }
  }
  low.sort((a, b) => a - b);
  const frac = 0.08 + 0.28 * o.lakes;
  const thr = low.length ? low[Math.min(low.length - 1, Math.floor(frac * low.length))] : -1;
  for (let i = 0; i < N; i++) {
    if (height[i] <= 2 && !protect[i] && lakeVal[i] < thr) { water[i] = 1; height[i] = 0; }
  }

  // Remove tiny puddles
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (!water[s] || seen[s]) continue;
    const comp = [s]; seen[s] = 1;
    for (let q = 0; q < comp.length; q++) {
      const cx = comp[q] % W, cy = (comp[q] / W) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(nx, ny)) continue;
        const j = at(nx, ny);
        if (water[j] && !seen[j]) { seen[j] = 1; comp.push(j); }
      }
    }
    if (comp.length < 10) for (const j of comp) water[j] = 0;
  }

  // 3. Rivers ---------------------------------------------------------------
  for (let r = 0; r < o.rivers; r++) {
    const cands: number[] = [];
    for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
      const i = at(x, y);
      if (!water[i] && !protect[i] && height[i] <= 3) cands.push(i);
    }
    if (!cands.length) break;
    let cur = cands[Math.floor(rng() * cands.length)];
    const side = Math.floor(rng() * 4);
    const tx = side === 0 ? 0 : side === 1 ? W - 1 : Math.floor(rng() * W);
    const ty = side === 2 ? 0 : side === 3 ? H - 1 : Math.floor(rng() * H);
    const visited = new Set<number>([cur]);

    for (let step = 0; step < 500; step++) {
      const x = cur % W, y = (cur / W) | 0;
      water[cur] = 1; height[cur] = 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) break;

      let best = -1, bs = Infinity, joinsWater = false;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (!inB(nx, ny)) continue;
        const j = at(nx, ny);
        if (visited.has(j) || protect[j]) continue;
        if (water[j] && step > 3) { joinsWater = true; break; }
        const score = height[j] * 1.2 + rng() * 1.4 + (Math.abs(nx - tx) + Math.abs(ny - ty)) * 0.06;
        if (score < bs) { bs = score; best = j; }
      }
      if (joinsWater || best < 0) break;
      cur = best;
      visited.add(cur);
    }
  }

  enforceSlopes();

  // 4. Forests --------------------------------------------------------------
  const fvals: number[] = [];
  const fval = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y);
    fval[i] = fbm(nForest, x / 14 + 300, y / 14 + 300, 3);
    if (!water[i] && height[i] <= 6) fvals.push(fval[i]);
  }
  fvals.sort((a, b) => a - b);
  const fFrac = 0.06 + 0.24 * o.forests;
  const fThr = fvals.length ? fvals[Math.min(fvals.length - 1, Math.floor((1 - fFrac) * fvals.length))] : 2;
  for (let i = 0; i < N; i++) if (!water[i] && height[i] <= 6 && fval[i] >= fThr) forest[i] = 1;

  // Distance to nearest water
  const waterDist = new Int16Array(N).fill(999);
  const wq: number[] = [];
  for (let i = 0; i < N; i++) if (water[i]) { waterDist[i] = 0; wq.push(i); }
  for (let q = 0; q < wq.length; q++) {
    const i = wq[q], cx = i % W, cy = (i / W) | 0;
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const j = at(nx, ny);
      if (waterDist[j] > waterDist[i] + 1) { waterDist[j] = waterDist[i] + 1; wq.push(j); }
    }
  }

  // 6. Choose industry sites -------------------------------------------------
  const industries: IndustrySite[] = [];
  const nearestTown = (x: number, y: number) => {
    let best = -1, bd = Infinity;
    sites.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
    return { i: best, edge: best >= 0 ? bd - sites[best].r : 999 };
  };
  const nearestOf = (kind: IndustryKind, x: number, y: number) => {
    let bd = Infinity;
    for (const ind of industries) if (ind.kind === kind) bd = Math.min(bd, Math.hypot(ind.x - x, ind.y - y));
    return bd;
  };
  const forestDensity = (x: number, y: number, rad = 5) => {
    let c = 0, t = 0;
    for (let yy = y - rad; yy <= y + rad; yy++) for (let xx = x - rad; xx <= x + rad; xx++) {
      if (!inB(xx, yy)) continue;
      t++; if (forest[at(xx, yy)]) c++;
    }
    return t ? c / t : 0;
  };

  const LABEL: Record<IndustryKind, string> = {
    coalMine: "Coal Mine", powerStation: "Power Station", forest: "Lumber Camp", sawmill: "Sawmill",
    farm: "Farm", factory: "Factory", steelMill: "Steel Mill",
  };
  const PRIMARY: IndustryKind[] = ["coalMine", "forest", "farm"];
  const BASE_COUNT: Record<IndustryKind, number> = {
    coalMine: 3, powerStation: 2, forest: 3, sawmill: 2, farm: 4, factory: 2, steelMill: 1,
  };

  type ScoreFn = (x: number, y: number, ctx: { td: number; fd: number; wd: number; h: number }) => number | null;
  const SCORES: Record<IndustryKind, ScoreFn> = {
    coalMine:     (_x, _y, c) => c.td < 6 ? null : c.h * 2 + rng() * 2,
    powerStation: (_x, _y, c) => c.wd > 9 || c.td < 5 || c.td > 30 ? null : (10 - c.wd) + (c.td < 20 ? 3 : 0) + rng(),
    forest:       (_x, _y, c) => c.fd < 0.45 || c.td < 6 ? null : c.fd * 10 + rng(),
    sawmill:      (x, y, c) => {
      if (c.fd < 0.12 || c.fd > 0.6 || c.td < 6 || c.td > 30) return null;
      const lc = nearestOf("forest", x, y);
      if (lc !== Infinity && lc > 40) return null;
      return c.fd * 4 + (lc !== Infinity ? 5 : 0) + rng();
    },
    farm:         (_x, _y, c) => c.fd > 0.2 || c.td < 5 || c.td > 25 ? null : (25 - c.td) * 0.15 + rng(),
    factory:      (_x, _y, c) => c.td < 5 || c.td > 16 ? null : (16 - c.td) * 0.4 + rng(),
    steelMill:    (x, y, c) => {
      const cm = nearestOf("coalMine", x, y);
      if (cm < 15 || cm > 45 || c.td < 6) return null;
      return rng() + (c.wd < 12 ? 1 : 0);
    },
  };

  const kinds: IndustryKind[] = ["coalMine", "powerStation", "forest", "sawmill", "farm", "factory", "steelMill"];
  const nameCount = new Map<string, number>();
  for (const kind of kinds) {
    const count = Math.max(1, Math.round(BASE_COUNT[kind] * o.industryScale));
    for (let n = 0; n < count; n++) {
      if (kind === "steelMill" && !industries.some(i => i.kind === "coalMine")) break;
      let best: { x: number; y: number } | null = null, bestScore = -Infinity;
      for (let t = 0; t < 400; t++) {
        const x = 4 + Math.floor(rng() * (W - 8));
        const y = 4 + Math.floor(rng() * (H - 8));
        const st = rectStats(x - 2, y - 2, x + 2, y + 2);
        if (st.hasWater || st.mx - st.mn > 3) continue;
        if (industries.some(i => Math.hypot(i.x - x, i.y - y) < 8)) continue;
        const nt = nearestTown(x, y);
        if (nt.edge < 5) continue;
        const sc = SCORES[kind](x, y, { td: nt.edge, fd: forestDensity(x, y), wd: waterDist[at(x, y)], h: height[at(x, y)] });
        if (sc !== null && sc > bestScore) { bestScore = sc; best = { x, y }; }
      }
      if (!best) continue;

      flattenRect(best.x - 2, best.y - 2, best.x + 2, best.y + 2, true);
      const nt = nearestTown(best.x, best.y);
      const base = nt.i >= 0 ? names[nt.i] : "Valley";
      const label = LABEL[kind];
      const key = `${base} ${label}`;
      const k = (nameCount.get(key) ?? 0) + 1;
      nameCount.set(key, k);
      industries.push({
        id: `ind-${industries.length + 1}`,
        name: k > 1 ? `${key} ${k}` : key,
        kind, x: best.x, y: best.y, footprint: 1,
        productionPerMonth: PRIMARY.includes(kind) ? 30 + Math.floor(rng() * 61) : 6,
        input: {}, output: {},
      });
    }
  }

  enforceSlopes();

  // 7. Lay out towns on the final terrain ------------------------------------
  const towns: TownSite[] = sites.map((s, i) => {
    const t = layoutTown(rng, W, H, height, water, occupied, {
      id: `town-${i + 1}`, name: names[i], x: s.x, y: s.y, size: sizes[i], radius: s.r,
    });
    return t;
  });

  for (const ind of industries) {
    for (let y = ind.y - 1; y <= ind.y + 1; y++) for (let x = ind.x - 1; x <= ind.x + 1; x++) {
      occupied[at(x, y)] = 1; forest[at(x, y)] = 0;
    }
  }

  return { seed, w: W, h: H, height, water, forest, occupied, towns, industries };
}

// ------------------------------------------------------------- town layouts

function layoutTown(
  rng: () => number, W: number, H: number,
  height: Uint8Array, water: Uint8Array, occupied: Uint8Array,
  base: { id: string; name: string; x: number; y: number; size: TownSize; radius: number }
): TownSite {
  const { x: cx, y: cy, radius: r, size } = base;
  const baseHeight = height[cy * W + cx];
  const style = (["cross", "linear", "grid", "organic"] as const)[Math.floor(rng() * 4)];
  const flip = rng() < 0.5;

  const segs: [number, number, number, number][] = [];
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    segs.push(flip ? [cx + y0, cy + x0, cx + y1, cy + x1] : [cx + x0, cy + y0, cx + x1, cy + y1]);
  };
  const rr = (a: number, b: number) => a + rng() * (b - a);

  if (style === "cross") {
    seg(-Math.round(r * rr(0.6, 1)), 0, Math.round(r * rr(0.6, 1)), 0);
    seg(0, -Math.round(r * rr(0.6, 1)), 0, Math.round(r * rr(0.6, 1)));
    const extra = Math.floor(rng() * 3);
    for (let k = 0; k < extra; k++) {
      const off = (rng() < 0.5 ? -1 : 1) * (2 + Math.floor(rng() * Math.max(1, r - 2)));
      const a = Math.round(rr(2, r * 0.8)), b = Math.round(rr(2, r * 0.8));
      if (rng() < 0.5) seg(-a, off, b, off); else seg(off, -a, off, b);
    }
  } else if (style === "linear") {
    seg(-Math.round(r * 1.1), 0, Math.round(r * 1.1), 0);
    const stubs = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < stubs; k++) {
      const dx = -r + Math.floor(rng() * 2 * r);
      const len = 2 + Math.floor(rng() * 4);
      seg(dx, 0, dx, rng() < 0.5 ? -len : len);
    }
  } else if (style === "grid") {
    const s = 3 + Math.floor(rng() * 2);
    const n = Math.floor(r / s);
    for (let k = -n; k <= n; k++) {
      seg(-Math.round(r * rr(0.6, 1)), k * s, Math.round(r * rr(0.6, 1)), k * s);
      seg(k * s, -Math.round(r * rr(0.6, 1)), k * s, Math.round(r * rr(0.6, 1)));
    }
  } else {
    const nodes: Pt[] = [{ x: 0, y: 0 }];
    const branches = 6 + Math.floor(rng() * 5);
    for (let k = 0; k < branches; k++) {
      const from = nodes[Math.floor(rng() * nodes.length)];
      const len = 3 + Math.floor(rng() * 6);
      const sign = rng() < 0.5 ? -1 : 1;
      const end = rng() < 0.5 ? { x: from.x + sign * len, y: from.y } : { x: from.x, y: from.y + sign * len };
      if (flip) seg(from.y, from.x, end.y, end.x); else seg(from.x, from.y, end.x, end.y);
      nodes.push(end, { x: Math.round((from.x + end.x) / 2), y: Math.round((from.y + end.y) / 2) });
    }
  }

  // Segments are stored as absolute coordinates already (flip handled in seg()).
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x;
    return !water[i] && !occupied[i] && height[i] === baseHeight && Math.hypot(x - cx, y - cy) <= r + 0.5;
  };

  const roadSet = new Set<number>();
  const roads: Pt[] = [];
  for (const [x0, y0, x1, y1] of segs) {
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= len; k++) {
      const x = x0 + dx * k, y = y0 + dy * k;
      const i = y * W + x;
      if (ok(x, y) && !roadSet.has(i)) { roadSet.add(i); roads.push({ x, y }); }
    }
  }
  if (!roadSet.has(cy * W + cx) && ok(cx, cy)) { roadSet.add(cy * W + cx); roads.push({ x: cx, y: cy }); }

  const density = 0.55 + rng() * 0.4;
  const used = new Set<number>();
  const buildings: Building[] = [];
  for (const rd of roads) {
    for (const [dx, dy] of DIRS4) {
      const x = rd.x + dx, y = rd.y + dy;
      if (!ok(x, y)) continue;
      const i = y * W + x;
      if (roadSet.has(i) || used.has(i)) continue;
      const d = Math.hypot(x - cx, y - cy) / (r + 1);
      if (rng() >= density * (1.05 - 0.85 * d)) continue;

      let kind: BuildingKind = "house";
      let floors = 1 + Math.floor(rng() * 2);
      if (d < 0.3) {
        if (size === "city") { kind = rng() < 0.5 ? "tower" : "apartments"; floors = kind === "tower" ? 4 + Math.floor(rng() * 5) : 3 + Math.floor(rng() * 2); }
        else if (size === "town") { kind = rng() < 0.6 ? "shop" : "apartments"; floors = 2 + Math.floor(rng() * 2); }
        else if (rng() < 0.3) kind = "shop";
      } else if (d < 0.65) {
        if (size === "city" && rng() < 0.5) { kind = "apartments"; floors = 2 + Math.floor(rng() * 3); }
        else if (size !== "village" && rng() < 0.2) kind = "shop";
      }
      used.add(i);
      buildings.push({ x, y, kind, floors });
    }
  }

  // One church near the middle
  if (size !== "village" || rng() < 0.5) {
    const mid = buildings.filter(b => Math.hypot(b.x - cx, b.y - cy) / (r + 1) < 0.5 && b.kind !== "tower");
    if (mid.length) { const b = mid[Math.floor(rng() * mid.length)]; b.kind = "church"; b.floors = 1; }
  }

  for (const rd of roads) occupied[rd.y * W + rd.x] = 1;
  for (const b of buildings) occupied[b.y * W + b.x] = 1;

  const floorsTotal = buildings.reduce((s, b) => s + b.floors, 0);
  return {
    id: base.id, name: base.name, x: cx, y: cy, size, style, radius: r, baseHeight,
    population: Math.max(60, floorsTotal * 9),
    roads, buildings,
    activeStations: 0, growthTimer: 30 + Math.floor(rng() * 40), fundedBuildDaysLeft: 0,
  };
}

// ------------------------------------------------------------ new industries

const INDUSTRY_LABELS: Record<IndustryKind, string> = {
  coalMine: "Coal Mine", powerStation: "Power Station", forest: "Lumber Camp", sawmill: "Sawmill",
  farm: "Farm", factory: "Factory", steelMill: "Steel Mill",
};

/**
 * Open a new industry during play (e.g. when events.ts returns an "openIndustry" action).
 * Finds a flat 5 x 5 spot away from towns and other industries. Returns the new site, or null.
 * Pass `near` to keep it close to a point, e.g. a town.
 */
export function addIndustry(
  map: MapData, kind: IndustryKind, rng: () => number = Math.random, near?: Pt
): IndustrySite | null {
  const W = map.w, H = map.h;
  const at = (x: number, y: number) => y * W + x;
  const primary = kind === "coalMine" || kind === "forest" || kind === "farm";

  for (let t = 0; t < 600; t++) {
    const x = 4 + Math.floor(rng() * (W - 8));
    const y = 4 + Math.floor(rng() * (H - 8));
    if (near && Math.hypot(near.x - x, near.y - y) > 30) continue;
    if (map.towns.some(tw => Math.hypot(tw.x - x, tw.y - y) < tw.radius + 6)) continue;
    if (map.industries.some(i => Math.hypot(i.x - x, i.y - y) < 8)) continue;

    let bad = false, mn = 255, mx = 0, trees = 0;
    for (let yy = y - 2; yy <= y + 2 && !bad; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
      const i = at(xx, yy);
      if (map.water[i] || map.occupied[i]) { bad = true; break; }
      mn = Math.min(mn, map.height[i]); mx = Math.max(mx, map.height[i]);
      if (map.forest[i]) trees++;
    }
    if (bad || mx !== mn) continue;                      // must already be perfectly flat: no terraforming needed

    if (kind === "coalMine" && mn < 1 && t < 300) continue;       // prefer higher ground
    if (kind === "forest" && trees < 6 && t < 300) continue;      // prefer woods
    if (kind === "powerStation") {
      let nearWater = false;
      for (let yy = y - 8; yy <= y + 8 && !nearWater; yy++) for (let xx = x - 8; xx <= x + 8; xx++) {
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && map.water[at(xx, yy)]) { nearWater = true; break; }
      }
      if (!nearWater && t < 400) continue;
    }

    let bestTown = map.towns[0], bd = Infinity;
    for (const tw of map.towns) { const d = Math.hypot(tw.x - x, tw.y - y); if (d < bd) { bd = d; bestTown = tw; } }
    const base = `${bestTown ? bestTown.name : "Valley"} ${INDUSTRY_LABELS[kind]}`;
    const same = map.industries.filter(i => i.name === base || i.name.startsWith(base + " ")).length;
    const nextNum = map.industries.reduce((m, i) => Math.max(m, parseInt(i.id.replace("ind-", ""), 10) || 0), 0) + 1;

    const site: IndustrySite = {
      id: `ind-${nextNum}`, name: same ? `${base} ${same + 1}` : base, kind, x, y, footprint: 1,
      productionPerMonth: primary ? 30 + Math.floor(rng() * 61) : 6, input: {}, output: {},
    };
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
      map.occupied[at(xx, yy)] = 1; map.forest[at(xx, yy)] = 0;
    }
    map.industries.push(site);
    return site;
  }
  return null;
}

// ------------------------------------------------------------------ growth

/**
 * Add one house (or extend a street) to a town. Call when tickTownDay() in tycoon-core.ts
 * says the town should grow. Returns what was added so you can draw it, or null if full.
 */
export function growTown(
  map: MapData, townId: string, rng: () => number = Math.random
): { kind: "house" | "road"; x: number; y: number } | null {
  const t = map.towns.find(tt => tt.id === townId);
  if (!t || !t.roads.length) return null;
  const maxR = t.radius + Math.floor(t.population / 400) + 2;

  const free = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const i = y * map.w + x;
    return !map.water[i] && !map.occupied[i] && map.height[i] === t.baseHeight && Math.hypot(x - t.x, y - t.y) <= maxR;
  };

  for (let k = 0; k < 40; k++) {
    const rd = t.roads[Math.floor(rng() * t.roads.length)];
    const [dx, dy] = DIRS4[Math.floor(rng() * 4)];
    const x = rd.x + dx, y = rd.y + dy;
    if (!free(x, y)) continue;
    const i = y * map.w + x;
    map.occupied[i] = 1; map.forest[i] = 0;
    if (rng() < 0.8) {
      t.buildings.push({ x, y, kind: "house", floors: 1 });
      t.population += 9;
      return { kind: "house", x, y };
    }
    t.roads.push({ x, y });
    return { kind: "road", x, y };
  }
  return null;
}

// ------------------------------------------------------------ AI endpoints

export interface MapEndpoint {
  id: string; name: string; x: number; y: number;
  produces: string; monthlyUnits: number; accepts: string[];
}

/** Feed this to tickAiMonth() in ai-competitor.ts. */
export function toEndpoints(map: MapData): MapEndpoint[] {
  const out: MapEndpoint[] = map.towns.map(t => ({
    id: t.id, name: t.name, x: t.x, y: t.y,
    produces: "passengers", monthlyUnits: Math.floor(t.population / 8), accepts: ["passengers", "goods"],
  }));
  const spec: Record<IndustryKind, { produces: string; accepts: string[] }> = {
    coalMine:     { produces: "coal",  accepts: [] },
    powerStation: { produces: "coal",  accepts: ["coal"] },
    forest:       { produces: "wood",  accepts: [] },
    sawmill:      { produces: "goods", accepts: ["wood"] },
    farm:         { produces: "grain", accepts: [] },
    factory:      { produces: "goods", accepts: ["grain"] },
    steelMill:    { produces: "steel", accepts: ["coal"] },
  };
  for (const i of map.industries) {
    const s = spec[i.kind];
    const primary = i.kind === "coalMine" || i.kind === "forest" || i.kind === "farm";
    out.push({
      id: i.id, name: i.name, x: i.x, y: i.y,
      produces: s.produces, monthlyUnits: primary ? i.productionPerMonth : 0, accepts: s.accepts,
    });
  }
  return out;
}

/*
 * HOW TO USE
 *
 *   const map = generateMap("K3F9QZ");           // same seed = same map
 *   const map2 = generateMap(randomSeed(), { towns: 20, lakes: 0.7, hills: 0.3 });
 *
 *   map.height / map.water / map.forest    -> draw the terrain
 *   map.towns[i].roads / .buildings        -> draw each town (every town is different)
 *   map.industries                         -> draw the industries
 *
 *   map is also a valid Terrain for terrain.ts (raiseTile, findBridge, ...).
 *   When tickTownDay() returns 1:  const added = growTown(map, town.id);
 *   For the AI:                    const endpoints = toEndpoints(map);
 */
