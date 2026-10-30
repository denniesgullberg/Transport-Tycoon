"use strict";
const T = window.TT;
const { core, vehicles: V, mapgen, terrain, roadnet, stations: ST, orders: OR, events: EV, save: SV, ai: AI, sound } = T;

// ------------------------------------------------------------------ constants
const TW = 40, TH = 20, HS = 7;
const INCOME_SCALE = 0.11;           // tycoon-core pays far more than the original; this brings it to a playable level
const PRIMARY_OUTPUT = 2;            // mines, forests and farms produce this many times the map generator's figure
const PRIMARY = mapgen.PRIMARY_INDUSTRIES;
const FREIGHT_BONUS = 2.0, TRAIN_BONUS = 1.4, PASSENGER_OUTPUT = 1.5;   // freight and trains pay more per unit so they are worth their running costs
const DAY_SECONDS = 0.4;             // real seconds per game day at 1x
const ROAD_COST = 120, STATION_COST = 600, DEPOT_COST = 1500, TRACK_COST = 180, RAIL_STATION_COST = 1800, RAIL_DEPOT_COST = 2600, CLEAR_TREE = 40, BULLDOZE = 60;

const CLIM = {
  temperate: { label: "Temperate", map: { lakes: 0.5, hills: 0.5, forests: 0.5, rivers: 2 }, grass: "#78a853", grass2: "#6f9f4d", water: "#4f9fd6", hill: "#8f8a6a", snow: null, tree: "#2f6b2f" },
  arctic:    { label: "Sub-Arctic", map: { lakes: 0.3, hills: 0.85, forests: 0.35, rivers: 1 }, grass: "#9db89a", grass2: "#93af92", water: "#6fa8c8", hill: "#a9b0a4", snow: "#eef5f8", tree: "#2f5f4a" },
  tropical:  { label: "Sub-Tropical", map: { lakes: 0.12, hills: 0.4, forests: 0.12, rivers: 1 }, grass: "#c9a05a", grass2: "#bf9650", water: "#4fb3c4", hill: "#a8743a", snow: null, tree: "#3f7d3a" },
  toyland:   { label: "Toyland", map: { lakes: 0.6, hills: 0.3, forests: 0.55, rivers: 2 }, grass: "#f0a2c4", grass2: "#eb98bc", water: "#8ad0f0", hill: "#ffd36b", snow: null, tree: "#7a4fd0" },
};
const DIFF = {
  easy:   { startingCash: 150000, maxLoan: 500000, interestRate: 0.04, inflation: false, breakdowns: 0,   cost: 0.7, growth: 1.6, rivals: 1, income: 1.2 },
  medium: { startingCash: 85000,  maxLoan: 300000, interestRate: 0.08, inflation: true,  breakdowns: 0.5, cost: 1,   growth: 1,   rivals: 2, income: 1 },
  hard:   { startingCash: 50000,  maxLoan: 200000, interestRate: 0.12, inflation: true,  breakdowns: 1,   cost: 1.5, growth: 0.6, rivals: 3, income: 0.85 },
};
// What each industry makes and which industries take each cargo, read from the production chains.
const CARGO_FROM_IND = {}, CARGO_TO_IND = {};
for (const [k, ch] of Object.entries(core.CHAINS)) { if (ch.out) CARGO_FROM_IND[k] = ch.out; for (const c of ch.in || []) (CARGO_TO_IND[c] = CARGO_TO_IND[c] || []).push(k); }
for (const c of Object.keys(core.CARGO)) CARGO_TO_IND[c] = CARGO_TO_IND[c] || [];
const CARGO_USE = { coal: "Coal: mine to power station or steel mill", wood: "Timber: forest to sawmill", grain: "Grain: farm to factory", goods: "Goods: sawmill or factory to towns", steel: "Steel: steel mill to factory", mail: "Mail: between towns", passengers: "Passengers: between towns" };
const RIVAL_COLORS = ["#c0392b", "#7b3fa0", "#e07b00", "#12a39a"];
const PLAYER_COLOR = "#1e5aa8";

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const money = (n) => (n < 0 ? "-" : "") + "£" + Math.abs(Math.round(n)).toLocaleString("en-GB");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rng = Math.random;

// ----------------------------------------------------------------- game state
let S = null;          // the whole saved game
let R = null;          // runtime only: roads network, caches
const ui = { tool: "inspect", paused: false, speed: 1, hover: null, selStation: null, overlay: null, jump: null };

function key(x, y) { return y * S.map.w + x; }
function inB(x, y) { return x >= 0 && y >= 0 && x < S.map.w && y < S.map.h; }
function cost(n) { return Math.round(n * S.settings.cost * S.inflation); }

function newGame(cfg) {
  const settings = { ...DIFF[cfg.difficulty] };
  if (cfg.rivals != null) settings.rivals = cfg.rivals;
  const opts = { size: cfg.mapSize, towns: cfg.towns, ...CLIM[cfg.climate].map, climate: cfg.climate, names: cfg.names || (cfg.climate === "toyland" ? "silly" : "english") };
  opts.industryScale = 1.6 * Math.max(1, Math.pow(cfg.mapSize / 96, 2));   // more industries, and more again on bigger maps
  if (cfg.water != null) opts.lakes = cfg.water;
  if (cfg.rivers != null) opts.rivers = cfg.rivers;
  const map = mapgen.generateMap(String(cfg.seed), opts);
  for (const i of map.industries) if (PRIMARY.includes(i.kind)) i.productionPerMonth *= PRIMARY_OUTPUT;
  const company = core.newCompany();
  company.cash = settings.startingCash; company.maxLoan = settings.maxLoan; company.interestRate = settings.interestRate;
  S = {
    v: 1, cfg, settings, map, company, date: { year: cfg.startYear, month: 0, day: 1 }, startYear: cfg.startYear, inflation: 1, totalDays: 0,
    stations: [], depots: [], vehicles: [], spans: {}, ids: { s: 0, d: 0, v: 0 },
    news: EV.newNewsLog(), evState: EV.newEventState(), objectives: EV.defaultObjectives(cfg.startYear),
    ledgers: [], acc: {}, history: [], metrics: { passengers: 0, cargo: 0, quarterCargo: 0 },
    qIncome: 0, quarterlyIncome: [], monthNet: [], bank: "ok", gameOver: false,
    rivals: [], roadTiles: [], railTiles: [], signals: {}, elec: {}, oneway: {}, townRating: {}, ads: {}, railOwner: {}, replace: { renew: false, rules: {} }, retireYear: cfg.retireYears ? cfg.startYear + cfg.retireYears : null, name: "Oakwood Transport",
  };
  // rivals open for business a couple of years in, one after the other, so the player gets a head start
  const delay = cfg.rivalDelay != null ? cfg.rivalDelay : 24;
  S.rivalQueue = [];
  for (let i = 0; i < settings.rivals; i++) { if (delay > 0) S.rivalQueue.push({ i, at: cfg.startYear * 12 + delay + i * 6 }); else addRival(i); }
  initRuntime();
  makeRigDocks(); rebuildSea();
  EV.addNews(S.news, S.date, "info", "Welcome to " + CLIM[cfg.climate].label + " valley. Build roads, stops and a depot, then buy a vehicle.");
  ui.paused = false;
}

function initRuntime() {
  R = { roads: new roadnet.RoadNetwork((x, y) => S.map.height[y * S.map.w + x], 2), rail: new roadnet.RoadNetwork((x, y) => S.map.height[y * S.map.w + x], 2), sprites: {}, towns: null, bld: new Map(), indAt: new Map(), stationAt: new Map(), depotAt: new Map(), pending: [], floats: [], undo: [], lastHorn: 0 };
  const m = S.map;
  if (S.roadTiles.length) for (const p of S.roadTiles) R.roads.addRoad(p.x, p.y);
  else for (const t of m.towns) for (const r of t.roads) R.roads.addRoad(r.x, r.y);
  for (const p of (S.railTiles || [])) R.rail.addRoad(p.x, p.y);
  if (!S.signals) S.signals = {}; if (!S.elec) S.elec = {};
  rebuildLookups();
  if (!S.oneway) S.oneway = {};
  R.roads.stepOk = oneWayOk;
  rebuildSea();
  for (const vh of S.vehicles) if (!isTrain(vh) && !isAir(vh)) netOf(vh).moveVehicle(vh.id, null, vh.state === "moving" ? vh.to : vh.tile);
  rebuildRailRes();
}
function rebuildLookups() {
  const m = S.map;
  R.bld.clear(); R.indAt.clear(); R.stationAt.clear(); R.depotAt.clear();
  for (const t of m.towns) for (const b of t.buildings) R.bld.set(b.y * m.w + b.x, b);
  for (const i of m.industries) R.indAt.set((i.y + 1) * m.w + (i.x + 1), i);
  for (const s of S.stations) for (const t of stationTiles(s)) R.stationAt.set(t.y * m.w + t.x, s);
  for (const d of S.depots) R.depotAt.set(d.y * m.w + d.x, d);
}
function townOf(x, y) {
  let best = null, bd = 1e9;
  for (const t of S.map.towns) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } }
  return best;
}
function stationById(id) { return S.stations.find(s => s.id === id); }
function depotById(id) { return S.depots.find(d => d.id === id); }
function modelOf(vh) { return V.getModel(vh.modelId); }
function isTrainModel(m) { return !!m && m.type === "train"; }
function isTrain(vh) { return isTrainModel(modelOf(vh)); }
function netOf(vh) { return netFor(depotKindOf(modelOf(vh))); }
function netFor(dk) { return dk === "rail" ? R.rail : dk === "ship" ? R.sea : dk === "air" ? ANYWHERE : R.roads; }
function depotKindOf(m) { return isTrainModel(m) ? "rail" : isShipModel(m) ? "ship" : isAirModel(m) ? "air" : "road"; }
function stationKindFor(m) { return m.type === "bus" ? "busStop" : isTrainModel(m) ? "trainStation" : isShipModel(m) ? "dock" : isAirModel(m) ? "airport" : "truckStop"; }
// Where a vehicle of this kind stands when it is "at" a station: ships wait on the water by the dock.
function stationPoint(s) { return s.kind === "dock" && s.water ? s.water : s.kind === "airport" ? airportCentre(s) : s; }
function tractionOf(vh) { const m = modelOf(vh); if (!isTrainModel(m)) return "road"; const loco = V.getModel(m.parts.locoId); const n = loco ? loco.name : ""; return /^(Volt|Arc|Meridian|Tempest)/.test(n) ? "electric" : /^(Kestrel|Warbler|Lancer|Condor)/.test(n) ? "steam" : "diesel"; }
function syncPersist() { S.roadTiles = R.roads.tiles(); S.railTiles = R.rail.tiles(); }
function playerVehicles() { return S.vehicles.filter(v => v.owner === "player"); }

// ------------------------------------------------------------------ accounting
function post(cat, amt) { S.acc[cat] = (S.acc[cat] || 0) + amt; }
function flushLedger() {
  for (const k of Object.keys(S.acc)) if (S.acc[k]) S.ledgers = postEntryFn(S.ledgers, S.date.year, k, S.acc[k]);
  S.acc = {};
}
function postEntryFn(ledgers, year, cat, amount) {
  const out = ledgers.map(l => ({ year: l.year, items: { ...l.items } }));
  let row = out.find(l => l.year === year);
  if (!row) { row = { year, items: {} }; out.push(row); out.sort((a, b) => a.year - b.year); }
  row.items[cat] = (row.items[cat] || 0) + amount;
  return out.slice(-6);
}
function spend(cat, amount) { S.company.cash -= amount; post(cat, -amount); }

// -------------------------------------------------------------- catchment info
function covered(st) {
  // what the station covers: houses (towns) and industries
  const r = ST.CATCHMENT[st.kind], out = { houses: 0, towns: new Set(), inds: [] };
  for (const t of S.map.towns) for (const b of t.buildings) if (ST.covers(st, b.x, b.y)) { out.houses++; out.towns.add(t.id); }
  for (const i of S.map.industries) if (ST.covers(st, i.x, i.y)) out.inds.push(i);
  return out;
}
function producesAt(st, cargo) {
  const c = covered(st);
  if (cargo === "passengers" || cargo === "mail") return c.houses > 0;
  return c.inds.some(i => CARGO_FROM_IND[i.kind] === cargo);
}
function acceptsAt(st, cargo) {
  const c = covered(st);
  if (cargo === "passengers" || cargo === "mail") return c.houses > 0;
  if (core.TOWN_CARGO.includes(cargo) && c.houses > ((cargo === "gold" || cargo === "diamonds") ? 20 : 3)) return true;
  return c.inds.some(i => (CARGO_TO_IND[cargo] || []).includes(i.kind));
}
function serviceRatingOf(indId) {
  const ind = S.map.industries.find(i => i.id === indId); if (!ind) return 0;
  const cargo = CARGO_FROM_IND[ind.kind]; if (!cargo) return 0;
  let best = 0;
  for (const s of S.stations) if (s.served[cargo] && ST.covers(s, ind.x, ind.y)) best = Math.max(best, ST.ratingOf(s, cargo));
  return best;
}

// --------------------------------------------------------------------- vehicles
function makeVehicle(owner, modelId, depotOrTile, stationIds) {
  const model = V.getModel(modelId);
  const id = "v" + (++S.ids.v);
  const cv = core.newVehicle(id, model);
  cv.breakdownsEnabled = owner === "player" && S.settings.breakdowns > 0;
  const tile = { x: depotOrTile.x, y: depotOrTile.y };
  const vh = {
    id, owner, modelId, core: cv, orders: OR.newOrders(id, stationIds || []), tile, from: tile, to: tile, p: 0, state: "idle",
    loaded: 0, origin: null, loadDay: 0, cargo: model.cargo, profit: { thisYear: 0, lastYear: 0, lifetime: 0 }, dir: { dx: 1, dy: 0 }, broken: false, wait: 0,
  };
  vh.orders.autoService = owner === "player";
  S.vehicles.push(vh);
  if (isTrainModel(model)) { vh.trail = [{ x: tile.x, y: tile.y }]; vh.res = []; }
  else netFor(depotKindOf(model)).moveVehicle(id, null, tile);
  for (const sid of stationIds || []) { const s = stationById(sid); if (s) { s.served[model.cargo] = true; if (s.daysSincePickup[model.cargo] == null) s.daysSincePickup[model.cargo] = 0; } }
  return vh;
}
function removeVehicle(vh) {
  R.roads.removeVehicle(vh.id); R.rail.removeVehicle(vh.id); if (R.res) releaseAll(vh.id);
  S.vehicles = S.vehicles.filter(v => v !== vh);
}
function bestPair(cargo, nearTile, stKind, net) {
  net = net || R.roads;
  const pt = (s) => stationPoint(s), m0 = arguments[4];
  const cand = S.stations.filter(s => (s.owner === "player" || s.owner === "public") && (!stKind || s.kind === stKind) && (!m0 || canUseStation(m0, s)) && net.connected(pt(s), nearTile));
  let best = null, bd = -1;
  for (const a of cand) {
    if (!producesAt(a, cargo)) continue;
    for (const b of cand) {
      if (a === b || !acceptsAt(b, cargo)) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d >= 6 && d > bd && net.connected(pt(a), pt(b))) { bd = d; best = [a.id, b.id]; }
    }
  }
  return best;
}
// Stops this vehicle could use: its kind, its owner's or public, and reachable from where it is.
function reachable(vh, s) {
  const m = modelOf(vh); if (!m) return false;
  if (s.kind !== stationKindFor(m) || !canUseStation(m, s)) return false;
  if (s.owner !== vh.owner && s.owner !== "public") return false;
  if (isAir(vh)) return true;
  const net = netOf(vh), from = isShip(vh) ? vh.tile : vh.tile;
  if (isTrain(vh)) return stationTiles(s).some(t => R.rail.hasRoad(t.x, t.y) && R.rail.connected(t, from));
  return net.connected(stationPoint(s), from);
}
// With two stops picked, also visit every other stop of the same kind in those towns that has
// this cargo or takes it: first round the start town, then round the end town.
function autoRoute(pair, cargo, net, m) {
  if (!pair) return pair;
  const a = stationById(pair[0]), b = stationById(pair[1]); if (!a || !b) return pair;
  const pt = (s) => stationPoint(s), d = (s, t) => Math.abs(s.x - t.x) + Math.abs(s.y - t.y);
  const townsOf = (s) => covered(s).towns;
  const ok = (s) => s !== a && s !== b && (s.owner === "player" || s.owner === "public") && s.kind === a.kind && (!m || canUseStation(m, s)) && (producesAt(s, cargo) || acceptsAt(s, cargo)) && net.connected(pt(s), pt(a));
  const ta = townsOf(a), tb = townsOf(b);
  if (!ta.size && !tb.size) return pair;
  const extraA = [], extraB = [];
  for (const s of S.stations) { if (!ok(s)) continue; const c = townsOf(s); if ([...c].some(t => ta.has(t))) extraA.push(s); else if ([...c].some(t => tb.has(t))) extraB.push(s); }
  if (!extraA.length && !extraB.length) return pair;
  extraA.sort((p, q) => d(q, b) - d(p, b)); extraB.sort((p, q) => d(p, a) - d(q, a));
  return [a.id, ...extraA.map(s => s.id), ...extraB.map(s => s.id), b.id];
}
function buyVehicle(modelId, depot) {
  const m = V.getModel(modelId);
  if (!m || !m.supported || !["bus", "truck", "train", "ship", "aircraft"].includes(m.type)) return { ok: false, msg: "This vehicle type is not playable yet." };
  const dk = depotKindOf(m);
  if ((depot.kind || "road") !== dk) return { ok: false, msg: ({ rail: "Trains are built at a train depot on a track.", ship: "Ships are built at a shipyard.", air: "Aircraft are bought at an airport.", road: "Buses and trucks are built at a road depot." })[dk] };
  if (dk === "air" && isJet(m) && (stationById(depot.airport) || {}).size !== "large") return { ok: false, msg: "Jets need a city airport." };
  if (isTrainModel(m) && /^(Volt|Arc|Meridian|Tempest)/.test((V.getModel(m.parts.locoId) || {}).name || "") && !isElec(depot.x, depot.y)) return { ok: false, msg: "Electric locomotives need electrified track. Electrify the depot and the line first." };
  if ((depot.owner || "player") !== "player") return { ok: false, msg: "That depot belongs to another company." };
  const price = vehiclePrice(m);
  if (S.company.cash < price) return { ok: false, msg: "Not enough money." };
  const near = dk === "ship" ? { x: depot.x, y: depot.y } : depot;
  const pair = autoRoute(bestPair(m.cargo, near, stationKindFor(m), netFor(dk), m), m.cargo, netFor(dk), m);
  spend("newVehicles", price);
  const vh = makeVehicle("player", modelId, depot, pair || []);
  if (dk === "air") { vh.core.breakdownsEnabled = S.settings.breakdowns > 0; vh.orders.autoService = false; vh.at = depot.airport; const ap = stationById(depot.airport); if (ap) { const c = airportCentre(ap); vh.pos = { x: c.x, y: c.y }; } }
  sound.play("build");
  return { ok: true, vh, pair };
}
function sellVehicle(vh) {
  const m = modelOf(vh);
  const val = saleValue(vh);
  S.company.cash += val; post("other", val);
  removeVehicle(vh);
  sound.play("cash");
  return val;
}

function destTile(vh) {
  const d = OR.destination(vh.orders); if (!d) return null;
  if (d.kind === "stop") { const s = stationById(d.id); return s ? { x: s.x, y: s.y, kind: "stop", id: s.id } : null; }
  let dp = d.id ? depotById(d.id) : null;
  if (!dp) { dp = nearestDepot(vh.tile, depotKindOf(modelOf(vh)), vh.owner); }
  return dp ? { x: dp.x, y: dp.y, kind: "depot", id: dp.id } : null;
}
function nearestDepot(t, dk, owner) {
  dk = dk || "road"; owner = owner || "player"; const net = netFor(dk);
  let best = null, bd = 1e9;
  for (const d of S.depots) { if ((d.kind || "road") !== dk || (d.owner || "player") !== owner) continue; const dist = Math.abs(d.x - t.x) + Math.abs(d.y - t.y); if (dist < bd && net.connected(d, t)) { bd = dist; best = d; } }
  return best;
}

// One lane each way: only vehicles heading the same way block each other, and vehicles parked
// at a stop leave the road free. A stop tile takes two parked vehicles; more wait in line.
function roadCanEnter(vh, next, target) {
  const dx = next.x - vh.tile.x, dy = next.y - vh.tile.y;
  let same = 0, parked = 0, oncoming = 0, slowest = 1e9;
  for (const id of R.roads.vehiclesAt(next)) {
    if (id === vh.id) continue;
    const o = S.vehicles.find(v => v.id === id); if (!o) continue;
    if (o.state === "docked") { parked++; continue; }
    if (o.dir && o.dir.dx === dx && o.dir.dy === dy) { same++; slowest = Math.min(slowest, (modelOf(o) || { speedKmh: 0 }).speedKmh); }
    else if (o.dir && o.dir.dx === -dx && o.dir.dy === -dy) oncoming++;
  }
  // a faster vehicle may pull out and overtake when nothing is coming the other way
  const overtake = oncoming === 0 && !S.oneway[key(next.x, next.y)] && (modelOf(vh) || { speedKmh: 0 }).speedKmh > slowest;
  if (same >= (overtake ? 3 : 2)) return false;
  if (target && sameT(target, next) && R.stationAt.has(key(next.x, next.y)) && parked >= 2) return false;
  return true;
}
function tryStep(vh) {
  if (vh.stopped) { if (vh.state !== "docked") vh.state = "idle"; return; }
  if (isTrain(vh)) return trainStep(vh);
  if (isAir(vh)) return airStep(vh);
  const dest = destTile(vh);
  if (!dest) { vh.state = "idle"; return; }
  let target = dest;
  if (vh.bayFor !== dest.id) { vh.bay = null; vh.bayFor = dest.id; }
  if (dest.kind === "stop") { const st = stationById(dest.id); if (st && (st.kind === "dock" ? sameT(st.water, vh.tile) : stationTiles(st).some(t => sameT(t, vh.tile)))) { if (OR.arrive(vh.orders, { kind: "stop", id: st.id })) { vh.bay = null; dock(vh, dest); return; } } if (st) target = st.kind === "dock" ? st.water : bayFor(vh, st); }
  else if (vh.tile.x === dest.x && vh.tile.y === dest.y) {
    if (OR.arrive(vh.orders, { kind: dest.kind, id: dest.id })) { dock(vh, dest); return; }
  }
  const net = netOf(vh);
  const next = net.nextTile(vh.id, vh.tile, target);
  if (!next) { vh.state = "idle"; vh.wait++; if (vh.wait > 240) { vh.wait = 0; OR.skipOrder(vh.orders); } return; }
  if (net === R.sea ? !net.canEnter(vh.id, next) : !roadCanEnter(vh, next, target)) { vh.state = "idle"; return; }
  if (R.res.has(next.y * S.map.w + next.x)) { vh.state = "idle"; return; }   // barriers down: a train is coming
  net.moveVehicle(vh.id, vh.tile, next);
  vh.flow = vh.state === "idle" && vh.arrivedMoving;   // carried straight on from the last tile without stopping
  vh.pdir = vh.dir;
  vh.from = { x: vh.tile.x, y: vh.tile.y }; vh.to = next; vh.p = 0; vh.state = "moving"; vh.wait = 0;
  vh.dir = { dx: next.x - vh.tile.x, dy: next.y - vh.tile.y };
}

function dock(vh, dest) {
  vh.state = "docked"; vh.p = 0; vh.to = vh.tile;
  const m = modelOf(vh);
  if (dest.kind === "depot") { core.serviceVehicle(vh.core, m); vh.core.daysSinceService = 0; afterDepotVisit(vh); return; }
  const st = stationById(dest.id);
  if (!st) return;
  vh.trips = (vh.trips || 0) + 1;
  if (vh.loaded > 0 && vh.origin !== st.id && OR.shouldUnload(vh.orders) && acceptsAt(st, vh.cargo)) {
    const from = stationById(vh.origin) || st;
    const days = Math.max(0, S.totalDays - vh.loadDay);
    const raw = ST.payForDelivery(from, st, vh.cargo, vh.loaded, days, S.inflation);
    const mult = ((vh.cargo === "passengers" || vh.cargo === "mail") ? 1 : FREIGHT_BONUS) * (isTrainModel(m) ? TRAIN_BONUS : 1);
    const inc = Math.max(1, Math.round(raw * INCOME_SCALE * mult * (S.settings.income || 1)));
    const cat = isTrainModel(m) ? "incomeRail" : "incomeRoad";
    S.company.cash += inc; post(cat, inc); S.qIncome += inc;
    if (vh.cargo === "passengers") S.metrics.passengers += vh.loaded; else S.metrics.cargo += vh.loaded;
    S.metrics.quarterCargo += vh.loaded;
    if (vh.owner === "player") { vh.profit.thisYear += inc; vh.profit.lifetime += inc; floatText(st.x, st.y, "+" + money(inc)); if (inc > 40) sound.play("cash"); }
    else { const rv = S.rivals.find(r => r.ai.id === vh.owner); if (rv) { const route = rv.ai.routes.find(x => x.fromStation === from.id && x.toStation === st.id); if (route) AI.recordIncome(rv.ai, route.id, inc); else rv.ai.cash += inc; } }
    // deliver raw cargo to industries that use it
    for (const i of covered(st).inds) if ((CARGO_TO_IND[vh.cargo] || []).includes(i.kind)) { i.input[vh.cargo] = (i.input[vh.cargo] || 0) + vh.loaded; i.received = i.received || {}; i.received[vh.cargo] = (i.received[vh.cargo] || 0) + vh.loaded; break; }
    // food and water keep snow and desert towns growing
    if (vh.cargo === "food" || vh.cargo === "water") for (const tid of covered(st).towns) { const t = S.map.towns.find(x => x.id === tid); if (t && t.needs === vh.cargo) { t.fedDays = 120; t.got = (t.got || 0) + vh.loaded; } }
    vh.loaded = 0; vh.origin = null;
  }
}

function dailyVehicle(vh) {
  const m = modelOf(vh); if (!m) return;
  const r = core.tickVehicleDay(vh.core, m, () => rng() / Math.max(0.01, S.settings.breakdowns || 1));
  if (r === "broke" && isAir(vh)) aircraftEmergency(vh);
  else if (r === "broke") { vh.broken = true; if (vh.owner === "player") { EV.addNews(S.news, S.date, "bad", m.name + " has broken down.", { x: vh.tile.x, y: vh.tile.y }); sound.play("breakdown"); } }
  else if (r === "ok") vh.broken = false;
  if (vh.stopped) return;   // stopped vehicles cost nothing to run and do not load
  if (vh.owner === "player") {
    const c = core.vehicleRunningCostPerDay(m, S.inflation);
    S.company.cash -= c; post(isTrainModel(m) ? "runningRail" : "runningRoad", -c); vh.profit.thisYear -= c; vh.profit.lifetime -= c;
    if (vh.state !== "docked" && S.depots.some(d => (d.kind || "road") === depotKindOf(m))) {
      const dp = nearestDepot(vh.tile, depotKindOf(m), vh.owner);
      OR.maybeInsertService(vh.orders, core.needsService(vh.core), dp ? dp.id : undefined);
    }
  }
  if (vh.state === "docked") {
    const o = OR.currentOrder(vh.orders);
    if (o && o.kind === "stop") {
      const st = stationById(o.stationId);
      if (st && OR.shouldLoad(vh.orders)) {
        ST.recordPickup(st, vh.cargo, m.speedKmh, vh.core.ageDays / 365);
        if (vh.loaded === 0 || vh.origin === st.id) {
          // trains load a set amount per day for each platform tile they stand on
          const cap = isTrainModel(m) ? Math.max(1, platformTilesUnder(vh, st)) * 60 : Infinity;
          const want = Math.min(m.capacity - vh.loaded, cap);
          const got = ST.loadOnto(st, vh.cargo, want);
          if (got > 0) { if (vh.loaded === 0) { vh.origin = st.id; vh.loadDay = S.totalDays; } vh.loaded += got; }
          if (isTrainModel(m) && got > 0 && got >= cap && vh.loaded < m.capacity) vh.stillLoading = true; else vh.stillLoading = false;
        }
      }
    }
    if (vh.stillLoading) vh.stillLoading = false;
    else if (OR.tickDock(vh.orders, vh.loaded, m.capacity, 1) === "depart") { vh.state = "idle"; if (vh.owner === "player") departSound(vh); tryStep(vh); }
  }
}
function depotsExist() { return S.depots.length > 0; }

function moveVehicles(dtDays) {
  for (const vh of S.vehicles) {
    if (vh.broken || vh.stopped) continue;
    if (vh.state === "moving" && isAir(vh)) { airMove(vh, dtDays); continue; }
    if (vh.state === "moving") {
      const m = modelOf(vh); if (!m) continue;
      const tilesPerDay = m.speedKmh / 40 * netOf(vh).speedFactor(vh.from, vh.to, tractionOf(vh));
      vh.p += dtDays * tilesPerDay;
      let guard = 4;
      while (vh.p >= 1 && vh.state === "moving" && guard-- > 0) {
        vh.p -= 1; vh.tile = { x: vh.to.x, y: vh.to.y }; vh.state = "idle";
        if (isTrain(vh)) trainArrive(vh);
        const keep = vh.p; vh.arrivedMoving = true; tryStep(vh); vh.arrivedMoving = false; if (vh.state === "moving") vh.p = keep; else vh.p = 0;
      }
    } else if (vh.state === "idle") {
      // retry a few times a day of game time, so it behaves the same at any frame rate
      vh.idleT = (vh.idleT || 0) + dtDays;
      if (vh.idleT >= 0.2) { vh.idleT = 0; tryStep(vh); }
    }
  }
}

// ------------------------------------------------------------------ time ticks
function dailyTick() {
  const st = core.advanceDay(S.date);
  S.date = st.date; S.totalDays++;
  const m = S.map;
  for (const t of m.towns) {
    if (t.fedDays > 0) t.fedDays--;
    if (t.needs && !(t.fedDays > 0)) continue;   // snow and desert towns wait for food or water
    t._acc = (t._acc || 0) + S.settings.growth;
    while (t._acc >= 1) {
      t._acc -= 1;
      if (core.tickTownDay(t, rng)) {
        const g = mapgen.growTown(m, t.id, rng);
        if (g && g.kind === "road") R.roads.addRoad(g.x, g.y);
        if (g) { const b = t.buildings[t.buildings.length - 1]; if (g.kind === "house" && b) R.bld.set(b.y * m.w + b.x, b); }
      }
    }
  }
  for (const s of S.stations) ST.tickStationDay(s);
  adsDaily();
  for (const vh of S.vehicles.slice()) dailyVehicle(vh);
  if (st.newMonth) monthlyTick();
  if (st.newQuarter) quarterlyTick();
  if (st.newYear) yearlyTick();
}

function companyValue() {
  const vv = playerVehicles().map(v => saleValue(v));
  return Math.round(S.company.cash - S.company.loan + vv.reduce((a, b) => a + b, 0) + S.stations.filter(s => s.owner === "player").length * 500);
}
function townsConnected() {
  const set = new Set();
  for (const vh of playerVehicles()) for (const o of vh.orders.orders) if (o.kind === "stop") { const s = stationById(o.stationId); if (s) covered(s).towns.forEach(t => set.add(t)); }
  return set.size;
}
function metricsNow() {
  return { passengers: S.metrics.passengers, cargo: S.metrics.cargo, cash: S.company.cash, companyValue: companyValue(), townsConnected: townsConnected(), vehicles: playerVehicles().length, yearlyProfit: S.monthNet.slice(-12).reduce((a, b) => a + b, 0) };
}

function monthlyTick() {
  ageWarnings();
  townMonthly();
  const m = S.map;
  const before = S.company.cash;
  for (const i of m.industries) { core.tickIndustryMonth(i, rng); industryBonusOutput(i); }
  industryMonth();
  for (const i of m.industries) { const r = serviceRatingOf(i.id); if (CARGO_FROM_IND[i.kind] && ["coalMine", "forest", "farm"].includes(i.kind)) core.serviceBonus(i, r, rng); }
  ST.monthlyCargo(S.stations, m.towns, m.industries, rng, PASSENGER_OUTPUT);
  ST.decayWaiting(S.stations);
  ST.updateTownActivity(m.towns, S.stations);
  const interest = core.chargeMonthlyInterest(S.company); post("interest", -interest);
  // rival upkeep
  for (const rv of S.rivals) {
    const fleet = S.vehicles.filter(v => v.owner === rv.ai.id);
    rv.ai.cash -= fleet.reduce((a, v) => a + (modelOf(v) ? modelOf(v).runningCostPerYear / 12 : 0), 0);
  }
  // events
  const actions = EV.rollMonthlyEvents({ date: S.date, startYear: S.startYear, inflation: S.inflation, interestRate: S.company.interestRate, towns: m.towns, industries: m.industries, serviceRating: serviceRatingOf }, S.evState, S.news, rng);
  for (const a of actions) {
    if (a.kind === "setProduction") { const i = m.industries.find(x => x.id === a.industryId); if (i) i.productionPerMonth = a.value; }
    if (a.kind === "closeIndustry") removeIndustry(a.industryId);
    if (a.kind === "openIndustry") { const ck = mapgen.CLIMATE_INDUSTRIES[S.cfg.climate] || []; if (!ck.includes(a.industryKind)) a.industryKind = ck.filter(k => k !== "oilRig")[Math.floor(rng() * Math.max(1, ck.length - 1))]; const near = rng() < 0.4 ? a.near : { x: 8 + Math.floor(rng() * (m.w - 16)), y: 8 + Math.floor(rng() * (m.h - 16)) };   // anywhere on the map, not only by towns
      const s = mapgen.addIndustry(m, a.industryKind, rng, near) || mapgen.addIndustry(m, a.industryKind, rng, a.near); if (s) { const ni = m.industries[m.industries.length - 1]; if (PRIMARY.includes(ni.kind)) ni.productionPerMonth *= PRIMARY_OUTPUT; ni.level = 1; rebuildLookups(); EV.addNews(S.news, S.date, "info", ni.name + " has opened.", { x: ni.x, y: ni.y }); } }
    if (a.kind === "setInterestRate") S.company.interestRate = a.value;
  }
  const reward = EV.checkObjectives(S.objectives, metricsNow(), S.date, S.news);
  if (reward) { S.company.cash += reward; post("other", reward); sound.play("cash"); }
  scenarioCheck();
  // rivals whose start date has come
  const nowM = S.date.year * 12 + S.date.month;
  for (const q of (S.rivalQueue || []).filter(q => nowM >= q.at)) { const rv = addRival(q.i); EV.addNews(S.news, S.date, "info", rv.ai.name + " has started up and will compete with you."); }
  if (S.rivalQueue) S.rivalQueue = S.rivalQueue.filter(q => nowM < q.at);
  // rivals plan
  const ends = mapgen.toEndpoints(m);
  for (const rv of S.rivals) {
    const log = AI.tickAiMonth(rv.ai, aiApi(rv), ends, S.date.year, rng);
    for (const line of log) EV.addNews(S.news, S.date, "info", line);
    rivalRailMonth(rv);
    rivalSeaAirMonth(rv);
  }
  let inc = 0, exp = 0; for (const k of Object.keys(S.acc)) { if (S.acc[k] > 0) inc += S.acc[k]; else exp -= S.acc[k]; }
  monthIncomeTrack(inc, exp);
  flushLedger();
  S.monthNet.push(Math.round(S.company.cash - before)); if (S.monthNet.length > 24) S.monthNet.shift();
  S.history.push({ year: S.date.year, month: S.date.month, income: S.lastIncome || 0, expenses: S.lastExpenses || 0, cash: Math.round(S.company.cash), loan: S.company.loan, cargoDelivered: S.metrics.cargo + S.metrics.passengers, vehicles: playerVehicles().length, companyValue: companyValue() });
  if (S.history.length > 240) S.history.shift();
}
function addRival(i) {
  const rv = { ai: AI.createAi(i, Math.round(S.settings.startingCash * S.inflation), 0.4 + 0.2 * (i % 3)), color: RIVAL_COLORS[i % 4] };
  S.rivals.push(rv); return rv;
}
function monthIncomeTrack(inc, exp) { S.lastIncome = inc; S.lastExpenses = exp; }

function quarterlyTick() {
  S.quarterlyIncome.push(S.qIncome); if (S.quarterlyIncome.length > 4) S.quarterlyIncome.shift(); S.qIncome = 0; S.metrics.quarterCargo = 0;
  const b = core.checkBankruptcy(S.company); S.bank = b;
  if (b === "warning") EV.addNews(S.news, S.date, "bad", "Warning: your company is running at a loss.");
  if (b === "bankrupt") { EV.addNews(S.news, S.date, "bad", "Your company has gone bankrupt."); sound.play("crash"); endGame("bankrupt"); }
}
function yearlyTick() {
  if (S.settings.inflation) S.inflation = core.nextInflation(S.inflation);
  S.company.maxLoan = Math.round(S.settings.maxLoan * S.inflation / 10000) * 10000;
  for (const v of S.vehicles) { v.profit.lastYear = v.profit.thisYear; v.profit.thisYear = 0; }
  EV.addNews(S.news, S.date, "info", "New year " + S.date.year + ". New vehicle models may be available.");
  if (S.retireYear && S.date.year >= S.retireYear) endGame("retired");
  sound.play("newYear");
}
function removeIndustry(id) {
  const m = S.map, i = m.industries.findIndex(x => x.id === id); if (i < 0) return;
  const ind = m.industries[i];
  for (let y = ind.y - 1; y <= ind.y + 1; y++) for (let x = ind.x - 1; x <= ind.x + 1; x++) m.occupied[y * m.w + x] = 0;
  m.industries.splice(i, 1); rebuildLookups();
}

// -------------------------------------------------------------------- building
// Compass direction from the town centre, as seen on screen (north is up).
function compassFrom(t, x, y) {
  const ex = (x - t.x) - (y - t.y), sy = (x - t.x) + (y - t.y);   // screen right, screen down
  if (Math.hypot(ex, sy) < 4) return "Central";
  const a = Math.atan2(-sy, ex), k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return ["East", "North East", "North", "North West", "West", "South West", "South", "South East"][k];
}
// Station names never repeat. A second station of the same kind in a town is named by its
// direction from the centre, e.g. "Oakwood North Dock".
const STATION_SUFFIX = { busStop: "", truckStop: " Freight", trainStation: " Station", dock: " Dock", airport: " Airport" };
function nameStation(kind, x, y) {
  const t = townOf(x, y), suf = STATION_SUFFIX[kind] != null ? STATION_SUFFIX[kind] : "", dir = compassFrom(t, x, y);
  const taken = new Set(S.stations.map(s => s.name));
  const cands = kind === "busStop" ? [t.name + " " + dir] : [t.name + suf, t.name + " " + dir + suf];
  if (kind === "busStop") for (const b of ["Market", "Park", "Church", "Hill", "Bridge", "Square"]) cands.push(t.name + " " + dir + " " + b);
  for (const c of cands) if (!taken.has(c)) return c;
  for (let n = 2; ; n++) { const c = t.name + " " + dir + suf + " " + n; if (!taken.has(c)) return c; }
}
// A road and a railway may only cross at right angles, one tile at a time: the existing line must
// be straight there, the new one must run across it, and the tiles before and after must be clear of
// the other line. `along` is the axis the new line runs on ("x", "y", "corner") when known.
function crossOk(x, y, other, mine, along, what, over) {
  const has = (n, dx, dy) => inB(x + dx, y + dy) && n.hasRoad(x + dx, y + dy);
  const ox = has(other, 1, 0) || has(other, -1, 0), oy = has(other, 0, 1) || has(other, 0, -1);
  const no = what + " can only cross " + over + " at a right angle, one tile at a time.";
  if (along === "corner") return no;
  if (ox && oy) return what + " can only cross a straight " + over.replace(/^an? /, "") + ".";
  const oAxis = ox ? "x" : oy ? "y" : null, axis = along || (oAxis ? (oAxis === "x" ? "y" : "x") : null);
  if (oAxis && axis === oAxis) return no;
  if (oAxis && (oAxis === "x" ? has(mine, 1, 0) || has(mine, -1, 0) : has(mine, 0, 1) || has(mine, 0, -1))) return no;
  if (axis && (axis === "x" ? has(other, 1, 0) || has(other, -1, 0) : has(other, 0, 1) || has(other, 0, -1))) return no;
  return "";
}
function canBuildRoadOn(x, y, along) {
  const m = S.map, i = key(x, y);
  if (!inB(x, y) || m.water[i]) return "Cannot build on water. Use the Bridge tool from a road end.";
  if (R.roads.hasRoad(x, y)) return "exists";
  if (R.rail.hasRoad(x, y)) return R.stationAt.has(i) || R.depotAt.has(i) ? "A station or depot is in the way." : S.spans[i] ? "A road cannot cross a rail bridge or tunnel." : crossOk(x, y, R.rail, R.roads, along, "A road", "a railway");
  if (m.occupied[i]) return "Something is built here.";
  return "";
}
function buildRoadTile(x, y, ownerPays = true, along) {
  const why = canBuildRoadOn(x, y, along);
  if (why === "exists") return { ok: true, cost: 0 };
  if (why) return { ok: false, reason: why };
  const i = key(x, y);
  let c = cost(ROAD_COST) + (S.map.forest[i] ? cost(CLEAR_TREE) : 0) + (R.rail.hasRoad(x, y) ? cost(CROSSING_EXTRA) : 0);
  if (ownerPays) { const no = councilRefuses(x, y); if (no) return { ok: false, reason: no }; if (S.company.cash < c) return { ok: false, reason: "Not enough money." }; spend("construction", c); if (S.map.forest[i]) treeCut(x, y); S.stats = S.stats || { roads: 0 }; S.stats.roads++; }
  S.map.forest[i] = 0; S.map.occupied[i] = 1; R.roads.addRoad(x, y);
  return { ok: true, cost: c };
}
function canBuildTrackOn(x, y, along) {
  const m = S.map, i = key(x, y);
  if (!inB(x, y) || m.water[i]) return "Cannot build track on water. Use the Bridge tool from a track end.";
  if (R.rail.hasRoad(x, y)) return "exists";
  if (R.roads.hasRoad(x, y)) return R.stationAt.has(i) || R.depotAt.has(i) ? "A stop or depot is in the way." : S.spans[i] ? "Track cannot cross a road bridge or tunnel." : crossOk(x, y, R.roads, R.rail, along, "Track", "a road");
  if (m.occupied[i]) return "Something is built here.";
  return "";
}
function buildTrackTile(x, y, ownerPays = true, along) {
  const why = canBuildTrackOn(x, y, along);
  if (why === "exists") return { ok: true, cost: 0 };
  if (why) return { ok: false, reason: why };
  const i = key(x, y);
  const c = cost(TRACK_COST) + (S.map.forest[i] ? cost(CLEAR_TREE) : 0) + (R.roads.hasRoad(x, y) ? cost(CROSSING_EXTRA) : 0);
  if (ownerPays) { const no = councilRefuses(x, y); if (no) return { ok: false, reason: no }; if (S.company.cash < c) return { ok: false, reason: "Not enough money." }; spend("construction", c); if (S.map.forest[i]) treeCut(x, y); }
  S.map.forest[i] = 0; S.map.occupied[i] = 1; R.rail.addRoad(x, y);
  return { ok: true, cost: c };
}
function placeStation(x, y, kind, owner) {
  const rail = kind === "trainStation";
  if (!netFor(rail ? "rail" : "road").hasRoad(x, y)) return { ok: false, reason: rail ? "Build a train station on a track tile." : "Build a stop on a road tile." };
  if (R.stationAt.has(key(x, y)) || R.depotAt.has(key(x, y))) return { ok: false, reason: "There is already a building here." };
  if (rail && railOwnerOf(key(x, y)) !== owner) return { ok: false, reason: "That track belongs to another company." };
  const c = cost(rail ? RAIL_STATION_COST : STATION_COST);
  if (owner === "player") { const no = councilRefuses(x, y); if (no) return { ok: false, reason: no }; if (S.company.cash < c) return { ok: false, reason: "Not enough money." }; spend("construction", c); }
  const join = owner === "player" ? stationNeighbour(x, y, kind, owner) : null;
  if (join) {
    if (!join.tiles) join.tiles = [{ x: join.x, y: join.y }];
    join.tiles.push({ x, y }); R.stationAt.set(key(x, y), join);
    return { ok: true, station: join, cost: c, joined: true, tile: { x, y } };
  }
  const s = ST.newStation("s" + (++S.ids.s), nameStation(kind, x, y), kind, x, y);
  s.owner = owner; s.tiles = [{ x, y }]; S.stations.push(s); R.stationAt.set(key(x, y), s);
  return { ok: true, station: s, cost: c, tile: { x, y } };
}
function placeDepot(x, y, dk, owner) {
  dk = dk || "road"; owner = owner || "player";
  let link = null;   // a depot can also go on empty land next to a road or track; a short piece is laid to join it
  if (!netFor(dk).hasRoad(x, y)) {
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find(n => inB(n.x, n.y) && netFor(dk).hasRoad(n.x, n.y) && !R.depotAt.has(key(n.x, n.y)) && (dk !== "rail" || railOwnerOf(key(n.x, n.y)) === owner));
    if (!near) return { ok: false, reason: dk === "rail" ? "Build a train depot on or next to your track." : "Build a depot on or next to a road." };
    const why = dk === "rail" ? canBuildTrackOn(x, y) : canBuildRoadOn(x, y);
    if (why) return { ok: false, reason: why };
    link = near;
  }
  if (R.stationAt.has(key(x, y)) || R.depotAt.has(key(x, y))) return { ok: false, reason: "There is already a building here." };
  if (dk === "rail" && railOwnerOf(key(x, y)) !== owner) return { ok: false, reason: "That track belongs to another company." };
  const c = cost(dk === "rail" ? RAIL_DEPOT_COST : DEPOT_COST);
  const extra = link ? cost(dk === "rail" ? TRACK_COST : ROAD_COST) + (S.map.forest[key(x, y)] ? cost(CLEAR_TREE) : 0) : 0;
  if (owner === "player") { const no = councilRefuses(x, y); if (no) return { ok: false, reason: no }; if (S.company.cash < c + extra) return { ok: false, reason: "Not enough money." }; }
  if (link) { const r = dk === "rail" ? buildTrackTile(x, y, owner === "player") : buildRoadTile(x, y, owner === "player"); if (!r.ok) return r; if (dk === "rail" && owner !== "player") { if (!S.railOwner) S.railOwner = {}; S.railOwner[key(x, y)] = owner; } }
  if (owner === "player") spend("construction", c);
  const d = { id: "d" + (++S.ids.d), name: townOf(x, y).name + (dk === "rail" ? " Train Depot" : " Depot"), x, y, kind: dk, owner };
  S.depots.push(d); R.depotAt.set(key(x, y), d);
  return { ok: true, depot: d, cost: c };
}
function removeStationTile(st, x, y) {
  R.stationAt.delete(key(x, y));
  st.tiles = stationTiles(st).filter(t => !(t.x === x && t.y === y));
  if (!st.tiles.length) { S.stations = S.stations.filter(s => s !== st); for (const v of S.vehicles) OR.dropStation(v.orders, st.id); return; }
  if (st.x === x && st.y === y) { st.x = st.tiles[0].x; st.y = st.tiles[0].y; }
}
function bulldoze(x, y) {
  const m = S.map, i = key(x, y);
  const st = R.stationAt.get(i), dp = R.depotAt.get(i);
  if ((st && st.owner !== "player") || (dp && (dp.owner || "player") !== "player")) return { ok: false, reason: "That belongs to another company." };
  if (!st && !dp && R.rail.hasRoad(x, y) && railOwnerOf(i) !== "player") return { ok: false, reason: "That track belongs to another company." };
  // A stop or depot comes off first; the road or track under it stays until the next tap.
  if (st || dp) {
    const c = cost(BULLDOZE);
    if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
    spend("construction", c);
    if (st) removeStationTile(st, x, y);
    if (dp) { S.depots = S.depots.filter(d => d !== dp); R.depotAt.delete(i); }
    return { ok: true, removed: st ? "station" : "depot" };
  }
  if (R.roads.hasRoad(x, y) && !R.rail.hasRoad(x, y)) {
    const c = cost(BULLDOZE);
    if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
    spend("construction", c);
    R.roads.removeRoad(x, y); roadRemoved(x, y);
    const sp = S.spans[i]; if (sp) delete S.spans[i];
    if (!sp || sp.kind === "tunnel") m.occupied[i] = 0; else if (!m.water[i]) m.occupied[i] = 0; else m.occupied[i] = 0;
    for (const v of S.vehicles.slice()) if (!isTrain(v) && (v.tile.x === x && v.tile.y === y || (v.state === "moving" && v.to.x === x && v.to.y === y))) removeVehicle(v);
    return { ok: true };
  }
  if (R.rail.hasRoad(x, y)) {
    const c = cost(BULLDOZE);
    if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
    spend("construction", c);
    R.rail.removeRoad(x, y); delete S.signals[i]; delete S.elec[i];
    const road = R.roads.hasRoad(x, y);
    if (!road) { const sp = S.spans[i]; if (sp) delete S.spans[i]; m.occupied[i] = 0; }
    for (const v of S.vehicles.slice()) if (isTrain(v) && trainTiles(v).some(t => t.x === x && t.y === y)) removeVehicle(v);
    return { ok: true };
  }
  // houses and other town buildings
  const b = R.bld.get(i);
  if (b) {
    const t = S.map.towns.find(tt => tt.buildings.includes(b)), floors = b.floors || 1, c = cost(250 + 150 * floors);
    if (S.company.cash < c) return { ok: false, reason: "Not enough money. Demolishing this costs " + money(c) + "." };
    if (t && townRating(t) < -400) return { ok: false, reason: "The " + t.name + " council will not allow it. Improve your rating first." };
    spend("construction", c);
    if (t) { t.buildings = t.buildings.filter(x => x !== b); t.population = Math.max(60, t.population - floors * 9); bumpRating(t, -60); }
    R.bld.delete(i); m.occupied[i] = 0;
    return { ok: true, removed: "building", cost: c };
  }
  // trees
  if (m.forest[i] && !m.occupied[i] && !R.indAt.has(i)) {
    const c = cost(CLEAR_TREE);
    if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
    spend("construction", c); treeCut(x, y); m.forest[i] = 0;
    return { ok: true, removed: "tree", cost: c };
  }
  return { ok: false, reason: "Nothing to remove here." };
}
function buildCrossing(x, y) {
  const net = R.roads.hasRoad(x, y) ? R.roads : R.rail.hasRoad(x, y) ? R.rail : null;
  if (!net) return { ok: false, reason: "Tap the last road or track tile before the water or hill." };
  const spans = terrain.findCrossing(S.map, x, y, S.inflation * S.settings.cost);
  if (!spans.length) return { ok: false, reason: "No bridge or tunnel possible from here (needs the same height on the far side, max 10 tiles)." };
  const sp = spans.sort((a, b) => a.cost - b.cost)[0];
  if (S.company.cash < sp.cost) return { ok: false, reason: "A " + sp.kind + " here costs " + money(sp.cost) + ". Not enough money." };
  const dx = Math.sign(sp.endX - x), dy = Math.sign(sp.endY - y), h0 = S.map.height[key(x, y)];
  spend("construction", sp.cost);
  const added = [];
  for (let k = 1; k <= sp.length + 1; k++) {
    const tx = x + dx * k, ty = y + dy * k, i = key(tx, ty);
    if (k <= sp.length) S.spans[i] = { kind: sp.kind, h: h0 };
    if (!net.hasRoad(tx, ty)) added.push({ x: tx, y: ty });
    S.map.occupied[i] = 1; net.addRoad(tx, ty);
  }
  sound.play("build");
  return { ok: true, span: sp, added, net: net === R.roads ? "road" : "rail" };
}

// ---------------------------------------------------------------------- rivals
function aiApi(rv) {
  const m = S.map;
  const indTiles = new Set();
  for (const i of m.industries) for (let y = i.y - 1; y <= i.y + 1; y++) for (let x = i.x - 1; x <= i.x + 1; x++) indTiles.add(y * m.w + x);
  return {
    width: m.w, height: m.h,
    tileCost(x, y) {
      const i = y * m.w + x;
      if (m.water[i]) return null;
      if (R.roads.hasRoad(x, y)) return 1;
      if (m.occupied[i] && !indTiles.has(i)) return null;
      return 8 + (m.forest[i] ? 3 : 0);
    },
    buildRoad(owner, path) {
      let n = 0;
      for (const p of path) { const i = p.y * m.w + p.x; if (!R.roads.hasRoad(p.x, p.y)) { m.forest[i] = 0; m.occupied[i] = 1; R.roads.addRoad(p.x, p.y); n++; } }
      return n * Math.round(ROAD_COST * S.inflation);
    },
    buildStation(owner, x, y) {
      const ex = R.stationAt.get(y * m.w + x); if (ex) return { id: ex.id, cost: 0 };
      const isTown = m.towns.some(t => t.x === x && t.y === y);
      const r = placeStation(x, y, isTown ? "busStop" : "truckStop", rv.ai.id);
      return r.ok ? { id: r.station.id, cost: r.cost } : null;
    },
    buyVehicle(owner, modelId, from, to) {
      const mod = V.getModel(modelId); if (!mod) return null;
      if (vehiclePrice(mod) > rv.ai.cash) return null;
      const s = stationById(from); if (!s) return null;
      const vh = makeVehicle(rv.ai.id, modelId, s, [from, to]);
      vh.cargo = mod.cargo; vh.core.breakdownsEnabled = false;
      return vehiclePrice(mod);
    },
  };
}
