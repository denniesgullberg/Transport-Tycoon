/**
 * events.ts
 * What makes the world feel alive between your own actions:
 *  - a news log (new vehicle models, towns growing, industries changing or closing)
 *  - random monthly events (production changes, new industries, funding offers, interest rate changes)
 *  - objectives with deadlines and cash rewards
 *  - a company performance rating out of 1000 with a title, inspired by the original
 *
 * Needs vehicles.ts in the same folder. Everything stored here is plain JSON, so it saves fine.
 */

import { MODELS } from "./vehicles";

// -------------------------------------------------------------------- dates

export interface GameDate { year: number; month: number; day: number }   // month 0..11

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthYear = (d: GameDate) => `${MONTH_NAMES[d.month]} ${d.year}`;
export const dateText = (d: GameDate) => `${d.day} ${MONTH_NAMES[d.month]} ${d.year}`;

// --------------------------------------------------------------------- news

export type NewsKind = "info" | "good" | "bad" | "offer";

export interface Offer { type: "fundBuildings"; townId: string; cost: number; monthsLeft: number }

export interface NewsItem {
  id: number;
  date: GameDate;
  kind: NewsKind;
  text: string;
  /** Tile to jump to when the player taps the news item. */
  x?: number;
  y?: number;
  offer?: Offer;
}

export interface NewsLog { items: NewsItem[]; nextId: number }

export const newNewsLog = (): NewsLog => ({ items: [], nextId: 1 });

export function addNews(
  log: NewsLog, date: GameDate, kind: NewsKind, text: string, extra: { x?: number; y?: number; offer?: Offer } = {}
): NewsItem {
  const item: NewsItem = { id: log.nextId++, date: { ...date }, kind, text, ...extra };
  log.items.push(item);
  if (log.items.length > 120) log.items.splice(0, log.items.length - 120);
  return item;
}

export const latestNews = (log: NewsLog, n = 5): NewsItem[] => log.items.slice(-n).reverse();

// ------------------------------------------------------------ event state

export interface EventState {
  lowProduction: Record<string, number>;   // months a starved industry has been at minimum output
  townPop: Record<string, number>;         // last population seen, for milestone news
  monthsSinceOffer: number;
}

export const newEventState = (): EventState => ({ lowProduction: {}, townPop: {}, monthsSinceOffer: 0 });

export interface EventContext {
  date: GameDate;
  startYear: number;
  inflation: number;
  interestRate: number;
  towns: { id: string; name: string; x: number; y: number; population: number }[];
  industries: { id: string; name: string; kind: string; x: number; y: number; productionPerMonth: number }[];
  /** Best station rating (0..1) serving this industry, or 0 if nothing serves it. */
  serviceRating: (industryId: string) => number;
}

export type GameAction =
  | { kind: "setProduction"; industryId: string; value: number }
  | { kind: "closeIndustry"; industryId: string }
  | { kind: "openIndustry"; industryKind: string; near: { x: number; y: number } }
  | { kind: "setInterestRate"; value: number };

const PRIMARY = ["coalMine", "forest", "farm"];
export const FUNDING_DAYS = 180;       // town growth boost lasts this many days after accepting
const MIN_PRODUCTION = 8;

/** Each model gets a fixed month of the year when it is announced. */
function monthOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 12;
}

const PRETTY: Record<string, string> = {
  coalMine: "coal mine", forest: "lumber camp", farm: "farm", factory: "factory", sawmill: "sawmill", powerStation: "power station", steelMill: "steel mill",
};
const pct = (n: number) => `${Math.round(n)}%`;
const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

/**
 * Call once per game month. Writes news into `log` and returns things the GAME has to do
 * (change an industry's output, close it, open a new one, change the interest rate).
 */
export function rollMonthlyEvents(
  ctx: EventContext, state: EventState, log: NewsLog, rng: () => number = Math.random
): GameAction[] {
  const actions: GameAction[] = [];
  const { date } = ctx;

  // 1. New vehicle models
  for (const m of MODELS) {
    if (m.composite || m.introYear <= ctx.startYear || m.introYear !== date.year || monthOf(m.id) !== date.month) continue;
    const what = m.type === "locomotive" ? "locomotive" : m.type === "wagon" ? "wagon" : m.type;
    addNews(log, date, "good", `New ${what} available: ${m.name}. Speed ${m.speedKmh} km/h.`);
  }

  // 2. Town milestones
  for (const t of ctx.towns) {
    const before = state.townPop[t.id] ?? t.population;
    for (const mark of [200, 500, 1000, 2000, 5000, 10000]) {
      if (before < mark && t.population >= mark) {
        addNews(log, date, "good", `${t.name} has grown to ${mark.toLocaleString("en-GB")} inhabitants.`, { x: t.x, y: t.y });
      }
    }
    state.townPop[t.id] = t.population;
  }

  // 3. Industries: production changes and closures
  for (const ind of ctx.industries) {
    if (!PRIMARY.includes(ind.kind)) continue;
    const svc = ctx.serviceRating(ind.id);

    if (rng() < 0.03) {
      const up = rng() < (svc > 0.6 ? 0.7 : svc > 0 ? 0.45 : 0.2);
      const change = 10 + Math.floor(rng() * 21);
      const next = Math.max(MIN_PRODUCTION, Math.round(ind.productionPerMonth * (up ? 1 + change / 100 : 1 - change / 100)));
      if (next !== ind.productionPerMonth) {
        actions.push({ kind: "setProduction", industryId: ind.id, value: next });
        addNews(log, date, up ? "good" : "bad",
          up ? `Better output at ${ind.name}: production up ${pct(change)}.` : `Production at ${ind.name} has fallen by ${pct(change)}.`,
          { x: ind.x, y: ind.y });
      }
    }

    const starved = ind.productionPerMonth <= MIN_PRODUCTION && svc === 0;
    state.lowProduction[ind.id] = starved ? (state.lowProduction[ind.id] ?? 0) + 1 : 0;
    const months = state.lowProduction[ind.id];
    if (months === 10) addNews(log, date, "bad", `${ind.name} will close soon unless a station serves it.`, { x: ind.x, y: ind.y });
    if (months >= 14) {
      actions.push({ kind: "closeIndustry", industryId: ind.id });
      addNews(log, date, "bad", `${ind.name} has closed down.`, { x: ind.x, y: ind.y });
      state.lowProduction[ind.id] = 0;
    }
  }

  // 4. A new industry opens now and then (after the first year)
  if (date.year > ctx.startYear && ctx.towns.length && rng() < 0.06) {
    const kinds = ["coalMine", "forest", "farm", "factory", "sawmill", "powerStation"];
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const town = ctx.towns[Math.floor(rng() * ctx.towns.length)];
    actions.push({ kind: "openIndustry", industryKind: kind, near: { x: town.x, y: town.y } });
    addNews(log, date, "info", `Plans announced for a new ${PRETTY[kind] ?? kind} near ${town.name}.`, { x: town.x, y: town.y });
  }

  // 5. Council funding offers (the player taps Accept in the news)
  expireOffers(log);
  state.monthsSinceOffer++;
  if (state.monthsSinceOffer >= 8 && ctx.towns.length && rng() < 0.15) {
    const small = ctx.towns.filter(t => t.population < 3000);
    const pool = small.length ? small : ctx.towns;
    const town = pool[Math.floor(rng() * pool.length)];
    const cost = Math.round((8000 + town.population * 8) * ctx.inflation / 500) * 500;
    addNews(log, date, "offer", `The council of ${town.name} offers to fund new buildings for ${money(cost)}. Accept to make the town grow fast for a while.`,
      { x: town.x, y: town.y, offer: { type: "fundBuildings", townId: town.id, cost, monthsLeft: 3 } });
    state.monthsSinceOffer = 0;
  }

  // 6. Interest rate drifts each January
  if (date.month === 0 && rng() < 0.3) {
    const step = rng() < 0.5 ? -0.01 : 0.01;
    const value = Math.round(Math.max(0.02, Math.min(0.14, ctx.interestRate + step)) * 100) / 100;
    if (value !== ctx.interestRate) {
      actions.push({ kind: "setInterestRate", value });
      addNews(log, date, step > 0 ? "bad" : "good", `The bank has ${step > 0 ? "raised" : "lowered"} loan interest to ${pct(value * 100)}.`);
    }
  }

  return actions;
}

/** Remove the Accept button from offers that have run out. Call monthly. */
export function expireOffers(log: NewsLog): void {
  for (const n of log.items) {
    if (n.offer) {
      n.offer.monthsLeft -= 1;
      if (n.offer.monthsLeft < 0) delete n.offer;
    }
  }
}

/**
 * Player taps Accept. Returns the cost, or null if the offer has gone or they can't afford it.
 * The game then subtracts the cost and sets town.fundedBuildDaysLeft = FUNDING_DAYS.
 */
export function acceptOffer(log: NewsLog, newsId: number, cash: number): { townId: string; cost: number } | null {
  const n = log.items.find(i => i.id === newsId);
  if (!n || !n.offer || n.offer.cost > cash) return null;
  const out = { townId: n.offer.townId, cost: n.offer.cost };
  delete n.offer;
  return out;
}

// --------------------------------------------------------------- objectives

export type Metric = "passengers" | "cargo" | "cash" | "companyValue" | "townsConnected" | "vehicles" | "yearlyProfit";

export interface Objective {
  id: string;
  title: string;
  metric: Metric;
  target: number;
  deadlineYear?: number;
  reward: number;                     // cash on completion
  status: "active" | "done" | "failed";
}

export interface Metrics {
  passengers: number;                 // total delivered so far
  cargo: number;                      // total tonnes and crates delivered so far
  cash: number;
  companyValue: number;
  townsConnected: number;
  vehicles: number;
  yearlyProfit: number;               // profit over the last full year
}

export function defaultObjectives(startYear: number): Objective[] {
  return [
    { id: "first-passengers", title: "Carry 1,000 passengers",           metric: "passengers",     target: 1000,   deadlineYear: startYear + 3,  reward: 10000,  status: "active" },
    { id: "three-towns",      title: "Connect 3 towns",                  metric: "townsConnected", target: 3,      deadlineYear: startYear + 4,  reward: 15000,  status: "active" },
    { id: "fleet-10",         title: "Run a fleet of 10 vehicles",       metric: "vehicles",       target: 10,     deadlineYear: startYear + 6,  reward: 20000,  status: "active" },
    { id: "value-250k",       title: "Reach a company value of 250,000", metric: "companyValue",   target: 250000, deadlineYear: startYear + 10, reward: 50000,  status: "active" },
    { id: "profit-100k",      title: "Make 100,000 profit in a year",    metric: "yearlyProfit",   target: 100000, deadlineYear: startYear + 15, reward: 100000, status: "active" },
  ];
}

/** Turn a scenario goal from StartMenu.tsx into an objective. */
export function objectiveFromScenario(goal: { text: string; metric: Metric; target: number; byYear: number }): Objective {
  return { id: "scenario-goal", title: goal.text, metric: goal.metric, target: goal.target, deadlineYear: goal.byYear, reward: 0, status: "active" };
}

export const progress = (o: Objective, m: Metrics): number => Math.max(0, Math.min(1, m[o.metric] / o.target));

/** Call once per month. Returns cash to add for rewards. Writes news. */
export function checkObjectives(objs: Objective[], m: Metrics, date: GameDate, log: NewsLog): number {
  let reward = 0;
  for (const o of objs) {
    if (o.status !== "active") continue;
    if (m[o.metric] >= o.target) {
      o.status = "done"; reward += o.reward;
      addNews(log, date, "good", `Objective complete: ${o.title}.${o.reward ? ` Reward: ${money(o.reward)}.` : ""}`);
    } else if (o.deadlineYear !== undefined && date.year > o.deadlineYear) {
      o.status = "failed";
      addNews(log, date, "bad", `Objective failed: ${o.title}.`);
    }
  }
  return reward;
}

/** How many different towns your services link. Pass one entry per route. */
export function connectedTownCount(routes: { fromTownId?: string; toTownId?: string }[]): number {
  const s = new Set<string>();
  for (const r of routes) { if (r.fromTownId) s.add(r.fromTownId); if (r.toTownId) s.add(r.toTownId); }
  return s.size;
}

// ------------------------------------------------------------------- rating

export interface RatingInput {
  vehicles: { ageYears: number; speedKmh: number }[];
  stations: number;
  quarterlyIncome: number[];          // income for each of the last 4 quarters (fewer is fine)
  cargoDeliveredQuarter: number;
  cash: number;
  loan: number;
  maxLoan: number;
  inflation: number;
}

export interface RatingPart { label: string; score: number; max: number }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const RATING_TITLES = [
  { min: 0,   title: "Engineer" },
  { min: 100, title: "Traffic Manager" },
  { min: 200, title: "Transport Coordinator" },
  { min: 300, title: "Route Supervisor" },
  { min: 400, title: "Director" },
  { min: 500, title: "Chief Executive" },
  { min: 650, title: "Chairman" },
  { min: 800, title: "President" },
  { min: 950, title: "Tycoon" },
];

export function ratingTitle(total: number): string {
  let t = RATING_TITLES[0].title;
  for (const r of RATING_TITLES) if (total >= r.min) t = r.title;
  return t;
}

export function performanceRating(i: RatingInput): { total: number; max: 1000; title: string; parts: RatingPart[] } {
  const n = i.vehicles.length;
  const avgSpeed = n ? i.vehicles.reduce((a, v) => a + v.speedKmh, 0) / n : 0;
  const avgAge = n ? i.vehicles.reduce((a, v) => a + v.ageYears, 0) / n : 0;
  const inc = i.quarterlyIncome.length ? i.quarterlyIncome : [0];
  const minInc = Math.min(...inc), maxInc = Math.max(...inc);
  const f = Math.max(1, i.inflation);

  const parts: RatingPart[] = [
    { label: "Vehicle speed",    max: 100, score: n ? clamp01((avgSpeed - 40) / 160) * 100 : 0 },
    { label: "Vehicle age",      max: 100, score: n ? clamp01(1 - avgAge / 12) * 100 : 0 },
    { label: "Stations",         max: 100, score: clamp01(i.stations / 20) * 100 },
    { label: "Lowest income",    max: 150, score: clamp01(minInc / (40000 * f)) * 150 },
    { label: "Highest income",   max: 150, score: clamp01(maxInc / (80000 * f)) * 150 },
    { label: "Cargo delivered",  max: 150, score: clamp01(i.cargoDeliveredQuarter / 4000) * 150 },
    { label: "Money",            max: 100, score: clamp01(i.cash / (400000 * f)) * 100 },
    { label: "Loan",             max: 100, score: i.maxLoan > 0 ? clamp01(1 - i.loan / i.maxLoan) * 100 : 100 },
    { label: "Fleet size",       max: 50,  score: clamp01(n / 40) * 50 },
  ].map(p => ({ ...p, score: Math.round(p.score) }));

  const total = parts.reduce((a, p) => a + p.score, 0);
  return { total, max: 1000, title: ratingTitle(total), parts };
}

/*
 * HOW TO USE
 *
 *   const news = newNewsLog();  const ev = newEventState();  let objectives = defaultObjectives(startYear);
 *
 *   // Once per game month:
 *   const actions = rollMonthlyEvents({ date, startYear, inflation, interestRate: company.interestRate,
 *       towns: map.towns, industries: map.industries, serviceRating: id => bestRatingFor(id) }, ev, news);
 *   for (const a of actions) {
 *     if (a.kind === "setProduction")  map.industries.find(i => i.id === a.industryId)!.productionPerMonth = a.value;
 *     if (a.kind === "closeIndustry")  removeIndustry(a.industryId);
 *     if (a.kind === "openIndustry")   addIndustry(map, a.industryKind as IndustryKind, Math.random, a.near);   // mapgen.ts
 *     if (a.kind === "setInterestRate") company.interestRate = a.value;
 *   }
 *   company.cash += checkObjectives(objectives, metrics, date, news);
 *
 *   // News ticker: latestNews(news, 3). Tapping an item with x,y centres the camera there.
 *   // An item with .offer shows an Accept button -> acceptOffer(news, item.id, company.cash)
 *   //   then: cash -= cost; town.fundedBuildDaysLeft = FUNDING_DAYS.
 *   // Company window: performanceRating({...}) -> total / 1000, title, and the parts list.
 */
