/**
 * stations.ts
 * Station catchment areas and cargo supply, like Transport Tycoon:
 *  - a station only collects from houses and industries inside its catchment square
 *  - cargo is split between nearby stations by rating
 *  - the rating depends on pickup frequency, waiting cargo, vehicle speed and age
 *
 * Needs tycoon-core.ts in the same folder (uses stationRating and deliveryIncome).
 */

import { stationRating, deliveryIncome } from "./tycoon-core";
import type { StationState } from "./tycoon-core";

export interface Pt { x: number; y: number }

export type StationKind = "busStop" | "truckStop" | "trainStation";

/** Catchment radius in tiles. A radius of 3 covers a 7 x 7 square. */
export const CATCHMENT: Record<StationKind, number> = { busStop: 3, truckStop: 3, trainStation: 4 };

export interface Station {
  id: string;
  name: string;
  kind: StationKind;
  x: number;
  y: number;
  waiting: Record<string, number>;
  daysSincePickup: Record<string, number>;
  lastSpeedKmh: number;
  lastAgeYears: number;
  /** Cargo kinds this station has had a pickup for. Only those cargoes get supplied. */
  served: Record<string, boolean>;
}

export function newStation(id: string, name: string, kind: StationKind, x: number, y: number): Station {
  return { id, name, kind, x, y, waiting: {}, daysSincePickup: {}, lastSpeedKmh: 0, lastAgeYears: 10, served: {} };
}

// ------------------------------------------------------------- catchment

export function covers(s: Station, x: number, y: number): boolean {
  const r = CATCHMENT[s.kind];
  return Math.abs(x - s.x) <= r && Math.abs(y - s.y) <= r;
}

/** Tiles to highlight when the player hovers or builds a station. */
export function catchmentTiles(s: Station, mapW: number, mapH: number): Pt[] {
  const r = CATCHMENT[s.kind];
  const out: Pt[] = [];
  for (let y = Math.max(0, s.y - r); y <= Math.min(mapH - 1, s.y + r); y++) {
    for (let x = Math.max(0, s.x - r); x <= Math.min(mapW - 1, s.x + r); x++) out.push({ x, y });
  }
  return out;
}

/** Same thing for a station that hasn't been built yet. */
export function previewCatchment(kind: StationKind, x: number, y: number, mapW: number, mapH: number): Pt[] {
  return catchmentTiles(newStation("preview", "", kind, x, y), mapW, mapH);
}

// ---------------------------------------------------------------- rating

export function ratingOf(s: Station, cargo: string): number {
  const st: StationState = {
    id: s.id,
    daysSinceLastPickup: s.daysSincePickup[cargo] ?? 30,
    waitingUnits: s.waiting[cargo] ?? 0,
    lastVehicleSpeedKmh: s.lastSpeedKmh,
    lastVehicleAgeYears: s.lastAgeYears,
  };
  return Math.max(0.05, stationRating(st));
}

/** Call when a vehicle loads cargo at a station. */
export function recordPickup(s: Station, cargo: string, speedKmh: number, ageYears: number): void {
  s.daysSincePickup[cargo] = 0;
  s.lastSpeedKmh = speedKmh;
  s.lastAgeYears = ageYears;
  s.served[cargo] = true;
}

/** Call once per game day for every station. */
export function tickStationDay(s: Station): void {
  for (const c of Object.keys(s.served)) s.daysSincePickup[c] = (s.daysSincePickup[c] ?? 0) + 1;
}

// ------------------------------------------------------- cargo to stations

export interface BuildingLike { x: number; y: number; kind: string; floors: number }
export interface TownLike { id: string; buildings: BuildingLike[]; activeStations?: number }
export interface IndustryLike { id: string; x: number; y: number; output: Record<string, number> }

const PASS_PER_FLOOR: Record<string, number> = { house: 3, shop: 5, apartments: 6, tower: 7, church: 2 };

/** Give `amount` of cargo from a spot to the stations that cover it. Returns units delivered to stations. */
function supply(stations: Station[], x: number, y: number, cargo: string, amount: number): number {
  const near = stations
    .filter(s => s.served[cargo] && covers(s, x, y))
    .map(s => ({ s, r: ratingOf(s, cargo) }))
    .sort((a, b) => b.r - a.r)
    .slice(0, 2);
  if (!near.length) return 0;

  let given = 0;
  near.forEach((n, i) => {
    const share = near.length === 1 ? 1 : i === 0 ? 0.7 : 0.3;
    const units = Math.floor(amount * share * n.r + 0.5);
    if (units > 0) { n.s.waiting[cargo] = (n.s.waiting[cargo] ?? 0) + units; given += units; }
  });
  return given;
}

/**
 * Call once per game month. Houses make passengers and mail, industries hand over what they
 * produced. Only stations that have had a pickup of that cargo before receive it, so build the
 * station, then send a vehicle, and cargo starts to appear.
 */
export function monthlyCargo(
  stations: Station[], towns: TownLike[], industries: IndustryLike[], rng: () => number = Math.random
): { passengers: number; mail: number; industry: number } {
  let passengers = 0, mail = 0, ind = 0;

  for (const t of towns) {
    for (const b of t.buildings) {
      const base = (PASS_PER_FLOOR[b.kind] ?? 3) * b.floors * (0.7 + rng() * 0.6);
      passengers += supply(stations, b.x, b.y, "passengers", base);
      mail += supply(stations, b.x, b.y, "mail", base / 3);
    }
  }

  for (const i of industries) {
    for (const cargo of Object.keys(i.output)) {
      const out = i.output[cargo];
      if (!out) continue;
      // Industry is 3x3 around its centre, so check the centre.
      ind += supply(stations, i.x, i.y, cargo, out);
      i.output[cargo] = 0;                       // what isn't picked up is lost
    }
  }
  return { passengers, mail, industry: ind };
}

/** Old waiting cargo disappears, faster at badly rated stations. Call monthly. */
export function decayWaiting(stations: Station[]): void {
  for (const s of stations) {
    for (const c of Object.keys(s.waiting)) {
      const r = ratingOf(s, c);
      s.waiting[c] = Math.floor(s.waiting[c] * (r < 0.4 ? 0.8 : 0.95));
    }
  }
}

// ------------------------------------------------------- loading and paying

/** Move up to `capacity` units from the station onto a vehicle. Returns units taken. */
export function loadOnto(s: Station, cargo: string, capacity: number): number {
  const take = Math.min(capacity, s.waiting[cargo] ?? 0);
  s.waiting[cargo] = (s.waiting[cargo] ?? 0) - take;
  return take;
}

/** Income for a delivery between two stations. Cargo must be a key of CARGO in tycoon-core. */
export function payForDelivery(
  from: Station, to: Station, cargo: Parameters<typeof deliveryIncome>[0],
  units: number, daysInTransit: number, inflation = 1
): number {
  return deliveryIncome(cargo, units, from, to, daysInTransit, inflation);
}

// -------------------------------------------------------------- town links

/**
 * Sets town.activeStations to the number of stations that cover at least one building and
 * have had a pickup in the last 20 days. tickTownDay() in tycoon-core uses it for growth speed.
 */
export function updateTownActivity(towns: (TownLike & { activeStations: number })[], stations: Station[]): void {
  for (const t of towns) {
    let n = 0;
    for (const s of stations) {
      const recent = Object.values(s.daysSincePickup).some(d => d <= 20);
      if (recent && t.buildings.some(b => covers(s, b.x, b.y))) n++;
    }
    t.activeStations = n;
  }
}

/*
 * HOW TO USE
 *
 *   // When the player builds:
 *   const st = newStation(id, "Oakwood Central", "busStop", x, y);
 *   // While placing, highlight previewCatchment("busStop", x, y, map.w, map.h)
 *
 *   // Each game day:           stations.forEach(tickStationDay);
 *   // Each game month:         monthlyCargo(stations, map.towns, map.industries);
 *   //                          decayWaiting(stations);
 *   //                          updateTownActivity(map.towns, stations);
 *   // When a bus loads:        const got = loadOnto(st, "passengers", capacity);
 *   //                          recordPickup(st, "passengers", model.speedKmh, vehicleAgeYears);
 *   // When it unloads at B:    cash += payForDelivery(stA, stB, "passengers", got, daysTravelled, inflation);
 *   // Station window:          ratingOf(st, "passengers") -> show as a percentage per cargo.
 */
