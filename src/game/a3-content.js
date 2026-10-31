// ---------------------------------------------------------------- climates
// Which cargo exists in this game, and how towns in snow or desert depend on deliveries.
function climateCargos() {
  const kinds = (mapgen.CLIMATE_INDUSTRIES[S && S.cfg ? S.cfg.climate : "temperate"]) || mapgen.CLIMATE_INDUSTRIES.temperate;
  const set = new Set(["passengers", "mail"]);
  for (const k of kinds) { const ch = core.CHAINS[k]; if (ch && ch.out) set.add(ch.out); }   // only cargo something here produces
  return [...set];
}
// What an industry takes in this climate: a factory takes rubber only where rubber is grown.
function inputsHere(kind) { const ch = core.CHAINS[kind] || {}, have = climateCargos(); return (ch.in || []).filter(c => have.includes(c)); }
function cargoUse(c) {
  if (CARGO_USE[c]) return CARGO_USE[c];
  const kinds = (mapgen.CLIMATE_INDUSTRIES[S.cfg.climate] || []);
  const from = kinds.filter(k => CARGO_FROM_IND[k] === c).map(k => mapgen.INDUSTRY_LABELS[k].toLowerCase());
  const to = kinds.filter(k => (CARGO_TO_IND[c] || []).includes(k)).map(k => mapgen.INDUSTRY_LABELS[k].toLowerCase());
  if (core.TOWN_CARGO.includes(c)) to.push(c === "gold" || c === "diamonds" ? "banks in big towns" : "towns");
  const name = (core.CARGO[c] && core.CARGO[c].label) || c;
  return name + ": " + (from.join(" or ") || "towns") + " to " + (to.join(" or ") || "towns");
}
function townNeedsText(t) {
  if (!t.needs) return "";
  return (t.fedDays > 0 ? "Gets " + t.needs + " and can grow" : "Needs " + t.needs + " delivered to grow");
}

// ---------------------------------------------------------------- vehicle kinds
function isShipModel(m) { return !!m && m.type === "ship"; }
function isAirModel(m) { return !!m && m.type === "aircraft"; }
function isShip(vh) { return isShipModel(modelOf(vh)); }
function isAir(vh) { return isAirModel(modelOf(vh)); }
function isJet(m) { return isAirModel(m) && m.speedKmh >= 500; }
const ANYWHERE = { connected: () => true, hasRoad: () => true, removeVehicle() {}, moveVehicle() {} };

// ---------------------------------------------------------------- water
function rebuildSea() {
  const m = S.map; R.sea = new roadnet.RoadNetwork(null, 4); R.sea.turnCost = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    if (m.water[i] && (!m.occupied[i] || R.depotAt.has(i) || (S.spans[i] && S.spans[i].kind === "bridge"))) R.sea.addRoad(x, y);
  }
  for (const s of S.stations) if (s.kind === "dock" && s.water) R.sea.addRoad(s.water.x, s.water.y);
}
function waterNeighbour(x, y) {
  for (const [dx, dy] of DIR4) { const nx = x + dx, ny = y + dy; if (inB(nx, ny) && S.map.water[key(nx, ny)] && !S.map.occupied[key(nx, ny)]) return { x: nx, y: ny }; }
  return null;
}
function landNeighbour(x, y) { for (const [dx, dy] of DIR4) { const nx = x + dx, ny = y + dy; if (inB(nx, ny) && !S.map.water[key(nx, ny)]) return true; } return false; }

// Oil rigs come with their own dock that any company may use.
function makeRigDocks() {
  for (const i of S.map.industries) {
    if (i.kind !== "oilRig" || S.stations.some(s => s.rigId === i.id)) continue;
    const w = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => ({ x: i.x + dx, y: i.y + dy })).find(t => inB(t.x, t.y) && S.map.water[key(t.x, t.y)]);
    if (!w) continue;
    const s = ST.newStation("s" + (++S.ids.s), i.name, "dock", i.x, i.y);
    s.owner = "public"; s.rigId = i.id; s.water = w; s.tiles = [{ x: i.x, y: i.y }];
    S.stations.push(s);
  }
}

// ---------------------------------------------------------------- docks and shipyards
// Size of the open water a tile belongs to (counted up to a limit), so a dock faces the lake, not a pond.
function waterReach(t, limit) {
  const seen = new Set([key(t.x, t.y)]), q = [t];
  for (let n = 0; n < q.length && seen.size < limit; n++) for (const [dx, dy] of DIR4) { const nx = q[n].x + dx, ny = q[n].y + dy, k = key(nx, ny); if (inB(nx, ny) && !seen.has(k) && R.sea.hasRoad(nx, ny)) { seen.add(k); q.push({ x: nx, y: ny }); } }
  return seen.size;
}
function freeShore(x, y) { const k = key(x, y); return inB(x, y) && !S.map.water[k] && !S.map.occupied[k] && !R.roads.hasRoad(x, y) && !R.rail.hasRoad(x, y); }
function placeDock(x, y, owner) {
  owner = owner || "player"; let i = key(x, y); const m = S.map;
  let w = null;
  if (inB(x, y) && m.water[i]) {
    // tapped the water: put the dock on the free shore tile next to it
    if (m.occupied[i]) return { ok: false, reason: "Something is built here." };
    const land = DIR4.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find(t => freeShore(t.x, t.y));
    if (!land) return { ok: false, reason: "Build a dock on the shore, next to water." };
    w = { x, y }; x = land.x; y = land.y; i = key(x, y);
  }
  if (!inB(x, y)) return { ok: false, reason: "Build a dock on the shore, next to water." };
  if (m.occupied[i] || R.roads.hasRoad(x, y) || R.rail.hasRoad(x, y)) return { ok: false, reason: "Something is built here." };
  if (!w) { const opts = DIR4.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter(t => inB(t.x, t.y) && m.water[key(t.x, t.y)] && !m.occupied[key(t.x, t.y)]); w = opts.sort((a, b) => waterReach(b, 3000) - waterReach(a, 3000))[0] || null; }
  if (!w) return { ok: false, reason: "A dock needs open water next to it." };
  const no = owner === "player" ? councilRefuses(x, y) : ""; if (no) return { ok: false, reason: no };
  const c = cost(2400); if (owner === "player") { if (S.company.cash < c) return { ok: false, reason: "Not enough money." }; spend("construction", c); }
  if (m.forest[i]) m.forest[i] = 0;
  const s = ST.newStation("s" + (++S.ids.s), nameStation("dock", x, y), "dock", x, y);
  s.owner = owner; s.water = w; s.tiles = [{ x, y }];
  S.stations.push(s); R.stationAt.set(i, s); m.occupied[i] = 1; m.forest[i] = 0; R.sea.addRoad(w.x, w.y);
  return { ok: true, station: s, cost: c, tile: { x, y } };
}
function placeShipyard(x, y, owner) {
  owner = owner || "player";
  const i = key(x, y), m = S.map;
  if (!inB(x, y) || !m.water[i] || m.occupied[i]) return { ok: false, reason: "Build a shipyard on open water next to the shore." };
  if (!landNeighbour(x, y)) return { ok: false, reason: "A shipyard must touch the shore." };
  const c = cost(3500);
  if (owner === "player") { if (S.company.cash < c) return { ok: false, reason: "Not enough money." }; spend("construction", c); }
  const d = { id: "d" + (++S.ids.d), name: townOf(x, y).name + " Shipyard", x, y, kind: "ship", owner };
  S.depots.push(d); R.depotAt.set(i, d); m.occupied[i] = 1;
  return { ok: true, depot: d, cost: c };
}

// ---------------------------------------------------------------- airports
const AIRPORTS = { small: { size: 2, cost: 9000, year: 1950, label: "Small airport" }, large: { size: 3, cost: 22000, year: 1965, label: "City airport" } };
function placeAirport(x, y, type, owner) {
  owner = owner || "player"; const a = AIRPORTS[type], m = S.map;
  if (S.date.year < a.year) return { ok: false, reason: a.label + "s are available from " + a.year + "." };
  let h = null;
  for (let dy = 0; dy < a.size; dy++) for (let dx = 0; dx < a.size; dx++) {
    const tx = x + dx, ty = y + dy, i = key(tx, ty);
    if (!inB(tx, ty) || m.water[i] || m.occupied[i] || R.roads.hasRoad(tx, ty) || R.rail.hasRoad(tx, ty)) return { ok: false, reason: "An airport needs " + a.size + " x " + a.size + " clear land." };
    if (h === null) h = m.height[i]; else if (m.height[i] !== h) return { ok: false, reason: "The land must be flat. Use Raise or Lower first." };
  }
  const no = owner === "player" ? councilRefuses(x, y) : ""; if (no) return { ok: false, reason: no };
  const c = cost(a.cost); if (owner === "player") { if (S.company.cash < c) return { ok: false, reason: "Not enough money." }; spend("construction", c); }
  const s = ST.newStation("s" + (++S.ids.s), nameStation("airport", x, y), "airport", x, y);
  s.owner = owner; s.size = type; s.tiles = [];
  for (let dy = 0; dy < a.size; dy++) for (let dx = 0; dx < a.size; dx++) { const t = { x: x + dx, y: y + dy }; s.tiles.push(t); R.stationAt.set(key(t.x, t.y), s); m.occupied[key(t.x, t.y)] = 1; m.forest[key(t.x, t.y)] = 0; }
  S.stations.push(s);
  // every airport has a hangar to buy and service aircraft
  S.depots.push({ id: "d" + (++S.ids.d), name: s.name + " Hangar", x, y, kind: "air", owner, airport: s.id });
  return { ok: true, station: s, cost: c };
}
function airportCentre(s) { const n = (AIRPORTS[s.size] || AIRPORTS.small).size; return { x: s.x + (n - 1) / 2, y: s.y + (n - 1) / 2 }; }
function canUseStation(m, s) {
  if (s.kind === "airport" && isJet(m) && s.size !== "large") return false;
  return true;
}

// Aircraft fly in a straight line between airports.
function airStep(vh) {
  const dest = destTile(vh); if (!dest) { vh.state = "idle"; return; }
  const st = dest.kind === "stop" ? stationById(dest.id) : stationById((depotById(dest.id) || {}).airport);
  if (!st) { vh.state = "idle"; return; }
  if (vh.at === st.id) {
    if (dest.kind === "depot") { if (OR.arrive(vh.orders, { kind: "depot", id: dest.id })) { vh.emergency = false; dock(vh, dest); return; } }
    else if (OR.arrive(vh.orders, { kind: "stop", id: st.id })) { core.serviceVehicle(vh.core, modelOf(vh)); dock(vh, dest); return; }
  }
  const c = airportCentre(st), here = vh.pos || { x: vh.tile.x, y: vh.tile.y };
  vh.from = { x: here.x, y: here.y }; vh.to = { x: c.x, y: c.y }; vh.p = 0; vh.state = "moving"; vh.at = null; vh.goal = st.id;
  vh.flightLen = Math.max(1, Math.hypot(c.x - here.x, c.y - here.y));
  vh.dir = { dx: Math.sign(Math.round(c.x - here.x)), dy: Math.sign(Math.round(c.y - here.y)) };
}
// A plane that breaks down does not stop in the air: it slows and lands at the nearest airport.
function aircraftEmergency(vh) {
  const here = vh.state === "moving" ? { x: vh.from.x + (vh.to.x - vh.from.x) * vh.p, y: vh.from.y + (vh.to.y - vh.from.y) * vh.p } : (vh.pos || vh.tile);
  let best = null, bd = 1e9;
  for (const s of S.stations) if (s.kind === "airport" && s.owner === vh.owner && canUseStation(modelOf(vh), s)) { const c = airportCentre(s), d = Math.hypot(c.x - here.x, c.y - here.y); if (d < bd) { bd = d; best = s; } }
  if (!best) return;
  const hangar = S.depots.find(d => d.airport === best.id); if (!hangar) return;
  vh.orders.orders.splice(vh.orders.current, 0, { kind: "depot", depotId: hangar.id, temp: true }); vh.orders.phase = "travelling";
  vh.emergency = true; vh.broken = false;
  if (vh.state === "moving") { vh.pos = here; vh.tile = { x: Math.round(here.x), y: Math.round(here.y) }; vh.state = "idle"; vh.at = null; airStep(vh); }
  if (vh.owner === "player") { EV.addNews(S.news, S.date, "bad", modelOf(vh).name + " #" + vh.id.slice(1) + " has an engine fault and is landing at " + best.name + ".", { x: best.x, y: best.y }); sound.play("breakdown"); }
}
function airMove(vh, dtDays) {
  const m = modelOf(vh); if (!m) return;
  vh.p += dtDays * (m.speedKmh / 40) * (vh.emergency ? 0.5 : 1) / vh.flightLen;
  if (vh.p >= 1) { vh.pos = { x: vh.to.x, y: vh.to.y }; vh.tile = { x: Math.round(vh.to.x), y: Math.round(vh.to.y) }; vh.from = vh.to; vh.p = 0; vh.state = "idle"; vh.at = vh.goal; tryStep(vh); }
}

// ---------------------------------------------------------------- one-way roads
function roadAxis(x, y) {
  const has = (a, b) => inB(a, b) && R.roads.hasRoad(a, b);
  const xs = has(x + 1, y) || has(x - 1, y), ys = has(x, y + 1) || has(x, y - 1);
  if (xs && ys) return null;
  return ys ? "y" : "x";
}
function cycleOneWay(x, y) {
  const k = key(x, y);
  if (!R.roads.hasRoad(x, y)) return { ok: false, reason: "One-way signs go on roads." };
  if (R.stationAt.has(k) || R.depotAt.has(k) || R.rail.hasRoad(x, y)) return { ok: false, reason: "Not on stops, depots or crossings." };
  const ax = roadAxis(x, y); if (!ax) return { ok: false, reason: "Put one-way signs on straight road, not junctions." };
  const [d1, d2] = ax === "x" ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  const cur = S.oneway[k];
  const next = !cur ? { dx: d1[0], dy: d1[1] } : cur.dx === d1[0] && cur.dy === d1[1] ? { dx: d2[0], dy: d2[1] } : null;
  if (next) S.oneway[k] = next; else delete S.oneway[k];
  R.roads.invalidate();
  return { ok: true, oneway: next };
}
function oneWayOk(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ob = S.oneway[b.y * S.map.w + b.x]; if (ob && !(ob.dx === dx && ob.dy === dy)) return false;
  const oa = S.oneway[a.y * S.map.w + a.x]; if (oa && !(oa.dx === dx && oa.dy === dy)) return false;
  return true;
}

// ---------------------------------------------------------------- industry looks
const IND_LOOK = {
  coalMine: ["mine", "#3b3f45"], goldMine: ["mine", "#b8962e"], diamondMine: ["mine", "#9fb7c9"], sugarMine: ["mine", "#f3d6e6"],
  powerStation: ["works", "#8a8f98"], steelMill: ["works", "#6b3a3a"], factory: ["works", "#9a5a44"], refinery: ["tanks", "#a9a9b0"],
  paperMill: ["works", "#c9c3ae"], printingWorks: ["works", "#7a6a8a"], foodPlant: ["works", "#e6e0d0"], sweetFactory: ["works", "#ff9ac8"],
  toyFactory: ["works", "#9a7ae0"], fizzyFactory: ["works", "#5fd09a"],
  farm: ["farm", "#b3382c"], fruitPlantation: ["orchard", "#e07b00"], rubberPlantation: ["orchard", "#6b4a2b"], batteryFarm: ["farm", "#f2c230"],
  forest: ["forest", "#7a5a33"], sawmill: ["sawmill", "#a8824a"],
  oilWell: ["wells", "#2b2b2e"], colaWells: ["wells", "#5a2a1a"], plasticFountain: ["fountain", "#d83aa8"], waterSupply: ["fountain", "#3a7fc2"],
  oilRig: ["rig", "#8a8f98"],
};
