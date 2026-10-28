// --------------------------------------------------------------- town councils
// Each town rates your company from -1000 to 1000. Cutting trees and tearing up roads
// lowers it; good service, advertising and planting trees raise it. Below "Very poor"
// the council refuses new stops and track inside the town.
const RATING_LABELS = [[-400, "Appalling"], [-200, "Very poor"], [0, "Poor"], [200, "Mediocre"], [400, "Good"], [600, "Very good"], [800, "Excellent"], [1e9, "Outstanding"]];
const REFUSE_BELOW = -200;
function ratingLabel(v) { for (const [lim, l] of RATING_LABELS) if (v < lim) return l; return "Outstanding"; }
function townRating(t) { if (!S.townRating) S.townRating = {}; if (S.townRating[t.id] == null) S.townRating[t.id] = 250; return S.townRating[t.id]; }
function bumpRating(t, d) { if (!t) return; S.townRating[t.id] = clamp(townRating(t) + d, -1000, 1000); }
function townZone(x, y) {
  let best = null, bd = 1e9;
  for (const t of S.map.towns) { const d = Math.max(Math.abs(t.x - x), Math.abs(t.y - y)); if (d <= t.radius + 2 && d < bd) { bd = d; best = t; } }
  return best;
}
function councilRefuses(x, y) {
  const t = townZone(x, y); if (!t || townRating(t) >= REFUSE_BELOW) return "";
  return "The " + t.name + " council refuses: your rating there is " + ratingLabel(townRating(t)) + ". Advertise or plant trees to win them back.";
}
function townMonthly() {
  for (const t of S.map.towns) {
    let d = (250 - townRating(t)) * 0.03;   // drifts back towards neutral
    for (const s of S.stations) {
      if (s.owner !== "player" || townZone(s.x, s.y) !== t) continue;
      const rs = Object.keys(s.served).map(c => ST.ratingOf(s, c)); if (!rs.length) continue;
      const best = Math.max(...rs); d += best >= 0.5 ? 12 : best < 0.3 ? -6 : 3;
    }
    bumpRating(t, d);
  }
  if (S.ads) for (const id of Object.keys(S.ads)) { S.ads[id].days -= 30; if (S.ads[id].days <= 0) delete S.ads[id]; }
}
function adsDaily() {
  if (!S.ads) return;
  for (const [id, ad] of Object.entries(S.ads)) {
    const t = S.map.towns.find(x => x.id === id); if (!t) continue;
    for (const s of S.stations) if (s.owner === "player" && Math.max(Math.abs(s.x - t.x), Math.abs(s.y - t.y)) <= ad.r) for (const c of Object.keys(s.served)) s.daysSincePickup[c] = Math.min(s.daysSincePickup[c] ?? 0, 2);
  }
}
const ADS = [["Small advertising campaign", 2000, 30, 5, 15], ["Medium advertising campaign", 5000, 60, 8, 35], ["Large advertising campaign", 10000, 90, 12, 60]];
function advertise(t, size) {
  const [, base, days, r, rate] = ADS[size], c = cost(base);
  if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
  spend("other", c); if (!S.ads) S.ads = {}; S.ads[t.id] = { days, r }; bumpRating(t, rate);
  return { ok: true, cost: c };
}
function plantTrees(t) {
  const c = cost(3000); if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
  const m = S.map; let n = 0;
  for (let k = 0; k < 400 && n < 14; k++) {
    const a = rng() * Math.PI * 2, d = t.radius * (0.7 + rng() * 0.8), x = Math.round(t.x + Math.cos(a) * d), y = Math.round(t.y + Math.sin(a) * d);
    if (!inB(x, y)) continue; const i = key(x, y);
    if (m.water[i] || m.occupied[i] || m.forest[i]) continue;
    m.forest[i] = 1; n++;
  }
  spend("other", c); bumpRating(t, 40 + n * 3);
  return { ok: true, cost: c, trees: n };
}
function treeCut(x, y) { const t = townZone(x, y); if (t) bumpRating(t, -35); }
function roadRemoved(x, y) { const t = townZone(x, y); if (t) bumpRating(t, -50); }

function townWin(t) {
  openWin("town", t.name, (body, o) => {
    o.refresh = () => {
      const r = townRating(t), pct = Math.round((r + 1000) / 20), ad = S.ads && S.ads[t.id];
      body.innerHTML = "<div class='kv'><span>Population</span><b>" + t.population.toLocaleString("en-GB") + "</b></div><div class='kv'><span>Buildings</span><b>" + t.buildings.length + " · " + t.size + ", " + t.style + " streets</b></div><div class='kv'><span>Stations serving it</span><b>" + t.activeStations + "</b></div>" +
        "<h4>Council rating of " + esc(S.name) + "</h4><div class='kv'><span>" + ratingLabel(r) + "</span><b>" + Math.round(r) + "</b></div><div class='bar'><i style='width:" + pct + "%;background:" + (r < REFUSE_BELOW ? "var(--red)" : r < 200 ? "#c99a1e" : "var(--green)") + "'></i></div>" +
        (r < REFUSE_BELOW ? "<p class='warn'>The council refuses new stops and track here.</p>" : "") + (ad ? "<p class='dim'>Advertising running for " + ad.days + " more days.</p>" : "") + "<div class='col acts'></div>";
      const acts = body.querySelector(".acts");
      ADS.forEach(([label, base], i) => acts.appendChild(btn(label + " (" + money(cost(base)) + ")", () => { const x = advertise(t, i); toast(x.ok ? "Campaign started in " + t.name + "." : x.reason, !x.ok); o.refresh(); })));
      acts.appendChild(btn("Plant trees (" + money(cost(3000)) + ")", () => { const x = plantTrees(t); toast(x.ok ? "Planted " + x.trees + " trees." : x.reason, !x.ok); o.refresh(); }));
      acts.appendChild(btn("Fund new buildings (" + money(cost(8000 + t.population * 8)) + ")", () => { const c = cost(8000 + t.population * 8); if (S.company.cash < c) return toast("Not enough money.", true); spend("other", c); t.fundedBuildDaysLeft = EV.FUNDING_DAYS; bumpRating(t, 30); toast("Funded. " + t.name + " will grow fast for a while."); o.refresh(); }));
    };
    o.refresh();
  }, { live: 3000 });
}

// ---------------------------------------------------------------- rival railways
function railOwnerOf(k) { return (S.railOwner && S.railOwner[k]) || "player"; }
function rivalRailMonth(rv) {
  const ai = rv.ai; if (ai.bankrupt) return;
  rv.rail = rv.rail || [];
  if (S.date.year < 1950 || ai.cash < 140000 || rv.rail.length >= 3 || rng() > 0.25) return;
  const cargo = ["coal", "wood", "grain"][Math.floor(rng() * 3)];
  const ends = findEnds(cargo); if (!ends) return;
  const m = S.map;
  const api = { width: m.w, height: m.h, tileCost(x, y) {
    const i = key(x, y); if (m.water[i] || S.spans[i]) return null;
    if (R.rail.hasRoad(x, y)) return railOwnerOf(i) === ai.id && !R.stationAt.has(i) ? 1 : null;
    if (R.roads.hasRoad(x, y)) return R.stationAt.has(i) || R.depotAt.has(i) ? null : 9;
    if (m.occupied[i]) return null;
    return 4 + (m.forest[i] ? 2 : 0);
  } };
  const path = AI.findPath(api, ends.a, ends.b); if (!path || path.length < 8) return;
  let price = 0; for (const p of path) if (!R.rail.hasRoad(p.x, p.y)) price += cost(TRACK_COST) + (R.roads.hasRoad(p.x, p.y) ? cost(CROSSING_EXTRA) : 0);
  const loco = V.availableModels(S.date.year, "locomotive").filter(l => !ELECTRIC_LOCO.test(l.name)).sort((a, b) => a.price - b.price)[0];
  const wag = V.availableModels(S.date.year, "wagon").filter(w => w.cargo === cargo).pop();
  if (!loco || !wag) return;
  const tm = V.buildTrainModel(loco.id, wag.id, 4);
  const total = price + cost(RAIL_STATION_COST) * 2 + cost(RAIL_DEPOT_COST) + vehiclePrice(tm);
  if (ai.cash - total < 30000) return;
  for (const p of path) { const i = key(p.x, p.y); if (R.rail.hasRoad(p.x, p.y)) continue; m.forest[i] = 0; m.occupied[i] = 1; R.rail.addRoad(p.x, p.y); if (!S.railOwner) S.railOwner = {}; S.railOwner[i] = ai.id; }
  const s1 = placeStation(path[0].x, path[0].y, "trainStation", ai.id), s2 = placeStation(path[path.length - 1].x, path[path.length - 1].y, "trainStation", ai.id);
  const dp = placeDepot(path[1].x, path[1].y, "rail", ai.id);
  if (!s1.ok || !s2.ok || !dp.ok) return;
  const vh = makeVehicle(ai.id, tm.id, dp.depot, [s1.station.id, s2.station.id]); vh.core.breakdownsEnabled = false;
  ai.cash -= total; rv.rail.push({ cargo, from: s1.station.id, to: s2.station.id });
  EV.addNews(S.news, S.date, "info", ai.name + " opened a " + cargo + " railway from " + ends.from.name + " to " + ends.to.name + ".", { x: path[0].x, y: path[0].y });
  for (const s of S.stations) if (s.owner === "player" && ST.covers(s, ends.from.x, ends.from.y) && s.served[cargo]) { EV.addNews(S.news, S.date, "bad", ai.name + " now competes with you for " + cargo + " at " + ends.from.name + ".", { x: ends.from.x, y: ends.from.y }); break; }
}

// ---------------------------------------------------------- prices and inflation
function vehiclePrice(m) { return Math.round(m.price * (S ? S.inflation : 1)); }
function saleValue(vh) { return Math.round(core.vehicleSalePrice(vh.core, modelOf(vh)) * S.inflation); }

// ------------------------------------------------------------- shares, takeover
function rivalValue(rv) {
  const fleet = S.vehicles.filter(v => v.owner === rv.ai.id);
  return Math.max(0, Math.round(rv.ai.cash + fleet.reduce((a, v) => a + saleValue(v), 0) + S.stations.filter(s => s.owner === rv.ai.id).length * 800));
}
function sharePrice(rv) { return Math.max(5000, Math.round(rivalValue(rv) / 4 / 100) * 100); }
function buyShare(rv) {
  if (rv.ai.bankrupt) return { ok: false, reason: "That company is bankrupt." };
  rv.shares = rv.shares || 0; if (rv.shares >= 4) return { ok: false, reason: "You already own it." };
  const p = sharePrice(rv); if (S.company.cash < p) return { ok: false, reason: "Not enough money." };
  S.company.cash -= p; post("other", -p); rv.shares++;
  if (rv.shares >= 4) { takeOver(rv); return { ok: true, cost: p, takeover: true }; }
  return { ok: true, cost: p };
}
function sellShare(rv) {
  if (!rv.shares) return { ok: false, reason: "You have no shares in it." };
  const p = Math.round(sharePrice(rv) * 0.95); S.company.cash += p; post("other", p); rv.shares--;
  return { ok: true, value: p };
}
function takeOver(rv) {
  const id = rv.ai.id;
  for (const v of S.vehicles) if (v.owner === id) { v.owner = "player"; v.orders.autoService = true; v.core.breakdownsEnabled = S.settings.breakdowns > 0; if (!v.profit) v.profit = { thisYear: 0, lastYear: 0, lifetime: 0 }; }
  for (const s of S.stations) if (s.owner === id) s.owner = "player";
  for (const d of S.depots) if (d.owner === id) d.owner = "player";
  if (S.railOwner) for (const k of Object.keys(S.railOwner)) if (S.railOwner[k] === id) delete S.railOwner[k];
  S.company.cash += rv.ai.cash; post("other", rv.ai.cash);
  S.rivals = S.rivals.filter(r => r !== rv);
  EV.addNews(S.news, S.date, "good", "You have taken over " + rv.ai.name + ". Its vehicles and stations are now yours.");
  sound.play("cash");
}

// ------------------------------------------------------------------- scenarios
const SCENARIOS = [
  { id: "coal", name: "Coal Country", blurb: "A hilly valley full of mines. Haul 20,000 tonnes of cargo by 1965.", cfg: { climate: "temperate", difficulty: "medium", mapSize: 96, towns: 14, rivals: 1, startYear: 1950, seed: "coal-country" }, goal: { text: "Deliver 20,000 tonnes of cargo", metric: "cargo", target: 20000, byYear: 1965 } },
  { id: "commuter", name: "Commuter Belt", blurb: "Many towns close together. Carry 60,000 passengers by 1972.", cfg: { climate: "temperate", difficulty: "easy", mapSize: 96, towns: 26, rivals: 2, startYear: 1955, seed: "commuter-belt" }, goal: { text: "Carry 60,000 passengers", metric: "passengers", target: 60000, byYear: 1972 } },
  { id: "iron", name: "Iron Horse", blurb: "Build a railway empire. Reach a company value of £2,000,000 by 1980.", cfg: { climate: "temperate", difficulty: "medium", mapSize: 128, towns: 18, rivals: 2, startYear: 1950, seed: "iron-horse" }, goal: { text: "Reach a company value of £2,000,000", metric: "companyValue", target: 2000000, byYear: 1980 } },
  { id: "north", name: "Frozen North", blurb: "Hard winters, tight money. Connect 8 towns by 1975.", cfg: { climate: "arctic", difficulty: "hard", mapSize: 96, towns: 16, rivals: 2, startYear: 1955, seed: "frozen-north" }, goal: { text: "Connect 8 towns", metric: "townsConnected", target: 8, byYear: 1975 } },
  { id: "toys", name: "Toy Trains", blurb: "A bright and easy start. Make £250,000 profit in a year by 1985.", cfg: { climate: "toyland", difficulty: "easy", mapSize: 96, towns: 16, rivals: 1, startYear: 1960, seed: "toy-trains" }, goal: { text: "Make £250,000 profit in a year", metric: "yearlyProfit", target: 250000, byYear: 1985 } },
];
function startScenario(id) {
  const sc = SCENARIOS.find(s => s.id === id); if (!sc) return false;
  startGame({ ...sc.cfg, retireYears: 0 });
  S.scenario = sc.id; S.objectives = [EV.objectiveFromScenario(sc.goal), ...S.objectives];
  EV.addNews(S.news, S.date, "info", "Scenario " + sc.name + ": " + sc.goal.text + " by " + sc.goal.byYear + ".");
  return true;
}
function scenarioCheck() {
  const g = S.objectives.find(o => o.id === "scenario-goal"); if (!g || S.scenarioDone) return;
  if (g.status === "done") { S.scenarioDone = "won"; EV.addNews(S.news, S.date, "good", "Scenario complete! You can keep playing or retire for your final score."); toast("Scenario complete!"); sound.play("newYear"); }
  if (g.status === "failed") { S.scenarioDone = "lost"; EV.addNews(S.news, S.date, "bad", "Scenario goal missed. You can keep playing."); }
}

// ------------------------------------------------------------ retiring, scores
const SCORES_KEY = "tt-highscores";
function highScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || "[]"); } catch (e) { return []; } }
function finalRating() {
  const pv = playerVehicles();
  return EV.performanceRating({ vehicles: pv.map(v => ({ ageYears: v.core.ageDays / 365, speedKmh: modelOf(v).speedKmh })), stations: S.stations.filter(s => s.owner === "player").length, quarterlyIncome: S.quarterlyIncome, cargoDeliveredQuarter: S.metrics.quarterCargo, cash: S.company.cash, loan: S.company.loan, maxLoan: S.company.maxLoan, inflation: S.inflation });
}
function endGame(reason) {
  if (S.ended) return; S.ended = reason; S.gameOver = true; ui.paused = true;
  const r = finalRating(), sc = SCENARIOS.find(x => x.id === S.scenario);
  const entry = { name: S.name, score: r.total, title: r.title, year: S.date.year, value: companyValue(), scenario: sc ? sc.name : "", won: S.scenarioDone === "won", when: Date.now() };
  const list = highScores(); list.push(entry); list.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(list.slice(0, 10))); } catch (e) { /* storage blocked */ }
  showEndScreen(reason, r, entry);
  return entry;
}
function showEndScreen(reason, r, entry) {
  const box = $("#gameover"); if (!box) return;
  const list = highScores();
  box.innerHTML = "<div class='endbox'><h2>" + (reason === "bankrupt" ? "Bankrupt" : "Retired") + "</h2>" +
    (reason === "bankrupt" ? "<p>Your company ran out of money.</p>" : "<p>" + esc(S.name) + " in " + S.date.year + ": <b>" + r.title + "</b>, score <b>" + r.total + "</b> of 1000. Company value " + money(entry.value) + ".</p>") +
    "<h4>High scores</h4><table class='tb'>" + list.map((e, i) => "<tr" + (e.when === entry.when ? " class='sum'" : "") + "><td>" + (i + 1) + ". " + esc(e.name) + (e.scenario ? " <span class='dim'>" + esc(e.scenario) + (e.won ? ", won" : "") + "</span>" : "") + "</td><td>" + e.score + "</td><td>" + e.year + "</td></tr>").join("") + "</table>" +
    "<button class='gb big' id='go-new'>New game</button></div>";
  box.hidden = false; $("#go-new").onclick = () => { closeAllWins(); showMenu(); };
}

// ------------------------------------------------------------ cargo payment rates
const RATE_COL = { passengers: "#2e6f9e", mail: "#c0392b", coal: "#2b2b2e", goods: "#7b3fa0", wood: "#8a5a2b", steel: "#6b7785", grain: "#c99a1e" };
function cargoRatesSvg() {
  const cs = Object.keys(core.CARGO), W = 320, H = 180, L = 46, Rr = 8, T = 8, B = 22, days = [];
  for (let d = 0; d <= 200; d += 10) days.push(d);
  const pay = (c, d) => core.deliveryIncome(c, 10, { x: 0, y: 0 }, { x: 20, y: 0 }, d, S.inflation) * INCOME_SCALE * ((c === "passengers" || c === "mail") ? 1 : FREIGHT_BONUS);
  const hi = Math.max(...cs.map(c => pay(c, 0))) * 1.05;
  const x = i => L + i / (days.length - 1) * (W - L - Rr), y = v => T + (1 - v / hi) * (H - T - B);
  let g = "";
  for (let t = 0; t <= 4; t++) { const v = hi * t / 4; g += "<line x1='" + L + "' x2='" + (W - Rr) + "' y1='" + y(v) + "' y2='" + y(v) + "' stroke='#b8b088'/><text x='" + (L - 4) + "' y='" + (y(v) + 3) + "' font-size='9' text-anchor='end' fill='#4a4426'>£" + Math.round(v) + "</text>"; }
  days.forEach((d, i) => { if (d % 50 === 0) g += "<text x='" + x(i) + "' y='" + (H - 6) + "' font-size='9' text-anchor='middle' fill='#4a4426'>" + d + "</text>"; });
  for (const c of cs) g += "<polyline fill='none' stroke='" + RATE_COL[c] + "' stroke-width='2' points='" + days.map((d, i) => x(i).toFixed(1) + "," + y(pay(c, d)).toFixed(1)).join(" ") + "'/>";
  return "<svg viewBox='0 0 " + W + " " + H + "' class='gr'>" + g + "</svg><div class='legend'>" + cs.map(c => "<span><i style='background:" + RATE_COL[c] + "'></i>" + (CARGO_NAME[c] || c) + "</span>").join("") + "</div><p class='dim small'>Payment for 10 units carried 20 tiles, by days in transit. Trains earn " + TRAIN_BONUS + " times this.</p>";
}
