/**
 * ai-competitor.ts
 * A simple computer-controlled transport company.
 *
 * It picks profitable town/industry pairs, finds a cheap path with A*, builds a road
 * and two stations, buys vehicles, then adds more vehicles on routes that earn well.
 * Needs tycoon-core.ts in the same folder.
 */

import { deliveryIncome, availableModels } from "./tycoon-core";
import type { CargoId } from "./tycoon-core";

export interface Pt { x: number; y: number }

export interface Endpoint {
  id: string;
  name: string;
  x: number;
  y: number;
  produces: CargoId;
  monthlyUnits: number;
  accepts: CargoId[];
}

/** Hook these up to your real game functions. Return null on failure. */
export interface GameApi {
  width: number;
  height: number;
  /** Cost to build a road on this tile, or null if it can't be built (water, cliff, building). */
  tileCost(x: number, y: number): number | null;
  /** Build road along the path. Return total cost, or null if it failed. */
  buildRoad(owner: string, path: Pt[]): number | null;
  /** Build a station. Return the new station id and its cost. */
  buildStation(owner: string, x: number, y: number): { id: string; cost: number } | null;
  /** Buy and start a vehicle. Return its price, or null if it failed. */
  buyVehicle(owner: string, modelId: string, fromStation: string, toStation: string): number | null;
}

export interface AiRoute {
  id: string;
  fromId: string;
  toId: string;
  fromStation: string;
  toStation: string;
  cargo: CargoId;
  vehicles: number;
  monthProfit: number;
  modelId: string;
}

export interface AiCompany {
  id: string;
  name: string;
  cash: number;
  aggression: number;     // 0 (cautious) .. 1 (expands fast)
  routes: AiRoute[];
  cooldown: number;       // months until it plans another route
  failed: Set<string>;    // pairs that couldn't be built
  bankrupt: boolean;
}

export const AI_NAMES = ["Hartley Haulage", "Northern Star Lines", "Brindle & Sons", "Crown Carriers", "Vale Express"];

export function createAi(index: number, startCash = 85000, aggression = 0.5): AiCompany {
  return {
    id: `ai-${index}`,
    name: AI_NAMES[index % AI_NAMES.length],
    cash: startCash,
    aggression,
    routes: [],
    cooldown: 1 + index,
    failed: new Set(),
    bankrupt: false,
  };
}

/** Your game calls this whenever one of the AI's vehicles delivers cargo. */
export function recordIncome(ai: AiCompany, routeId: string, amount: number): void {
  ai.cash += amount;
  const r = ai.routes.find(x => x.id === routeId);
  if (r) r.monthProfit += amount;
}

// ------------------------------------------------------------------ pathfinding

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

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function findPath(api: GameApi, from: Pt, to: Pt, maxExpansions = 30000): Pt[] | null {
  const W = api.width;
  const id = (x: number, y: number) => y * W + x;
  const s = id(from.x, from.y), goal = id(to.x, to.y);
  const g = new Map<number, number>([[s, 0]]);
  const prev = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new MinHeap();
  heap.push(s, Math.abs(from.x - to.x) + Math.abs(from.y - to.y));

  let n = 0;
  while (heap.size() && n++ < maxExpansions) {
    const cur = heap.pop()!;
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (cur === goal) break;

    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= api.width || ny >= api.height) continue;
      const cost = api.tileCost(nx, ny);
      if (cost === null) continue;
      const j = id(nx, ny);
      const ng = g.get(cur)! + cost;
      if (ng < (g.get(j) ?? Infinity)) {
        g.set(j, ng);
        prev.set(j, cur);
        heap.push(j, ng + Math.abs(nx - to.x) + Math.abs(ny - to.y));
      }
    }
  }

  if (s !== goal && !prev.has(goal)) return null;
  const path: Pt[] = [];
  for (let c: number | undefined = goal; c !== undefined; c = prev.get(c)) {
    path.push({ x: c % W, y: (c / W) | 0 });
    if (c === s) break;
  }
  return path.reverse();
}

// --------------------------------------------------------------------- planning

interface Plan { a: Endpoint; b: Endpoint; cargo: CargoId; dist: number; score: number; estRoadCost: number }

function pickModel(cargo: CargoId, year: number, budget: number): string | null {
  const type = cargo === "passengers" ? "bus" : "truck";
  const options = availableModels(year, type).filter(m => m.cargo === cargo && m.price <= budget);
  if (!options.length) return null;
  options.sort((p, q) => q.speedKmh * q.capacity - p.speedKmh * p.capacity);
  return options[0].id;
}

function planBestRoute(ai: AiCompany, ends: Endpoint[], year: number, rng: () => number): Plan | null {
  if (ends.length < 2) return null;
  const used = new Set(ai.routes.map(r => `${r.fromId}>${r.toId}`));
  let best: Plan | null = null;

  for (let tries = 0; tries < 80; tries++) {
    const a = ends[Math.floor(rng() * ends.length)];
    const b = ends[Math.floor(rng() * ends.length)];
    if (a.id === b.id || a.monthlyUnits <= 0 || !b.accepts.includes(a.produces)) continue;
    const key = `${a.id}>${b.id}`;
    if (used.has(key) || ai.failed.has(key)) continue;

    const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (dist < 10 || dist > 50) continue;

    const days = dist / 1.2;
    const loads = Math.min(a.monthlyUnits, 400);
    let monthly = deliveryIncome(a.produces, loads, a, b, days);
    if (a.produces === "passengers" || a.produces === "mail") monthly *= 2; // loaded both ways

    const estRoadCost = dist * 700 + 1500;
    if (estRoadCost > ai.cash * 0.75) continue;

    const score = (monthly * 12) / (estRoadCost + 5000);
    if (!best || score > best.score) best = { a, b, cargo: a.produces, dist, score, estRoadCost };
  }
  return best;
}

// ------------------------------------------------------------------- monthly tick

/** Call once per game month for each AI company. */
export function tickAiMonth(
  ai: AiCompany, api: GameApi, ends: Endpoint[], year: number, rng: () => number = Math.random
): string[] {
  const log: string[] = [];
  if (ai.bankrupt) return log;

  if (ai.cash < -20000) {
    ai.bankrupt = true;
    log.push(`${ai.name} has gone bankrupt.`);
    return log;
  }

  const maxVehicles = Math.round(3 + ai.aggression * 6);
  const maxRoutes = Math.round(2 + ai.aggression * 8);

  // 1. Grow routes that earn well
  for (const r of ai.routes) {
    if (r.vehicles < maxVehicles && r.monthProfit > 1200 + r.vehicles * 300) {
      const price = api.buyVehicle(ai.id, r.modelId, r.fromStation, r.toStation);
      if (price !== null && price <= ai.cash) { ai.cash -= price; r.vehicles++; }
    }
    r.monthProfit = 0;
  }

  // 2. Plan a new route
  ai.cooldown--;
  if (ai.cooldown > 0 || ai.routes.length >= maxRoutes || ai.cash < 15000) return log;
  ai.cooldown = 2 + Math.round((1 - ai.aggression) * 6);

  const plan = planBestRoute(ai, ends, year, rng);
  if (!plan) return log;
  const key = `${plan.a.id}>${plan.b.id}`;

  const path = findPath(api, plan.a, plan.b);
  if (!path) { ai.failed.add(key); return log; }

  const modelId = pickModel(plan.cargo, year, ai.cash * 0.3);
  if (!modelId) return log;

  const roadCost = api.buildRoad(ai.id, path);
  if (roadCost === null) { ai.failed.add(key); return log; }
  ai.cash -= roadCost;

  const s1 = api.buildStation(ai.id, plan.a.x, plan.a.y);
  const s2 = api.buildStation(ai.id, plan.b.x, plan.b.y);
  if (!s1 || !s2) { ai.failed.add(key); return log; }
  ai.cash -= s1.cost + s2.cost;

  const route: AiRoute = {
    id: `${ai.id}-r${ai.routes.length + 1}`,
    fromId: plan.a.id, toId: plan.b.id,
    fromStation: s1.id, toStation: s2.id,
    cargo: plan.cargo, vehicles: 0, monthProfit: 0, modelId,
  };

  for (let i = 0; i < 2; i++) {
    const price = api.buyVehicle(ai.id, modelId, s1.id, s2.id);
    if (price !== null && price <= ai.cash) { ai.cash -= price; route.vehicles++; }
  }
  ai.routes.push(route);
  log.push(`${ai.name} opened a new ${plan.cargo} service from ${plan.a.name} to ${plan.b.name}.`);
  return log;
}

/*
 * HOW TO USE
 *
 *   const rivals = [createAi(0, 85000, 0.4), createAi(1, 85000, 0.7)];
 *
 *   // each game month:
 *   for (const ai of rivals) {
 *     const news = tickAiMonth(ai, gameApi, endpoints, world.date.year);
 *     news.forEach(showNewsItem);
 *   }
 *
 *   // when an AI vehicle delivers:
 *   recordIncome(ai, routeId, income);
 *
 * Endpoints: build one per town (produces "passengers", accepts ["passengers"]) and one
 * per industry (e.g. coal mine produces "coal", power station accepts ["coal"]).
 */
