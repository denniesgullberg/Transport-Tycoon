// ------------------------------------------------------------------------- UI
const wins = $("#wins"), toastEl = $("#toast");
let toastT = 0;
function toast(msg, bad) {
  toastEl.textContent = msg; toastEl.className = "show" + (bad ? " bad" : "");
  clearTimeout(toastT); toastT = setTimeout(() => { toastEl.className = ""; }, 3200);
  if (bad) sound.play("error");
}
const openWins = {};
let zTop = 10;   // raise windows with z-index; moving the DOM node on pointerdown would swallow the click
function openWin(id, title, build, opts = {}) {
  closeWin(id);
  const w = el("div", "win"); w.dataset.id = id;
  const bar = el("div", "wtitle", "<span>" + title + "</span>");
  const x = el("button", "wx", "✕"); x.onclick = () => closeWin(id); bar.appendChild(x);
  const body = el("div", "wbody");
  w.appendChild(bar); w.appendChild(body); wins.appendChild(w);
  const n = Object.keys(openWins).length;
  w.style.left = (8 + n * 14) + "px"; w.style.top = (8 + n * 14) + "px";
  let drag = null;
  bar.addEventListener("pointerdown", e => { if (e.target === x) return; drag = { dx: e.clientX - w.offsetLeft, dy: e.clientY - w.offsetTop }; bar.setPointerCapture(e.pointerId); });
  bar.addEventListener("pointermove", e => { if (!drag) return; w.style.left = Math.max(0, e.clientX - drag.dx) + "px"; w.style.top = Math.max(0, e.clientY - drag.dy) + "px"; });
  bar.addEventListener("pointerup", () => { drag = null; });
  w.style.zIndex = ++zTop;
  w.addEventListener("pointerdown", () => { if (+w.style.zIndex !== zTop) w.style.zIndex = ++zTop; });
  const obj = { id, w, body, timer: null, refresh: null };
  openWins[id] = obj;
  build(body, obj);
  if (opts.live && obj.refresh) obj.timer = setInterval(() => { if (document.body.contains(w)) obj.refresh(); }, opts.live);
  return obj;
}
function closeWin(id) { const o = openWins[id]; if (!o) return; clearInterval(o.timer); o.w.remove(); delete openWins[id]; }
function closeAllWins() { Object.keys(openWins).forEach(closeWin); }
function btn(label, fn, cls) { const b = el("button", "gb " + (cls || ""), label); b.onclick = fn; return b; }

// ---- tools
const TOOLS = [
  ["inspect", "Inspect", "Tap a vehicle, stop, depot, town or industry for details. Drag to move the map."],
  ["road", "Road", () => "Road: " + money(cost(ROAD_COST)) + " per tile. Drag to paint a road."],
  ["busStop", "Bus stop", () => "Bus stop: " + money(cost(STATION_COST)) + ". Tap a road tile near houses. Its catchment is highlighted."],
  ["truckStop", "Truck stop", () => "Truck stop: " + money(cost(STATION_COST)) + ". Tap a road tile within 3 tiles of a mine, farm, forest or factory."],
  ["depot", "Depot", () => "Depot: " + money(cost(DEPOT_COST)) + ". Tap a road tile. Vehicles are bought and serviced here."],
  ["track", "Track", () => "Railway track: " + money(cost(TRACK_COST)) + " per tile. Drag to lay track. Rails cannot cross roads yet."],
  ["trainStation", "Train station", () => "Train station: " + money(cost(RAIL_STATION_COST)) + ". Tap a track tile. Catchment is 4 tiles: place it beside a mine, forest, farm, factory or town."],
  ["railDepot", "Train depot", () => "Train depot: " + money(cost(RAIL_DEPOT_COST)) + ". Tap a track tile. Trains are built and serviced here."],
  ["signal", "Signal", () => "Signal: " + money(cost(SIGNAL_COST)) + ". Tap straight track. Tap again to turn it round, again for two-way, again to remove. A train only enters the next block when it is empty."],
  ["electrify", "Electrify", () => "Electrify: " + money(cost(ELEC_COST)) + " per tile. Drag over track. Electric locomotives only run on electrified track."],
  ["bridge", "Bridge", "Tap the last road or track tile before water or a hill. A bridge or tunnel is built to the far side at the same height."],
  ["raise", "Raise land", () => "Raise land: about " + money(cost(250)) + " per tile. Neighbours follow to keep slopes gentle."],
  ["lower", "Lower land", () => "Lower land: about " + money(cost(250)) + " per tile."],
  ["bulldoze", "Bulldoze", () => "Bulldoze: " + money(cost(BULLDOZE)) + ". Removes roads, stops and depots."],
];
function buildToolbar() {
  const tb = $("#tools"); tb.innerHTML = "";
  for (const [id, label] of TOOLS) {
    const b = el("button", "tool" + (ui.tool === id ? " on" : ""), label); b.dataset.tool = id;
    b.onclick = () => { setTool(id); }; tb.appendChild(b);
  }
  const u = el("button", "tool undo", "Undo"); u.id = "bundo"; u.onclick = () => { const r = undoLast(); toast(r.ok ? "Undone. Refunded " + money(r.cost) + "." : r.reason, !r.ok); }; tb.appendChild(u); updateUndoBtn();
}
function setTool(id) {
  ui.tool = id; ui.overlay = null;
  document.querySelectorAll("#tools .tool").forEach(b => b.classList.toggle("on", b.dataset.tool === id));
  const t = TOOLS.find(x => x[0] === id); const h = typeof t[2] === "function" ? t[2]() : t[2];
  $("#hint").textContent = h; sound.play("click");
}

// ---- status bar
function updateStatus() {
  if (!S) return;
  const d = S.date;
  $("#sdate").textContent = d.day + " " + EV.MONTH_NAMES[d.month] + " " + d.year;
  $("#scompany").textContent = "— " + S.name + " —";
  const mEl = $("#smoney"); mEl.textContent = money(S.company.cash); mEl.classList.toggle("neg", S.company.cash < 0);
  $("#bpause").textContent = ui.paused ? "▶" : "⏸";
  document.querySelectorAll(".spd").forEach(b => b.classList.toggle("on", !ui.paused && +b.dataset.s === ui.speed));
  const n = EV.latestNews(S.news, 1)[0];
  $("#ticker").textContent = n ? n.text : "";
  $("#ticker").className = n ? n.kind : "";
  ui.jump = n && n.x != null ? { x: n.x, y: n.y } : null;
}

// ---- input
const ptrs = new Map();
let tap = null, pinch = null, painting = false;
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
cv.addEventListener("pointerdown", e => {
  if (!S) return;
  cv.setPointerCapture(e.pointerId); const p = pos(e); ptrs.set(e.pointerId, p);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; tap = null; painting = false; ui.plan = null; setTool(ui.tool); return; }
  tap = { x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false, t: performance.now() };
  if (ui.tool === "road" || ui.tool === "track" || ui.tool === "electrify") { painting = true; startPlan(screenToTile(p.x, p.y)); }
});
cv.addEventListener("pointermove", e => {
  const p = pos(e);
  if (!S) return;
  if (!ptrs.has(e.pointerId)) { ui.hover = screenToTile(p.x, p.y); updateOverlay(); return; }
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const nz = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.45, 3); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, nz); return; }
  if (!tap) return;
  if (Math.hypot(p.x - tap.x, p.y - tap.y) > 6) tap.moved = true;
  if (painting) { ui.hover = screenToTile(p.x, p.y); updatePlan(ui.hover); return; }
  if (tap.moved) { view.x = tap.vx + (p.x - tap.x); view.y = tap.vy + (p.y - tap.y); }
});
function endPtr(e) {
  const p = pos(e); ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (painting && ptrs.size === 0) commitPlan();
  else if (tap && !tap.moved && ptrs.size === 0 && !painting) onTap(p);
  if (ptrs.size === 0) { tap = null; painting = false; }
}
cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("wheel", e => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, clamp(view.z * (e.deltaY < 0 ? 1.12 : 0.89), 0.45, 3)); }, { passive: false });
function zoomAt(sx, sy, nz) { const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z; view.z = nz; view.x = sx - wx * nz; view.y = sy - wy * nz; }
function updateOverlay() {
  ui.overlay = null;
  const t = ui.hover; if (!t || !S) return;
  if (ui.tool === "busStop" || ui.tool === "truckStop" || ui.tool === "trainStation") ui.overlay = new Set(ST.previewCatchment(ui.tool, t.x, t.y, S.map.w, S.map.h).map(q => q.y * S.map.w + q.x));
}
function onTap(p) {
  const t = screenToTile(p.x, p.y); if (!t) return;
  ui.hover = t;
  const tool = ui.tool;
  if (tool === "inspect") return inspectAt(p, t);
  if (tool === "road") { const r = buildRoadTile(t.x, t.y); if (!r.ok) toast(r.reason, true); return; }
  if (tool === "track") { const r = buildTrackTile(t.x, t.y); if (!r.ok) toast(r.reason, true); return; }
  if (tool === "trainStation") { const r = placeStation(t.x, t.y, "trainStation", "player"); if (!r.ok) return toast(r.reason, true); pushUndo({ kind: "station", id: r.station.id, tile: r.tile, cost: r.cost }); sound.play("build"); toast(r.joined ? "Platform added to " + r.station.name + " (" + stationTiles(r.station).length + " tiles)." : r.station.name + " built."); updateOverlay(); return; }
  if (tool === "signal") { const k = key(t.x, t.y), prev = S.signals[k] ? { ...S.signals[k] } : null; const r = cycleSignal(t.x, t.y); if (!r.ok) return toast(r.reason, true); pushUndo({ kind: "signal", k, prev, cost: r.cost }); sound.play("click"); toast(signalText(r.signal)); return; }
  if (tool === "railDepot") { const r = placeDepot(t.x, t.y, "rail"); if (!r.ok) return toast(r.reason, true); pushUndo({ kind: "depot", id: r.depot.id, cost: r.cost }); sound.play("build"); toast(r.depot.name + " built."); return; }
  if (tool === "busStop" || tool === "truckStop") {
    const r = placeStation(t.x, t.y, tool, "player"); if (!r.ok) return toast(r.reason, true);
    pushUndo({ kind: "station", id: r.station.id, tile: r.tile, cost: r.cost });
    sound.play("build"); toast(r.station.name + " built."); updateOverlay(); return;
  }
  if (tool === "depot") { const r = placeDepot(t.x, t.y); if (!r.ok) return toast(r.reason, true); pushUndo({ kind: "depot", id: r.depot.id, cost: r.cost }); sound.play("build"); toast(r.depot.name + " built."); return; }
  if (tool === "bridge") { const r = buildCrossing(t.x, t.y); if (!r.ok) return toast(r.reason, true); pushUndo({ kind: "crossing", net: r.net, tiles: r.added, cost: r.span.cost }); toast("Built a " + r.span.kind + " (" + r.span.length + " tiles) for " + money(r.span.cost) + "."); return; }
  if (tool === "raise" || tool === "lower") {
    const f = tool === "raise" ? terrain.raiseTile : terrain.lowerTile;
    const h0 = S.map.height.slice(), w0 = S.map.water.slice();
    const r = f(S.map, t.x, t.y, S.inflation * S.settings.cost);
    if (!r.ok) return toast(r.reason || "Cannot do that here.", true);
    if (S.company.cash < r.cost) { S.map.height.set(h0); S.map.water.set(w0); toast("Not enough money. That costs " + money(r.cost) + ".", true); return; }
    spend("construction", r.cost); pushUndo({ kind: "terrain", changes: terrainDiff(h0, w0), cost: r.cost }); sound.play("build"); return;
  }
  if (tool === "bulldoze") { const r = bulldoze(t.x, t.y); if (!r.ok) return toast(r.reason, true); sound.play("demolish"); return; }
}
function inspectAt(p, t) {
  // vehicle first (screen distance)
  let bestV = null, bd = 18;
  for (const v of S.vehicles) { const q = vehiclePos(v); const sx = view.x + q.x * view.z, sy = view.y + (q.y - 8) * view.z; const d = Math.hypot(sx - p.x, sy - p.y); if (d < bd) { bd = d; bestV = v; } }
  if (bestV) return vehicleWin(bestV);
  const i = key(t.x, t.y);
  const st = R.stationAt.get(i); if (st) return stationWin(st);
  const dp = R.depotAt.get(i); if (dp) return shopWin(dp, dp.kind === "rail" ? "train" : "bus");
  for (const ind of S.map.industries) if (Math.abs(ind.x - t.x) <= 1 && Math.abs(ind.y - t.y) <= 1) return industryWin(ind);
  const tw = S.map.towns.find(tt => Math.hypot(tt.x - t.x, tt.y - t.y) <= tt.radius + 1); if (tw && (R.bld.has(i) || R.roads.hasRoad(t.x, t.y))) return townWin(tw);
  toast("Nothing to inspect here.");
}

// ------------------------------------------------------------------- windows
function townWin(t) {
  openWin("town", t.name, body => {
    body.innerHTML = "<p><b>" + t.name + "</b> is a " + t.size + ".</p><div class='kv'><span>Population</span><b>" + t.population.toLocaleString("en-GB") + "</b></div><div class='kv'><span>Buildings</span><b>" + t.buildings.length + "</b></div><div class='kv'><span>Street plan</span><b>" + t.style + "</b></div><div class='kv'><span>Stations serving it</span><b>" + t.activeStations + "</b></div>";
    body.appendChild(btn("Fund new buildings (" + money(cost(8000 + t.population * 8)) + ")", () => { const c = cost(8000 + t.population * 8); if (S.company.cash < c) return toast("Not enough money.", true); spend("other", c); t.fundedBuildDaysLeft = EV.FUNDING_DAYS; toast("Funded. " + t.name + " will grow fast for a while."); }));
  });
}
function vehiclesFor(cargo) {
  const y = S.date.year, pick = t => V.availableModels(y, t).filter(m => m.cargo === cargo).map(m => m.name);
  return { road: cargo === "passengers" ? pick("bus") : pick("truck"), rail: pick("wagon") };
}
function industryWin(i) {
  openWin("ind", i.name, body => {
    const ch = core.CHAINS[i.kind] || {}, out = ch.out, ins = ch.in || [];
    const kindName = i.kind.replace(/([A-Z])/g, " $1").toLowerCase();
    let h = "<div class='kv'><span>Type</span><b>" + kindName + "</b></div>";
    if (out) h += "<div class='kv'><span>Produces</span><b>" + out + (ins.length ? " (from " + ins.join(" + ") + " delivered here)" : ", about " + i.productionPerMonth + " a month") + "</b></div>";
    h += "<div class='kv'><span>Accepts</span><b>" + (ins.join(", ") || "nothing") + "</b></div>";
    if (ins.length) h += "<div class='kv'><span>Delivered so far</span><b>" + ins.map(c => ((i.received || {})[c] || 0) + " " + c).join(", ") + "</b></div>";
    if (ins.length) h += "<div class='kv'><span>Waiting to process</span><b>" + (ins.map(c => (i.input[c] || 0) + " " + c).join(", ")) + "</b></div>";
    if (out) h += "<div class='kv'><span>Station rating</span><b>" + Math.round(serviceRatingOf(i.id) * 100) + "%</b></div>";
    const cargos = [...(out ? [out] : []), ...ins.filter(c => c !== out)];
    for (const c of cargos) {
      const v = vehiclesFor(c);
      h += "<h4>" + c + " vehicles</h4><div class='kv'><span>Trucks</span><b style='text-align:right'>" + (v.road.join(", ") || "none yet") + "</b></div><div class='kv'><span>Wagons</span><b style='text-align:right'>" + (v.rail.join(", ") || "none yet") + "</b></div>";
    }
    if (out === "goods") h += "<p class='dim'>Goods are delivered to towns: put the drop-off stop where it covers at least four houses.</p>";
    body.innerHTML = h;
  });
}
function stationWin(s) {
  ui.overlay = new Set(ST.catchmentTiles(s, S.map.w, S.map.h).map(q => q.y * S.map.w + q.x));
  const o = openWin("st" + s.id, s.name, (body, o) => {
    o.refresh = () => {
      const cs = Object.keys(s.served);
      let h = "<div class='kv'><span>Type</span><b>" + ({ busStop: "Bus stop", truckStop: "Truck stop", trainStation: "Train station" })[s.kind] + "</b></div>";
      const c = covered(s); h += "<div class='kv'><span>Covers</span><b>" + c.houses + " buildings" + (c.inds.length ? ", " + c.inds.length + " industr" + (c.inds.length > 1 ? "ies" : "y") : "") + "</b></div>";
      h += "<table class='tb'><tr><th>Cargo</th><th>Waiting</th><th>Rating</th></tr>" + (cs.length ? cs.map(k => "<tr><td>" + k + "</td><td>" + (s.waiting[k] || 0) + "</td><td>" + Math.round(ST.ratingOf(s, k) * 100) + "%</td></tr>").join("") : "<tr><td colspan=3>No vehicle has served this stop yet.</td></tr>") + "</table>";
      body.innerHTML = h;
    };
    o.refresh();
  }, { live: 1000 });
  const w = openWins["st" + s.id]; const x = w.w.querySelector(".wx"); const old = x.onclick; x.onclick = () => { ui.overlay = null; old(); };
}
function vehicleWin(vh) {
  const m = modelOf(vh);
  openWin("veh" + vh.id, m.name, (body, o) => {
    const live = el("div"), ord = el("div"), acts = el("div", "row");
    body.appendChild(el("div", "spr", V.vehicleSvg(m, 46))); body.appendChild(live); body.appendChild(ord); body.appendChild(acts);
    function renderLive() {
      if (!S.vehicles.includes(vh)) return closeWin("veh" + vh.id);
      const c = vh.core, rel = Math.round(c.reliability * 100);
      const status = vh.broken ? "Broken down" : core.needsService(c) ? "Needs servicing" : vh.state === "docked" ? "Loading at a stop" : vh.state === "idle" ? "Waiting" : "Running";
      live.innerHTML = "<div class='kv'><span>Status</span><b>" + status + "</b></div><div class='kv'><span>Cargo</span><b>" + vh.loaded + " / " + m.capacity + " " + vh.cargo + "</b></div><div class='kv'><span>Age</span><b>" + (c.ageDays / 365).toFixed(1) + " years</b></div><div class='kv'><span>Speed</span><b>" + m.speedKmh + " km/h</b></div>" +
        "<div class='kv'><span>Reliability</span><b>" + rel + "%</b></div><div class='bar'><i style='width:" + rel + "%'></i></div>" +
        "<div class='kv'><span>Profit this year</span><b class='" + (vh.profit.thisYear < 0 ? "neg" : "") + "'>" + money(vh.profit.thisYear) + "</b></div><div class='kv'><span>Profit last year</span><b>" + money(vh.profit.lastYear) + "</b></div><div class='kv'><span>Value</span><b>" + money(core.vehicleSalePrice(c, m)) + "</b></div>";
    }
    function renderOrders() { ordersEditor(vh, ord); }
    o.refresh = renderLive; renderLive(); renderOrders();
    if (vh.owner === "player") {
      acts.appendChild(btn("Send for service", () => { const dp = nearestDepot(vh.tile, depotKindOf(m)); if (!dp) return toast("Build a depot on the same road or track first.", true); vh.orders.orders.splice(vh.orders.current, 0, { kind: "depot", depotId: dp.id, temp: true }); vh.orders.phase = "travelling"; vh.state = "idle"; renderOrders(); toast("Heading to the depot."); }));
      acts.appendChild(btn("Skip order", () => { OR.skipOrder(vh.orders); vh.state = "idle"; renderOrders(); }));
      acts.appendChild(btn("Sell", () => { const v = sellVehicle(vh); toast("Sold for " + money(v) + "."); closeWin("veh" + vh.id); }, "danger"));
    }
  }, { live: 1000 });
}

// ---- vehicle shop
const CARGO_NAME = { coal: "Coal", wood: "Timber", grain: "Grain", steel: "Steel", goods: "Goods", mail: "Mail", passengers: "Passengers" };
// Every material on this map with the wagons that carry it, and where it comes from.
function trainCargoes(models) {
  const m = S.map, order = ["coal", "wood", "grain", "steel", "goods", "passengers", "mail"];
  const plural = { coalMine: ["coal mine", "coal mines"], forest: ["forest", "forests"], farm: ["farm", "farms"], steelMill: ["steel mill", "steel mills"], sawmill: ["sawmill", "sawmills"], factory: ["factory", "factories"] };
  return order.map(c => {
    const wagons = models.filter(w => w.type === "wagon" && w.cargo === c).sort((a, b) => a.introYear - b.introYear);
    let sources = 0, where = "";
    if (c === "passengers" || c === "mail") { sources = m.towns.length; where = sources + " towns"; }
    else { const by = {}; for (const i of m.industries) if (CARGO_FROM_IND[i.kind] === c) by[i.kind] = (by[i.kind] || 0) + 1; sources = Object.values(by).reduce((a, b) => a + b, 0); where = Object.entries(by).map(([k, n]) => n + " " + plural[k][n === 1 ? 0 : 1]).join(", ") || "none on this map"; }
    return { cargo: c, wagons, sources, where };
  }).filter(f => f.wagons.length);
}
function shopWin(depot, startTab) {
  const year = S.date.year;
  let trainCargo = "", curWagon = null, depSel = depot ? depot.id : null, tab = startTab || "bus", cargoF = "all", pick = "", wagonPick = "", wagons = 5, locoPick = "";
  openWin("shop", depot ? "Buy vehicles · " + depot.name : "Buy vehicles", (body, o) => {
    function render() {
      const models = V.availableModels(year);
      const types = tab === "train" ? ["locomotive"] : [tab];
      let inTab = models.filter(m => types.includes(m.type));
      const cargoes = [...new Set(inTab.map(m => m.cargo))];
      if (tab === "truck" && cargoF !== "all") inTab = inTab.filter(m => m.cargo === cargoF);
      inTab.sort((a, b) => a.introYear - b.introYear || a.price - b.price);
      const sel = inTab.find(m => m.id === (tab === "train" ? locoPick : pick)) || inTab[0];
      let h = "<div class='tabs'>" + ["bus", "truck", "train"].map(t => "<button class='" + (t === tab ? "on" : "") + "' data-a='tab' data-v='" + t + "'>" + ({ bus: "Buses", truck: "Trucks", train: "Trains" })[t] + "</button>").join("") + "</div>";
      if (tab === "truck" && cargoes.length > 1) h += "<div class='chips'>" + ["all", ...cargoes].map(c => "<button class='" + (c === cargoF ? "on" : "") + "' data-a='cargo' data-v='" + c + "'>" + (c === "all" ? "All cargo" : c) + "</button>").join("") + "</div>";
      if (tab === "train") {
        const fams = trainCargoes(models);
        if (!fams.some(f => f.cargo === trainCargo)) trainCargo = (fams.find(f => f.sources > 0) || fams[0]).cargo;
        h += "<h4>1. Material</h4><div class='mats'>" + fams.map(f => "<button class='mat" + (f.cargo === trainCargo ? " on" : "") + (f.sources ? "" : " none") + "' data-a='mat' data-v='" + f.cargo + "'><span class='ms'>" + V.vehicleSvg(f.wagons[0], 22) + "</span><b>" + CARGO_NAME[f.cargo] + "</b><span class='dim'>" + f.where + "</span></button>").join("") + "</div>";
        const wl = fams.find(f => f.cargo === trainCargo).wagons;
        if (!wl.some(w => w.id === wagonPick)) wagonPick = wl[wl.length - 1].id;
        h += "<h4>2. Wagon</h4><div class='list short'>" + wl.map(w => "<div class='li" + (w.id === wagonPick ? " on" : "") + "' data-a='wag' data-v='" + w.id + "'><span class='ls'>" + V.vehicleSvg(w, 26) + "</span><span class='ln'>" + w.name + "</span><span>" + w.capacity + " " + V.cargoUnitLabel(w.cargo) + "</span></div>").join("") + "</div>";
        h += "<h4>3. Locomotive</h4>";
      }
      h += "<div class='list'>" + (inTab.length ? inTab.map(m => "<div class='li" + (sel && m.id === sel.id ? " on" : "") + "' data-a='pick' data-v='" + m.id + "'><span class='ls'>" + V.vehicleSvg(m, 30) + "</span><span class='ln'>" + m.name + "</span><span>" + money(m.price) + "</span></div>").join("") : "<p class='dim'>Nothing available yet.</p>") + "</div>";
      if (sel) {
        let price = sel.price, speed = sel.speedKmh, runCost = sel.runningCostPerYear, capTxt = V.capacityText(sel), preview, warn = "";
        if (tab === "train") {
          const w = V.getModel(wagonPick);
          curWagon = w; const cs = V.consistStats(sel.id, w.id, wagons); wagons = cs.n; price = cs.price; speed = cs.speedKmh; runCost = cs.runningCostPerYear; capTxt = cs.capacity + " " + V.cargoUnitLabel(w.cargo); warn = cs.warnings.join(" ");
          if (/^(Volt|Arc|Meridian|Tempest)/.test(sel.name)) warn = (warn ? warn + " " : "") + "Electric: needs electrified track (Electrify tool), including the depot.";
          h += "<div class='kv'><span>Train length</span><b>" + trainLen({ parts: { n: cs.n } }) + " tiles</b></div>";
          preview = V.trainSvg(sel.id, w.id, cs.n, 48);
          h += "<div class='prev'>" + preview + "</div><div class='dim'>" + (CARGO_USE[w.cargo] || "") + "</div><div class='row'>Wagons <button class='gb sm' data-a='wm'>−</button><b>" + cs.n + "</b><button class='gb sm' data-a='wp'>+</button></div>";
        } else h += "<div class='prev'>" + V.vehicleSvg(sel, 48) + "</div>";
        if (tab !== "train" && sel.cargo) h += "<div class='kv'><span>Used for</span><b style='text-align:right'>" + (CARGO_USE[sel.cargo] || sel.cargo) + "</b></div>";
        h += "<div class='kv'><span>Cost</span><b>" + money(price) + "</b></div><div class='kv'><span>Speed</span><b>" + speed + " km/h</b></div><div class='kv'><span>Running cost</span><b>" + money(runCost) + " / year</b></div><div class='kv'><span>Capacity</span><b>" + capTxt + "</b></div><div class='kv'><span>Designed / life</span><b>" + sel.introYear + " / " + sel.maxAgeYears + " years</b></div><div class='kv'><span>Max. reliability</span><b>" + Math.round(sel.baseReliability * 100) + "%</b></div>";
        if (warn) h += "<p class='warn'>" + warn + "</p>";
        const dk = tab === "train" ? "rail" : "road", deps = S.depots.filter(d => (d.kind || "road") === dk), hasDepot = deps.length > 0;
        if (hasDepot) { if (!deps.some(d => d.id === depSel)) depSel = deps[0].id; h += "<div class='kv'><span>Build at</span>" + (deps.length > 1 ? "<select data-a='depot'>" + deps.map(d => "<option value='" + d.id + "'" + (d.id === depSel ? " selected" : "") + ">" + d.name + "</option>").join("") + "</select>" : "<b>" + deps[0].name + "</b>") + "</div>"; }
        h += "<button class='gb wide' data-a='buy'" + (!hasDepot ? " disabled" : "") + ">" + (!hasDepot ? (dk === "rail" ? "Build a train depot first" : "Build a road depot first") : S.company.cash < price ? "Not enough money" : tab === "train" ? "Build train" : "Build vehicle") + "</button>";
      }
      body.innerHTML = h;
      const keep = body.querySelector(".list"); if (keep && o.scroll) keep.scrollTop = o.scroll;
      body.querySelector(".list") && body.querySelector(".list").addEventListener("scroll", ev => { o.scroll = ev.target.scrollTop; });
      body.onclick = ev => {
        const t = ev.target.closest("[data-a]"); if (!t) return; const a = t.dataset.a, v = t.dataset.v;
        if (a === "tab") { tab = v; cargoF = "all"; }
        else if (a === "cargo") cargoF = v;
        else if (a === "pick") { if (tab === "train") locoPick = v; else pick = v; }
        else if (a === "mat") { trainCargo = v; wagonPick = ""; }
        else if (a === "wag") wagonPick = v;
        else if (a === "wm") wagons = Math.max(1, wagons - 1);
        else if (a === "wp") wagons = Math.min(20, wagons + 1);
        else if (a === "buy") {
          const dk = tab === "train" ? "rail" : "road", dep = S.depots.find(d => d.id === depSel && (d.kind || "road") === dk) || S.depots.find(d => (d.kind || "road") === dk);
          if (!dep) return toast("Build a " + (dk === "rail" ? "train depot on a track" : "depot on a road") + " first.", true);
          let mid = sel.id;
          if (tab === "train") { const tm = V.buildTrainModel(sel.id, curWagon.id, wagons); if (!tm) return toast("That train cannot be built.", true); mid = tm.id; }
          const r = buyVehicle(mid, dep); if (!r.ok) return toast(r.msg, true);
          toast((tab === "train" ? "Train" : sel.name) + " built" + (r.pair ? "." : ". Add two stops in its orders.")); closeWin("shop"); vehicleWin(r.vh); return;
        }
        render();
      };
      body.onchange = ev => { if (ev.target.dataset.a === "wagon") { wagonPick = ev.target.value; render(); } if (ev.target.dataset.a === "depot") { depSel = ev.target.value; render(); } };
    }
    render();
  });
}
function openShop() {
  const d = S.depots[0] || null;
  shopWin(d, d && d.kind === "rail" ? "train" : "bus");
  if (!d) toast("You can browse, but you need a depot before you can buy. Use the Depot or Train depot tool.");
}

// ---- finance
function financeWin() {
  flushLedger();
  openWin("fin", "Company Finances", (body, o) => {
    const CATS = [["incomeRail", "Train income", 1], ["incomeRoad", "Road vehicle income", 1], ["newVehicles", "New vehicles", 0], ["construction", "Construction", 0], ["runningRoad", "Road vehicle running costs", 0], ["runningRail", "Train running costs", 0], ["interest", "Loan interest", 0], ["other", "Other", 0]];
    o.refresh = () => {
      flushLedger();
      const ys = [S.date.year - 2, S.date.year - 1, S.date.year];
      const val = (y, c) => (S.ledgers.find(l => l.year === y) || { items: {} }).items[c] || 0;
      const tot = (y, inc) => CATS.filter(c => !!c[2] === inc).reduce((a, c) => a + val(y, c[0]), 0);
      let h = S.bank !== "ok" ? "<p class='warn'>" + (S.bank === "bankrupt" ? "Your company is bankrupt." : "Warning: your company is losing money. Too many losing quarters in a row means bankruptcy.") + "</p>" : "";
      h += "<div class='scroll'><table class='tb'><tr><th></th>" + ys.map(y => "<th>" + y + "</th>").join("") + "</tr>";
      for (const c of CATS.filter(c => c[2])) h += "<tr><td>" + c[1] + "</td>" + ys.map(y => "<td>" + money(val(y, c[0])) + "</td>").join("") + "</tr>";
      h += "<tr class='sum'><td>Total income</td>" + ys.map(y => "<td>" + money(tot(y, true)) + "</td>").join("") + "</tr>";
      for (const c of CATS.filter(c => !c[2])) h += "<tr><td>" + c[1] + "</td>" + ys.map(y => "<td>" + money(val(y, c[0])) + "</td>").join("") + "</tr>";
      h += "<tr class='sum'><td>Total costs</td>" + ys.map(y => "<td>" + money(tot(y, false)) + "</td>").join("") + "</tr><tr class='sum gold'><td>Profit</td>" + ys.map(y => "<td>" + money(tot(y, true) + tot(y, false)) + "</td>").join("") + "</tr></table></div>";
      h += "<div class='kv'><span>Bank balance</span><b>" + money(S.company.cash) + "</b></div><div class='kv'><span>Loan</span><b>" + money(S.company.loan) + "</b></div><div class='kv'><span>Maximum loan</span><b>" + money(S.company.maxLoan) + "</b></div><div class='kv'><span>Interest</span><b>" + Math.round(S.company.interestRate * 1000) / 10 + "% a year</b></div>";
      h += "<div class='row'><button class='gb' data-a='b'>Borrow £10,000</button><button class='gb' data-a='r'>Repay £10,000</button></div>";
      body.innerHTML = h;
      body.onclick = e => { const a = e.target.dataset.a; if (a === "b") { if (!core.borrow(S.company)) toast("You are at your maximum loan.", true); else sound.play("cash"); } if (a === "r") { if (!core.repay(S.company)) toast("Not enough cash, or no loan to repay.", true); } o.refresh(); };
    };
    o.refresh();
  }, { live: 1500 });
}

// ---- graphs
function graphsWin() {
  openWin("graphs", "Company graphs", (body, o) => {
    const SER = { income: ["Income", "#2f8f4a"], expenses: ["Expenses", "#c0392b"], cash: ["Cash", "#d8a82e"], companyValue: ["Company value", "#2e6f9e"], cargoDelivered: ["Cargo moved", "#7b3fa0"], vehicles: ["Vehicles", "#e07b00"] };
    let active = ["income", "expenses", "companyValue"];
    function render() {
      const d = S.history.slice(-60);
      let h = "";
      if (d.length < 2) h = "<p class='dim'>Not enough data yet. Let the game run for a couple of months.</p>";
      else {
        const W = 320, Hh = 170, L = 44, Rr = 8, Tt = 8, B = 20;
        const mixed = active.some(k => ["cargoDelivered", "vehicles"].includes(k)) && active.some(k => !["cargoDelivered", "vehicles"].includes(k));
        const vals = k => d.map(r => r[k] || 0);
        const all = active.flatMap(vals); const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
        const x = i => L + i / (d.length - 1) * (W - L - Rr);
        const yf = (a, b) => v => Tt + (1 - (v - a) / (b - a)) * (Hh - Tt - B);
        let g = "";
        for (let t = 0; t <= 4; t++) { const v = lo + (hi - lo) * t / 4, yy = yf(lo, hi)(v); g += "<line x1='" + L + "' x2='" + (W - Rr) + "' y1='" + yy + "' y2='" + yy + "' stroke='#b8b088'/>" + (mixed ? "" : "<text x='" + (L - 4) + "' y='" + (yy + 3) + "' font-size='9' text-anchor='end' fill='#4a4426'>" + (Math.abs(v) >= 1000 ? Math.round(v / 1000) + "k" : Math.round(v)) + "</text>"); }
        d.forEach((r, i) => { if (r.month === 0) g += "<text x='" + x(i) + "' y='" + (Hh - 6) + "' font-size='9' text-anchor='middle' fill='#4a4426'>" + r.year + "</text>"; });
        for (const k of active) { const vs = vals(k); const a = mixed ? Math.min(0, ...vs) : lo, b = mixed ? Math.max(1, ...vs) : hi; g += "<polyline fill='none' stroke='" + SER[k][1] + "' stroke-width='2' points='" + vs.map((v, i) => x(i).toFixed(1) + "," + yf(a, b)(v).toFixed(1)).join(" ") + "'/>"; }
        h = "<svg viewBox='0 0 " + W + " " + Hh + "' class='gr'>" + g + "</svg>";
      }
      h += "<div class='chips'>" + Object.keys(SER).map(k => "<button data-k='" + k + "' class='" + (active.includes(k) ? "on" : "") + "' style='border-color:" + SER[k][1] + "'>" + SER[k][0] + "</button>").join("") + "</div>";
      body.innerHTML = h;
      body.onclick = e => { const k = e.target.dataset.k; if (!k) return; active = active.includes(k) ? (active.length > 1 ? active.filter(z => z !== k) : active) : [...active, k]; render(); };
    }
    render(); o.refresh = null;
  });
}

// ---- company / objectives / rivals
function companyWin() {
  openWin("company", "Company", (body, o) => {
    o.refresh = () => {
      const pv = playerVehicles();
      const r = EV.performanceRating({ vehicles: pv.map(v => ({ ageYears: v.core.ageDays / 365, speedKmh: modelOf(v).speedKmh })), stations: S.stations.filter(s => s.owner === "player").length, quarterlyIncome: S.quarterlyIncome, cargoDeliveredQuarter: S.metrics.quarterCargo, cash: S.company.cash, loan: S.company.loan, maxLoan: S.company.maxLoan, inflation: S.inflation });
      const m = metricsNow();
      let h = "<div class='big'>" + r.total + " <small>/ 1000</small></div><p><b>" + r.title + "</b></p><div class='scroll'><table class='tb'>" + r.parts.map(p => "<tr><td>" + p.label + "</td><td>" + p.score + " / " + p.max + "</td></tr>").join("") + "</table></div>";
      h += "<h4>Objectives</h4>" + S.objectives.map(ob => { const pr = Math.round(EV.progress(ob, m) * 100); return "<div class='obj " + ob.status + "'><div>" + ob.title + (ob.deadlineYear ? " <span class='dim'>by " + ob.deadlineYear + "</span>" : "") + (ob.status !== "active" ? " <b>(" + ob.status + ")</b>" : "") + "</div><div class='bar'><i style='width:" + pr + "%'></i></div></div>"; }).join("");
      h += "<h4>Companies</h4><table class='tb'><tr><th>Company</th><th>Cash</th><th>Routes</th></tr><tr><td><b>" + S.name + "</b></td><td>" + money(S.company.cash) + "</td><td>" + new Set(pv.map(v => v.orders.orders.map(o => o.stationId).join(">"))).size + "</td></tr>" + S.rivals.map(rv => "<tr><td style='color:" + rv.color + "'><b>" + rv.ai.name + "</b>" + (rv.ai.bankrupt ? " (bankrupt)" : "") + "</td><td>" + money(rv.ai.cash) + "</td><td>" + rv.ai.routes.length + "</td></tr>").join("") + "</table>";
      body.innerHTML = h;
    };
    o.refresh();
  }, { live: 2000 });
}

// ---- news
function newsWin() {
  openWin("news", "News", (body, o) => {
    o.refresh = () => {
      const items = EV.latestNews(S.news, 30);
      body.innerHTML = items.length ? items.map(n => "<div class='nw " + n.kind + "' data-id='" + n.id + "'><span class='dim'>" + EV.MONTH_NAMES[n.date.month].slice(0, 3) + " " + n.date.year + "</span> " + n.text + (n.x != null ? " <button data-go='" + n.x + "," + n.y + "'>Show</button>" : "") + (n.offer ? " <button class='gb sm' data-acc='" + n.id + "'>Accept</button>" : "") + "</div>").join("") : "<p class='dim'>No news yet.</p>";
      body.onclick = e => {
        const g = e.target.dataset.go; if (g) { const [x, y] = g.split(",").map(Number); centerOn(x, y); }
        const a = e.target.dataset.acc; if (a) { const r = EV.acceptOffer(S.news, +a, S.company.cash); if (!r) return toast("You cannot afford that, or the offer has expired.", true); spend("other", r.cost); const t = S.map.towns.find(z => z.id === r.townId); if (t) t.fundedBuildDaysLeft = EV.FUNDING_DAYS; toast("Offer accepted."); o.refresh(); }
      };
    };
    o.refresh();
  }, { live: 2000 });
}
