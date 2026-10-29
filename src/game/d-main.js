// -------------------------------------------------------------- menus & loop
const SLOT = "tt-save-1", AUTO = "tt-auto";
function saveNow(slot) {
  syncPersist();
  try { const r = SV.saveGame(slot, S, S.name + " " + S.date.year); if (!r.ok) toast(r.error || "Could not save.", true); else toast("Game saved."); } catch (e) { toast("Saving is blocked in this browser.", true); }
}
function loadSlot(slot) {
  let st = null;
  try { st = SV.loadGame(slot); } catch (e) { st = null; }
  if (!st) { toast("No saved game found.", true); return false; }
  S = st; initRuntime(); ui.paused = false; closeAllWins(); hideMenu(); afterStart(); toast("Game loaded."); return true;
}
function hasSave(slot) { try { return !!SV.listSaves().find(s => s.slot === slot); } catch (e) { return false; } }

function afterStart() {
  buildToolbar(); setTool("inspect"); resize();
  const t = S.map.towns[0]; if (t) { view.z = 1.1; centerOn(t.x, t.y); }
  $("#gameover").hidden = true;
  ui.follow = null; MM.img = null; renderTutorial();
  $("#brace").hidden = !(S && S.race);
}
function startGame(cfg) { newGame(cfg); closeAllWins(); hideMenu(); afterStart(); }
function startGameFromMenu(cfg) { startGame(cfg); if (!prefs.tutorialDone) tutorialStart(); }

const menuState = { climate: "temperate", difficulty: "medium", size: 192, towns: 18, rivals: 2, year: 1950, seed: "", retire: 0, view: "new", water: "n", rivers: 2, names: "auto" };
function showMenu(first) {
  ui.menuOpen = true; document.body.classList.add("menu-open");
  const m = $("#menu"); m.hidden = false;
  const anySave = savesList().length > 0;
  if (!menuState.seed) menuState.seed = String(mapgen.randomSeed());
  const opt = (g, v, label) => "<button class='chip " + (menuState[g] === v ? "on" : "") + "' data-g='" + g + "' data-v='" + v + "'>" + label + "</button>";
  const tabs = "<div class='tabs'>" + [["new", "New game"], ["sc", "Scenarios"], ["on", "Online"], ["hs", "High scores"]].map(([v, l]) => "<button data-act='v-" + v + "' class='" + (menuState.view === v ? "on" : "") + "'>" + l + "</button>").join("") + "</div>";
  let view;
  if (menuState.view === "sc") view = "<div class='scs'>" + SCENARIOS.map(sc => "<button class='sc' data-act='sc' data-id='" + sc.id + "'><b>" + sc.name + "</b><span>" + sc.blurb + "</span><span class='dim'>" + CLIM[sc.cfg.climate].label + " · " + sc.cfg.difficulty + " · from " + sc.cfg.startYear + "</span></button>").join("") + "</div>";
  else if (menuState.view === "on") view = onlineView();
  else if (menuState.view === "hs") view = highScores().length ? "<table class='tb'>" + highScores().map((e, i) => "<tr><td>" + (i + 1) + ". " + esc(e.name) + (e.scenario ? " <span class='dim'>" + esc(e.scenario) + (e.won ? ", won" : "") + "</span>" : "") + "</td><td>" + e.score + " " + e.title + "</td><td>" + e.year + "</td></tr>").join("") + "</table>" : "<p class='dim'>No scores yet. Retire a company to set one.</p>";
  else view =
    "<div class='clim'>" + Object.keys(CLIM).map(k => "<button class='ct " + (menuState.climate === k ? "on" : "") + "' data-g='climate' data-v='" + k + "'><i style='background:linear-gradient(135deg," + CLIM[k].grass + " 55%," + CLIM[k].water + " 55%)'></i>" + CLIM[k].label + "</button>").join("") + "</div>" +
    "<label>Difficulty</label><div class='chips'>" + opt("difficulty", "easy", "Easy") + opt("difficulty", "medium", "Medium") + opt("difficulty", "hard", "Hard") + "</div>" +
    "<label>Map size</label><div class='chips'>" + opt("size", 128, "Small") + opt("size", 192, "Medium") + opt("size", 256, "Large") + opt("size", 320, "Huge") + "</div>" +
    "<label>Water</label><div class='chips'>" + opt("water", "d", "Dry") + opt("water", "n", "Normal") + opt("water", "w", "Lots of lakes") + "</div>" +
    "<label>Rivers</label><div class='chips'>" + opt("rivers", 0, "None") + opt("rivers", 2, "Some") + opt("rivers", 4, "Many") + "</div>" +
    "<label>Town names</label><div class='chips'>" + opt("names", "auto", "Match climate") + opt("names", "english", "English") + opt("names", "swedish", "Swedish") + opt("names", "german", "German") + opt("names", "french", "French") + opt("names", "silly", "Silly") + "</div>" +
    "<label>Towns</label><div class='chips'>" + opt("towns", 10, "Few") + opt("towns", 18, "Normal") + opt("towns", 26, "Many") + "</div>" +
    "<label>Rival companies</label><div class='chips'>" + [0, 1, 2, 3].map(n => opt("rivals", n, n)).join("") + "</div>" +
    "<label>Start year</label><div class='chips'>" + [1950, 1970, 1990].map(n => opt("year", n, n)).join("") + "</div>" +
    "<label>Game length</label><div class='chips'>" + opt("retire", 0, "Endless") + opt("retire", 20, "Retire after 20 years") + opt("retire", 40, "40 years") + "</div>" +
    "<label>Map seed</label><div class='row'><input id='seed' value='" + esc(menuState.seed) + "' aria-label='Map seed'><button class='gb sm' data-act='dice'>Random</button></div>" +
    "<button class='gb wide big go' data-act='start'>Start game</button>";
  m.innerHTML = "<div class='mbox'><h1>Transport &amp; Co.</h1><p class='sub'>A transport company in the style of the old classics</p>" +
    (anySave ? "<button class='gb wide big' data-act='continue'>Continue game</button>" : "") + tabs + view +
    "<div class='row'>" + (anySave ? "<button class='gb' data-act='saves'>Saved games</button>" : "") + "<button class='gb' data-act='import'>Import a save file</button></div>" +
    "<button class='gb wide' data-act='tests'>Open test panel</button></div>";
  m.onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.g) { menuState[b.dataset.g] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; const sd = $("#seed"); if (sd) menuState.seed = sd.value; showMenu(); return; }
    const a = b.dataset.act;
    if (a === "dice") { menuState.seed = String(mapgen.randomSeed()); $("#seed").value = menuState.seed; }
    if (a === "start") {
      menuState.seed = $("#seed").value.trim() || String(mapgen.randomSeed());
      startGameFromMenu({ climate: menuState.climate, difficulty: menuState.difficulty, mapSize: menuState.size, towns: Math.round(menuState.towns * Math.pow(menuState.size / 96, 1.5)), rivals: menuState.rivals, startYear: menuState.year, seed: menuState.seed, retireYears: menuState.retire, water: ({ d: 0.15, n: null, w: 0.85 })[menuState.water], rivers: menuState.rivers, names: menuState.names === "auto" ? null : menuState.names });
    }
    if (a === "continue") { const last = savesList()[0]; if (last) { let st = null; try { st = SV.loadGame(last.slot); } catch (e) { st = null; } if (st && startLoaded(st)) toast("Loaded " + (last.slot === AUTO ? "autosave" : last.label.split(" · ")[0]) + "."); } }
    if (a === "saves") savesWin();
    if (a && a.startsWith("on-")) { onlineAction(a); return; }
    if (a === "v-new" || a === "v-sc" || a === "v-hs" || a === "v-on") { menuState.view = a.slice(2); const sd = $("#seed"); if (sd) menuState.seed = sd.value; showMenu(); return; }
    if (a === "sc") { startScenario(b.dataset.id); closeAllWins(); hideMenu(); afterStart(); }
    if (a === "import") pickSaveFile();
    if (a === "tests") { if (!S) startGame({ climate: "temperate", difficulty: "medium", mapSize: 64, towns: 10, rivals: 1, startYear: 1950, seed: "1234" }); testsWin(); }
  };
}
function hideMenu() { ui.menuOpen = false; document.body.classList.remove("menu-open"); $("#menu").hidden = true; }

function menuWin() {
  openWin("menu", "Game menu", body => {
    body.innerHTML = "<div class='col'></div>";
    const c = body.firstChild;
    c.appendChild(btn("Quick save", () => { if (saveToSlot(SLOT, S.name)) toast("Saved."); }));
    c.appendChild(btn("Save and load…", () => { closeWin("menu"); savesWin(); }));
    c.appendChild(btn("Settings", () => { closeWin("menu"); settingsWin(); }));
    c.appendChild(btn("Tutorial", () => { closeWin("menu"); tutorialStart(); }));
    c.appendChild(btn("Keys and help", () => { closeWin("menu"); helpWin(); }));
    c.appendChild(btn("Test panel", () => { closeWin("menu"); testsWin(); }));
    let armed = false;
    const rb = btn("Retire now", () => { if (!armed) { armed = true; rb.textContent = "Tap again to retire and see your score"; rb.classList.add("danger"); return; } closeAllWins(); endGame("retired"); });
    c.appendChild(rb);
    c.appendChild(btn("Main menu", () => { closeAllWins(); showMenu(); }));
  });
}

// -------------------------------------------------------------- bottom bar
function wireBars() {
  decorateChrome();
  $("#bpause").onclick = () => { ui.paused = !ui.paused; sound.play("click"); };
  document.querySelectorAll(".spd").forEach(b => b.onclick = () => { ui.speed = +b.dataset.s; ui.paused = false; });
  $("#bmenu").onclick = menuWin;
  $("#bshop").onclick = openShop;
  $("#bfleet").onclick = fleetWin;
  $("#bfin").onclick = financeWin;
  $("#bgraph").onclick = graphsWin;
  $("#bco").onclick = companyWin;
  $("#bnews").onclick = newsWin;
  $("#bhelp").onclick = helpWin;
  $("#brace").onclick = raceWindow;
  $("#ticker").onclick = () => { if (ui.jump) centerOn(ui.jump.x, ui.jump.y); else newsWin(); };
  $("#zin").onclick = () => zoomAt(cssW / 2, cssH / 2, clamp(view.z * 1.25, 0.45, 3));
  $("#zout").onclick = () => zoomAt(cssW / 2, cssH / 2, clamp(view.z / 1.25, 0.45, 3));
  $("#go-new").onclick = () => { closeAllWins(); showMenu(); };
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => resize()); ro.observe($("#topbar")); ro.observe($("#tools")); }
  window.addEventListener("keydown", e => {
    if (!S || ui.menuOpen || e.target.tagName === "INPUT") return;
    if (e.key === " ") { ui.paused = !ui.paused; e.preventDefault(); }
    const pan = 40; if (e.key === "ArrowLeft") view.x += pan; if (e.key === "ArrowRight") view.x -= pan; if (e.key === "ArrowUp") view.y += pan; if (e.key === "ArrowDown") view.y -= pan;
  });
  sound.attachUnlock && sound.attachUnlock(document.body);
  applyPrefs();
}

let lastT = performance.now(), dayAcc = 0, autoT = 0, uiT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (S) {
    if (!ui.paused && !S.gameOver && !ui.menuOpen) {
      const dd = dt * ui.speed / DAY_SECONDS;
      moveVehicles(dd); dayAcc += dd;
      let g = 8; while (dayAcc >= 1 && g-- > 0) { dayAcc -= 1; dailyTick(); }
      if (dayAcc > 4) dayAcc = 0;
      autoT += dt; if (prefs.autosaveMin > 0 && autoT > prefs.autosaveMin * 60) { autoT = 0; try { syncPersist(); SV.saveGame(AUTO, S, "Autosave"); } catch (e) {} }
    }
    followTick();
    draw();
    drawMinimap(now);
    racePulse(now);
    uiT += dt; if (uiT > 0.15) { uiT = 0; updateStatus(); tutorialTick(); if (S.gameOver) $("#gameover").hidden = false; }
  }
  requestAnimationFrame(frame);
}

// -------------------------------------------------------------- test helpers
// Build a ready-made route: a depot, a bus stop in the two closest towns, and a road between them.
function buildDemoRoute() {
  const ts = S.map.towns.slice().sort((a, b) => b.population - a.population).slice(0, 8);
  let best = null;
  for (const a of ts) for (const b of ts) { if (a === b) continue; const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y); if (d >= 8 && d <= 40 && R.roads.connected(a, b) !== undefined) { if (!best || d < best.d) best = { a, b, d }; } }
  if (!best) return { ok: false, msg: "No suitable pair of towns on this map." };
  const { a, b } = best;
  S.company.cash += 60000;
  const ra = R.roads.nearestRoad(a.x, a.y, 6), rb = R.roads.nearestRoad(b.x, b.y, 6);
  if (!ra || !rb) return { ok: false, msg: "Towns have no roads near their centres." };
  if (!R.roads.connected(ra, rb)) {
    // lay an L-shaped road, retrying the other corner if blocked
    const tryL = (cornerFirstX) => {
      const pts = []; let x = ra.x, y = ra.y;
      if (cornerFirstX) { while (x !== rb.x) { x += Math.sign(rb.x - x); pts.push({ x, y }); } while (y !== rb.y) { y += Math.sign(rb.y - y); pts.push({ x, y }); } }
      else { while (y !== rb.y) { y += Math.sign(rb.y - y); pts.push({ x, y }); } while (x !== rb.x) { x += Math.sign(rb.x - x); pts.push({ x, y }); } }
      return pts;
    };
    for (const first of [true, false]) { for (const p of tryL(first)) buildRoadTile(p.x, p.y); if (R.roads.connected(ra, rb)) break; }
    if (!R.roads.connected(ra, rb)) return { ok: false, msg: "Could not join the towns by road (water or hills in the way). Try Bridge/Raise tools or another seed." };
  }
  let dp = null;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]]) { const x = ra.x + dx, y = ra.y + dy; if (R.roads.hasRoad(x, y) && !R.stationAt.has(key(x, y)) && !R.depotAt.has(key(x, y))) { dp = { x, y }; break; } }
  const d1 = dp ? placeDepot(dp.x, dp.y) : placeDepot(ra.x, ra.y);
  const s1 = placeStation(ra.x, ra.y, "busStop", "player");
  const s2 = placeStation(rb.x, rb.y, "busStop", "player");
  return { ok: true, depot: d1.ok ? d1.depot : S.depots[0], s1: s1.ok ? s1.station : R.stationAt.get(key(ra.x, ra.y)), s2: s2.ok ? s2.station : R.stationAt.get(key(rb.x, rb.y)), a, b };
}
// Lay a road or track between two good spots and add a depot and two stops.
// cargo: passengers | coal | wood | grain | goods | steel.  mode: road | rail.
function spotNear(x, y, r, tx, ty) {
  const m = S.map; let best = null, bd = 1e9;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const px = x + dx, py = y + dy; if (!inB(px, py)) continue; const i = key(px, py);
    if (m.water[i] || m.occupied[i] || R.roads.hasRoad(px, py) || R.rail.hasRoad(px, py)) continue;
    const d = Math.abs(px - tx) + Math.abs(py - ty); if (d < bd) { bd = d; best = { x: px, y: py }; }
  }
  return best;
}
function findEnds(cargo, minDist) {
  minDist = minDist || 10;
  const m = S.map; let pairs = [];
  if (cargo === "passengers" || cargo === "mail") { const ts = m.towns.slice().sort((a, b) => b.population - a.population).slice(0, 10); for (const a of ts) for (const b of ts) if (a !== b) pairs.push([a, b, 4, 4]); }
  else {
    const from = m.industries.filter(i => CARGO_FROM_IND[i.kind] === cargo), to = m.industries.filter(i => (CARGO_TO_IND[cargo] || []).includes(i.kind));
    for (const a of from) for (const b of to) pairs.push([a, b, 2, 2]);
    if (cargo === "goods") { pairs = []; const ts = m.towns.slice().sort((a, b) => b.population - a.population).slice(0, 8); for (const a of from) for (const b of ts) pairs.push([a, b, 2, 4]); }
  }
  pairs = pairs.filter(([a, b]) => { const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y); return d >= minDist && d <= Math.max(48, minDist + 20); }).sort((p, q) => (Math.abs(p[0].x - p[1].x) + Math.abs(p[0].y - p[1].y)) - (Math.abs(q[0].x - q[1].x) + Math.abs(q[0].y - q[1].y)));
  for (const [a, b, ra, rb] of pairs) { const sa = spotNear(a.x, a.y, ra, b.x, b.y), sb = spotNear(b.x, b.y, rb, a.x, a.y); if (sa && sb && Math.abs(sa.x - sb.x) + Math.abs(sa.y - sb.y) >= 8) return { a: sa, b: sb, from: a, to: b }; }
  return null;
}
function buildDemoLine(mode, cargo, minDist) {
  const ends = findEnds(cargo, minDist); if (!ends) return { ok: false, msg: "No suitable " + cargo + " pair on this map." };
  const net = netFor(mode === "rail" ? "rail" : "road"), other = mode === "rail" ? R.roads : R.rail, m = S.map;
  const api = { width: m.w, height: m.h, tileCost(x, y) { const i = key(x, y); if (m.water[i] || other.hasRoad(x, y)) return null; if (net.hasRoad(x, y)) return 1; if (m.occupied[i]) return null; return 4 + (m.forest[i] ? 2 : 0); } };
  const path = AI.findPath(api, ends.a, ends.b); if (!path || path.length < 5) return { ok: false, msg: "No buildable route between the two spots." };
  S.company.cash += 120000;
  for (const q of path) { const r = mode === "rail" ? buildTrackTile(q.x, q.y) : buildRoadTile(q.x, q.y); if (!r.ok) return { ok: false, msg: r.reason }; }
  const dk = mode === "rail" ? "rail" : "road";
  const sk = mode === "rail" ? "trainStation" : (cargo === "passengers" ? "busStop" : "truckStop");
  const dp = placeDepot(path[1].x, path[1].y, dk);
  const s1 = placeStation(path[0].x, path[0].y, sk, "player"), s2 = placeStation(path[path.length - 1].x, path[path.length - 1].y, sk, "player");
  if (!dp.ok || !s1.ok || !s2.ok) return { ok: false, msg: (dp.reason || s1.reason || s2.reason) };
  return { ok: true, depot: dp.depot, s1: s1.station, s2: s2.station, ends, mode, cargo, len: path.length };
}
function demoBuy(line, count) {
  const y = S.date.year; let id;
  if (line.mode === "rail") {
    const loco = V.availableModels(y, "locomotive").sort((a, b) => a.price - b.price)[0];
    const wag = V.availableModels(y, "wagon").filter(w => w.cargo === line.cargo)[0] || V.availableModels(y, "wagon")[0];
    const tm = V.buildTrainModel(loco.id, wag.id, 5); if (!tm) return { ok: false, msg: "No train model." }; id = tm.id;
  } else {
    const list = V.availableModels(y, line.cargo === "passengers" ? "bus" : "truck"); const m = list.filter(x => x.cargo === line.cargo).sort((a, b) => a.price - b.price)[0];
    if (!m) return { ok: false, msg: "No vehicle for " + line.cargo }; id = m.id;
  }
  let last = null; for (let i = 0; i < (count || 1); i++) { last = buyVehicle(id, line.depot); if (!last.ok) return last; if (!last.vh.orders.orders.length) { addStopTo(last.vh, line.s1.id); addStopTo(last.vh, line.s2.id); } if (line.mode === "rail" && line.cargo !== "passengers") last.vh.orders.orders[0].load = "full"; }
  return last;
}
function demoLine(mode, cargo, count, minDist) {
  const l = buildDemoLine(mode, cargo, minDist); if (!l.ok) return l;
  const b = demoBuy(l, count); if (!b.ok) return { ok: false, msg: b.msg };
  centerOn(l.s1.x, l.s1.y); return { ok: true, line: l, vh: b.vh };
}
// Ships: oil from a rig to a refinery by tanker.
// For the player (owner "player") the demo pays for itself; a rival company pays from its own cash.
function rivalPays(rv, c) { if (!rv) return true; if (rv.ai.cash - c < 30000) return false; rv.ai.cash -= c; return true; }
function rivalVehicle(rv, model, depot, stops) {
  if (!rivalPays(rv, vehiclePrice(model))) return null;
  const vh = makeVehicle(rv.ai.id, model.id, depot, stops); vh.core.breakdownsEnabled = false;
  if (isAirModel(model)) { vh.orders.autoService = false; vh.at = depot.airport; const ap = stationById(depot.airport); if (ap) { const c = airportCentre(ap); vh.pos = { x: c.x, y: c.y }; } }
  return vh;
}
function buildDemoShip(owner, rv) {
  owner = owner || "player";
  const m = S.map;
  for (const rig of m.industries.filter(i => i.kind === "oilRig")) {
    const rd = S.stations.find(s => s.rigId === rig.id); if (!rd) continue;
    for (const ref of m.industries.filter(i => i.kind === "refinery")) {
      let dockAt = null;
      for (let dy = -3; dy <= 3 && !dockAt; dy++) for (let dx = -3; dx <= 3 && !dockAt; dx++) {
        const x = ref.x + dx, y = ref.y + dy; if (!inB(x, y)) continue; const i = key(x, y);
        if (m.water[i] || m.occupied[i] || R.roads.hasRoad(x, y) || R.rail.hasRoad(x, y)) continue;
        const w = waterNeighbour(x, y); if (w && R.sea.connected(w, rd.water)) dockAt = { x, y };
      }
      if (!dockAt) continue;
      if (!rv) S.company.cash += 150000; else if (rv.ai.cash < cost(2400) + cost(3500) + 60000) return { ok: false, msg: "Not enough money." };
      const d = placeDock(dockAt.x, dockAt.y, owner); if (!d.ok) continue;
      if (rv) rivalPays(rv, cost(2400));
      let yard = null;
      for (let r = 1; r <= 6 && !yard; r++) for (let dy = -r; dy <= r && !yard; dy++) for (let dx = -r; dx <= r && !yard; dx++) { const x = d.station.water.x + dx, y = d.station.water.y + dy; if (inB(x, y) && m.water[key(x, y)] && !m.occupied[key(x, y)] && landNeighbour(x, y) && !sameT({ x, y }, d.station.water) && R.sea.connected({ x, y }, rd.water)) yard = { x, y }; }
      if (!yard) continue;
      const sy = placeShipyard(yard.x, yard.y, owner); if (!sy.ok) continue;
      if (rv) rivalPays(rv, cost(3500));
      const tanker = V.availableModels(S.date.year, "ship").filter(x => x.cargo === "oil").sort((a, b) => a.price - b.price)[0];
      if (rv) { const vh = rivalVehicle(rv, tanker, sy.depot, [rd.id, d.station.id]); if (!vh) return { ok: false, msg: "Not enough money." }; vh.orders.orders[0].load = "full"; return { ok: true, vh, rig, ref, dock: d.station, rigDock: rd }; }
      const r = buyVehicle(tanker.id, sy.depot); if (!r.ok) return { ok: false, msg: r.msg };
      if (!r.vh.orders.orders.length) { addStopTo(r.vh, rd.id); addStopTo(r.vh, d.station.id); }
      r.vh.orders.orders[0].load = "full";
      return { ok: true, vh: r.vh, rig, ref, dock: d.station, rigDock: rd };
    }
  }
  return { ok: false, msg: "No oil rig with a reachable refinery on this map." };
}
// Aircraft: a small airport by each of two towns and a propeller plane between them.
function buildDemoAir(owner, rv) {
  owner = owner || "player";
  const m = S.map, ts = m.towns.slice().sort((a, b) => b.population - a.population).slice(0, 8);
  const spot = (t) => { for (let r = 2; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = t.x + dx, y = t.y + dy; let ok = true, h = null; for (let a = 0; a < 2 && ok; a++) for (let b = 0; b < 2 && ok; b++) { const i = key(x + b, y + a); if (!inB(x + b, y + a) || m.water[i] || m.occupied[i] || R.roads.hasRoad(x + b, y + a) || R.rail.hasRoad(x + b, y + a)) ok = false; else if (h === null) h = m.height[i]; else if (m.height[i] !== h) ok = false; } if (ok) return { x, y }; } return null; };
  for (const a of ts) for (const b of ts) {
    if (a === b || Math.hypot(a.x - b.x, a.y - b.y) < 20) continue;
    const sa = spot(a), sb = spot(b); if (!sa || !sb) continue;
    const plane = V.availableModels(Math.max(S.date.year, 1955), "aircraft").filter(x => x.cargo === "passengers" && !isJet(x)).sort((p, q) => p.price - q.price)[0];
    if (!plane || plane.introYear > S.date.year) return { ok: false, msg: "No aircraft yet in " + S.date.year + "." };
    if (!rv) S.company.cash += 150000; else if (rv.ai.cash < cost(AIRPORTS.small.cost) * 2 + vehiclePrice(plane) + 30000) return { ok: false, msg: "Not enough money." };
    const A = placeAirport(sa.x, sa.y, "small", owner), B = placeAirport(sb.x, sb.y, "small", owner); if (!A.ok || !B.ok) continue;
    if (rv) rivalPays(rv, cost(AIRPORTS.small.cost) * 2);
    const hangar = S.depots.find(d => d.airport === A.station.id);
    if (rv) { const vh = rivalVehicle(rv, plane, hangar, [A.station.id, B.station.id]); return vh ? { ok: true, vh, a: A.station, b: B.station } : { ok: false, msg: "Not enough money." }; }
    const r = buyVehicle(plane.id, hangar); if (!r.ok) return { ok: false, msg: r.msg };
    if (!r.vh.orders.orders.length) { addStopTo(r.vh, A.station.id); addStopTo(r.vh, B.station.id); }
    return { ok: true, vh: r.vh, a: A.station, b: B.station };
  }
  return { ok: false, msg: "No room for two airports on this map." };
}
function simulateDays(n) {
  const before = { cash: S.company.cash, pax: S.metrics.passengers, cargo: S.metrics.cargo };
  for (let i = 0; i < n; i++) { moveVehicles(1); dailyTick(); }
  return { days: n, cash: Math.round(S.company.cash - before.cash), pax: S.metrics.passengers - before.pax, cargo: S.metrics.cargo - before.cargo, date: S.date };
}

// -------------------------------------------------------------- boot
function boot() {
  wireBars(); resize(); setupMinimap(); setupDesktop(); initOnline();
  if (S == null) { newGame({ climate: "temperate", difficulty: "medium", mapSize: 96, towns: 18, rivals: 0, startYear: 1950, seed: "7" }); buildToolbar(); resize(); centerOn(S.map.towns[0].x, S.map.towns[0].y); }
  showMenu(true);
  requestAnimationFrame(frame);
}
