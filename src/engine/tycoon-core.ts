/**
 * tycoon-core.ts
 * Pure-logic systems inspired by Transport Tycoon Deluxe.
 * No UI or framework dependencies. Call the functions from your game loop.
 */

// Vehicle models live in vehicles.ts (buses, trucks, locomotives, wagons, ...).
import { MODELS, availableModels, getModel } from "./vehicles";
import type { VehicleModel } from "./vehicles";
export { MODELS, availableModels, getModel };
export type { VehicleModel };


// ---------------------------------------------------------------------------
// 1. CARGO + PAYMENT
// ---------------------------------------------------------------------------

export type CargoId = "passengers" | "mail" | "coal" | "goods" | "wood" | "steel" | "grain";

export interface CargoDef {
  id: CargoId;
  label: string;
  basePay: number;      // pay per unit per tile at full speed
  days1: number;        // days in transit before payment starts dropping
  days2: number;        // days after days1 before it drops faster
}

export const CARGO: Record<CargoId, CargoDef> = {
  passengers: { id: "passengers", label: "Passengers", basePay: 39, days1: 0,  days2: 24 },
  mail:       { id: "mail",       label: "Mail",       basePay: 45, days1: 20, days2: 90 },
  coal:       { id: "coal",       label: "Coal",       basePay: 59, days1: 7,  days2: 255 },
  goods:      { id: "goods",      label: "Goods",      basePay: 61, days1: 5,  days2: 28 },
  wood:       { id: "wood",       label: "Wood",       basePay: 46, days1: 15, days2: 255 },
  steel:      { id: "steel",      label: "Steel",      basePay: 55, days1: 7,  days2: 255 },
  grain:      { id: "grain",      label: "Grain",      basePay: 42, days1: 4,  days2: 40 },
};

/** Time factor: 1.0 when fast, falls toward 0.31 when slow. Same shape as TTD. */
export function timeFactor(cargo: CargoDef, daysInTransit: number): number {
  const d = Math.max(0, daysInTransit - cargo.days1);
  let f = 255;
  if (d > 0) f -= d;
  if (d > cargo.days2) f -= d - cargo.days2;
  return Math.max(31, f) / 255;
}

/**
 * Income for one delivery. Distance is Manhattan distance between the
 * source and destination station (as in TTD), NOT the path length.
 * inflation starts at 1 and grows yearly (see section 6).
 */
export function deliveryIncome(
  cargoId: CargoId,
  units: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  daysInTransit: number,
  inflation = 1
): number {
  const cargo = CARGO[cargoId];
  const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  const raw = dist * units * cargo.basePay * timeFactor(cargo, daysInTransit);
  return Math.round((raw / 10) * inflation);
}

// ---------------------------------------------------------------------------
// 2. STATION RATING (decides how much cargo a station actually receives)
// ---------------------------------------------------------------------------

export interface StationState {
  id: string;
  daysSinceLastPickup: number;
  waitingUnits: number;
  lastVehicleSpeedKmh: number;
  lastVehicleAgeYears: number;
}

/** Returns 0..1. TTD shows this as a percentage next to each cargo. */
export function stationRating(s: StationState): number {
  let r = 0;

  // Pickup frequency
  if (s.daysSinceLastPickup <= 2.5) r += 130;
  else if (s.daysSinceLastPickup <= 5) r += 95;
  else if (s.daysSinceLastPickup <= 10) r += 50;
  else if (s.daysSinceLastPickup <= 20) r += 25;

  // Cargo waiting (less is better)
  if (s.waitingUnits <= 60) r += 40;
  else if (s.waitingUnits <= 100) r += 30;
  else if (s.waitingUnits <= 300) r += 10;
  else if (s.waitingUnits > 600) r -= 35;

  // Speed of last vehicle
  if (s.lastVehicleSpeedKmh > 85) r += Math.min(42, Math.floor((s.lastVehicleSpeedKmh - 85) / 4));

  // Age of last vehicle
  if (s.lastVehicleAgeYears < 3) r += 10;
  if (s.lastVehicleAgeYears < 2) r += 10;
  if (s.lastVehicleAgeYears < 1) r += 13;

  return Math.max(0, Math.min(255, r)) / 255;
}

/** How much of the produced cargo actually lands at the station. */
export function cargoAcceptedAtStation(produced: number, rating: number): number {
  return Math.floor(produced * Math.max(0.05, rating));
}

// ---------------------------------------------------------------------------
// 3. INDUSTRIES (production chains)
// ---------------------------------------------------------------------------

export interface Industry {
  id: string;
  kind: "coalMine" | "powerStation" | "forest" | "sawmill" | "farm" | "factory" | "steelMill" | "ironOreMine";
  x: number;
  y: number;
  productionPerMonth: number;
  /** stockpile of delivered input cargo waiting to be processed */
  input: Partial<Record<CargoId, number>>;
  /** output ready to be picked up by stations */
  output: Partial<Record<CargoId, number>>;
}

export const CHAINS: Record<string, { in?: CargoId[]; out?: CargoId; ratio?: number }> = {
  coalMine:     { out: "coal" },
  forest:       { out: "wood" },
  farm:         { out: "grain" },
  sawmill:      { in: ["wood"],           out: "goods", ratio: 1 },
  factory:      { in: ["grain", "steel"], out: "goods", ratio: 1 },
  steelMill:    { in: ["coal"],           out: "steel", ratio: 1 },
  powerStation: { in: ["coal"] }, // consumes only
};

/** Run once per game month. Includes TTD-style random production drift. */
export function tickIndustryMonth(ind: Industry, rng: () => number = Math.random): void {
  const chain = CHAINS[ind.kind];
  if (!chain) return;

  if (chain.in && chain.out) {
    let made = 0;
    for (const c of chain.in) {
      const have = ind.input[c] ?? 0;
      const m = Math.floor(have * (chain.ratio ?? 1));
      ind.input[c] = have - m;
      made += m;
    }
    ind.output[chain.out] = (ind.output[chain.out] ?? 0) + made;
  } else if (chain.out) {
    ind.output[chain.out] = (ind.output[chain.out] ?? 0) + ind.productionPerMonth;
  } else if (chain.in) {
    for (const c of chain.in) ind.input[c] = 0; // consumed
  }

  // Random production change, small chance each month
  if (rng() < 0.03) {
    const up = rng() < 0.55; // slightly favours growth when serviced well
    const delta = Math.max(1, Math.round(ind.productionPerMonth * 0.1));
    ind.productionPerMonth = Math.max(4, ind.productionPerMonth + (up ? delta : -delta));
  }
}

/** Good service (rating > 60%) makes production grow over time. */
export function serviceBonus(ind: Industry, rating: number, rng: () => number = Math.random): void {
  if (rating > 0.6 && rng() < 0.04) ind.productionPerMonth += 2;
  if (rating < 0.35 && rng() < 0.04) ind.productionPerMonth = Math.max(4, ind.productionPerMonth - 2);
}

// ---------------------------------------------------------------------------
// 4. TOWN GROWTH
// ---------------------------------------------------------------------------

export interface Town {
  id: string;
  name: string;
  population: number;
  /** stations within town radius that were visited in the last 20 days */
  activeStations: number;
  growthTimer: number; // days until next growth step
  fundedBuildDaysLeft: number;
}

/** Call once per day. Returns houses to add this tick (0 or more). */
export function tickTownDay(t: Town, rng: () => number = Math.random): number {
  t.growthTimer -= 1;
  if (t.fundedBuildDaysLeft > 0) t.fundedBuildDaysLeft -= 1;
  if (t.growthTimer > 0) return 0;

  // TTD: more active stations = faster growth. Funded = fastest.
  let interval = 70;
  if (t.activeStations >= 1) interval = 40;
  if (t.activeStations >= 2) interval = 25;
  if (t.activeStations >= 4) interval = 15;
  if (t.fundedBuildDaysLeft > 0) interval = Math.min(interval, 8);

  t.growthTimer = interval + Math.floor(rng() * 10);
  t.population += 8 + Math.floor(rng() * 12);
  return 1;
}

/** Passengers and mail a town generates per month, scaled by station rating. */
export function townMonthlyPassengers(t: Town): number {
  return Math.floor(t.population / 8);
}
export function townMonthlyMail(t: Town): number {
  return Math.floor(t.population / 24);
}

// ---------------------------------------------------------------------------
// 5. VEHICLES: aging, reliability, breakdowns, servicing, running costs
// ---------------------------------------------------------------------------

export interface Vehicle {
  id: string;
  modelId: string;
  ageDays: number;
  reliability: number;       // current, drops between services
  daysSinceService: number;
  brokenDownDaysLeft: number;
  breakdownsEnabled: boolean;
}

export function newVehicle(id: string, model: VehicleModel): Vehicle {
  return {
    id, modelId: model.id, ageDays: 0,
    reliability: model.baseReliability, daysSinceService: 0,
    brokenDownDaysLeft: 0, breakdownsEnabled: true,
  };
}

/** Call once per day per vehicle. Returns "broke" the day it breaks down. */
export function tickVehicleDay(
  v: Vehicle,
  model: VehicleModel,
  rng: () => number = Math.random
): "ok" | "broke" | "stopped" {
  v.ageDays += 1;
  v.daysSinceService += 1;

  // Reliability decays between services; old vehicles decay faster
  const ageYears = v.ageDays / 365;
  const ageFactor = ageYears > model.maxAgeYears ? 2.5 : 1;
  v.reliability = Math.max(0.1, v.reliability - 0.00035 * ageFactor);

  if (v.brokenDownDaysLeft > 0) {
    v.brokenDownDaysLeft -= 1;
    return "stopped";
  }

  if (v.breakdownsEnabled) {
    const chance = (1 - v.reliability) * 0.004; // per-day chance
    if (rng() < chance) {
      v.brokenDownDaysLeft = 3 + Math.floor(rng() * 4);
      return "broke";
    }
  }
  return "ok";
}

/** Servicing at a depot restores reliability (not fully for old vehicles). */
export function serviceVehicle(v: Vehicle, model: VehicleModel): void {
  const ageYears = v.ageDays / 365;
  const ceiling = model.baseReliability * (ageYears > model.maxAgeYears ? 0.8 : 1);
  v.reliability = ceiling;
  v.daysSinceService = 0;
}

export function needsService(v: Vehicle, intervalDays = 150): boolean {
  return v.daysSinceService >= intervalDays;
}

export function isOld(v: Vehicle, model: VehicleModel): boolean {
  return v.ageDays / 365 > model.maxAgeYears;
}

export function vehicleRunningCostPerDay(model: VehicleModel, inflation = 1): number {
  return (model.runningCostPerYear / 365) * inflation;
}

export function vehicleSalePrice(v: Vehicle, model: VehicleModel): number {
  const ageYears = v.ageDays / 365;
  return Math.round(model.price * Math.max(0.1, 1 - ageYears / model.maxAgeYears));
}

// ---------------------------------------------------------------------------
// 6. COMPANY FINANCE: loan, interest, bankruptcy, inflation
// ---------------------------------------------------------------------------

export interface Company {
  cash: number;
  loan: number;
  maxLoan: number;
  loanStep: number;
  interestRate: number;       // yearly, e.g. 0.08
  quarterlyBadCount: number;
  history: { year: number; income: number; running: number; interest: number; construction: number }[];
}

export function newCompany(): Company {
  return {
    cash: 85000, loan: 0, maxLoan: 300000, loanStep: 10000,
    interestRate: 0.08, quarterlyBadCount: 0, history: [],
  };
}

export function borrow(c: Company): boolean {
  if (c.loan + c.loanStep > c.maxLoan) return false;
  c.loan += c.loanStep;
  c.cash += c.loanStep;
  return true;
}

export function repay(c: Company): boolean {
  if (c.loan < c.loanStep || c.cash < c.loanStep) return false;
  c.loan -= c.loanStep;
  c.cash -= c.loanStep;
  return true;
}

/** Call once per month. Returns interest charged. */
export function chargeMonthlyInterest(c: Company): number {
  const interest = Math.round((c.loan * c.interestRate) / 12);
  c.cash -= interest;
  return interest;
}

/**
 * Call at the end of each quarter (every 3 months).
 * TTD: 3 negative quarters = warning, more = bankruptcy.
 */
export function checkBankruptcy(c: Company): "ok" | "warning" | "bankrupt" {
  if (c.cash < 0) c.quarterlyBadCount += 1;
  else c.quarterlyBadCount = 0;
  if (c.quarterlyBadCount >= 4) return "bankrupt";
  if (c.quarterlyBadCount >= 2) return "warning";
  return "ok";
}

/** Inflation ticks yearly: prices and income both go up, so growth stays fair. */
export function nextInflation(current: number): number {
  return current * 1.025;
}

/** Max loan grows with inflation, like TTD. */
export function scaleLoanLimit(c: Company, inflation: number): void {
  c.maxLoan = Math.round((300000 * inflation) / 10000) * 10000;
}

// ---------------------------------------------------------------------------
// 7. GAME CLOCK
// ---------------------------------------------------------------------------

export interface GameDate { year: number; month: number; day: number; }

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function advanceDay(d: GameDate): { date: GameDate; newMonth: boolean; newQuarter: boolean; newYear: boolean } {
  let { year, month, day } = d;
  day += 1;
  let newMonth = false, newYear = false;
  if (day > DAYS_IN_MONTH[month]) {
    day = 1; month += 1; newMonth = true;
    if (month > 11) { month = 0; year += 1; newYear = true; }
  }
  return {
    date: { year, month, day },
    newMonth,
    newQuarter: newMonth && month % 3 === 0,
    newYear,
  };
}

// ---------------------------------------------------------------------------
// 8. SINGLE ENTRY POINT: call this once per in-game day
// ---------------------------------------------------------------------------

export interface World {
  date: GameDate;
  inflation: number;
  company: Company;
  towns: Town[];
  industries: Industry[];
  vehicles: Vehicle[];
  events: string[];
}

export function tickWorldDay(w: World, rng: () => number = Math.random): void {
  const step = advanceDay(w.date);
  w.date = step.date;

  // Towns
  for (const t of w.towns) tickTownDay(t, rng);

  // Vehicles
  for (const v of w.vehicles) {
    const model = getModel(v.modelId)!;
    const result = tickVehicleDay(v, model, rng);
    if (result === "broke") w.events.push(`${model.name} has broken down.`);
    w.company.cash -= vehicleRunningCostPerDay(model, w.inflation);
    if (isOld(v, model) && v.ageDays % 365 === 0) {
      w.events.push(`${model.name} is getting old. Consider replacing it.`);
    }
  }

  if (step.newMonth) {
    for (const i of w.industries) tickIndustryMonth(i, rng);
    chargeMonthlyInterest(w.company);
  }

  if (step.newQuarter) {
    const status = checkBankruptcy(w.company);
    if (status === "warning") w.events.push("Warning: your company is running at a loss.");
    if (status === "bankrupt") w.events.push("Your company has gone bankrupt.");
  }

  if (step.newYear) {
    w.inflation = nextInflation(w.inflation);
    scaleLoanLimit(w.company, w.inflation);
    w.events.push(`New year ${w.date.year}. New vehicle models may be available.`);
  }
}
