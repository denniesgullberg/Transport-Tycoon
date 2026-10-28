// --------------------------------------------------------- vehicle management
// Start/stop, stop in depot, clone, old-age warnings, autorenew, autoreplace, refit,
// station details, and bays at bigger road stops.

const ELECTRIC_LOCO = /^(Volt|Arc|Meridian|Tempest)/;

// Draw a side-view sprite so it lines up with the isometric road or track it is on.
// Moving along +x the vehicle heads down-right, along +y down-left; the shear keeps
// its wheels on the ground line, which gives four distinct directions.
function isoSprite(img, x, y, w, h, dx, dy) {
  const vx = (dx - dy), vy = (dx + dy) * 0.5;               // screen direction, before scaling
  const sx = vx < 0 ? -1 : 1, shear = vx === 0 ? 0 : vy / Math.abs(vx);
  ctx.save(); ctx.transform(sx, shear, 0, 1, x, y);
  ctx.drawImage(img, -w / 2, -h * 0.82, w, h);
  ctx.restore();
}

// ---- start, stop, depot
function toggleStopped(vh) { vh.stopped = !vh.stopped; if (!vh.stopped) { vh.state = vh.state === "docked" ? "docked" : "idle"; } return vh.stopped; }
function sendToDepot(vh, andStop) {
  const dp = nearestDepot(vh.tile, depotKindOf(modelOf(vh)));
  if (!dp) return { ok: false, reason: "Build a depot on the same road or track first." };
  const cur = OR.currentOrder(vh.orders);
  if (!(cur && cur.kind === "depot")) vh.orders.orders.splice(vh.orders.current, 0, { kind: "depot", depotId: dp.id, temp: true });
  vh.orders.phase = "travelling"; vh.orders.dwellDays = 0; vh.stopAtDepot = !!andStop; vh.stopped = false;
  if (vh.state === "docked") vh.state = "idle";
  return { ok: true, depot: dp };
}
function inDepot(vh) { const d = R.depotAt.get(key(vh.tile.x, vh.tile.y)); return d && vh.state === "docked" && OR.currentOrder(vh.orders) && OR.currentOrder(vh.orders).kind === "depot" ? d : (d && vh.stopped ? d : null); }
function cloneVehicle(vh) {
  const m = modelOf(vh), dk = depotKindOf(m);
  const dp = inDepot(vh) || nearestDepot(vh.tile, dk) || S.depots.find(d => (d.kind || "road") === dk);
  if (!dp) return { ok: false, msg: "Build a depot first." };
  const r = buyVehicle(vh.modelId, dp); if (!r.ok) return r;
  r.vh.orders = OR.cloneOrders(vh.orders, r.vh.id);
  for (const od of r.vh.orders.orders) if (od.kind === "stop") markServed(stationById(od.stationId), r.vh.cargo);
  return r;
}

// ---- age, autorenew and autoreplace
function replaceRules() { if (!S.replace) S.replace = { renew: false, rules: {} }; return S.replace; }
function ageYears(vh) { return vh.core.ageDays / 365; }
function lifeOf(m) { return m.maxAgeYears || 20; }
function ageWarnings() {
  for (const vh of playerVehicles()) {
    const m = modelOf(vh), left = lifeOf(m) - ageYears(vh);
    const name = (isTrain(vh) ? "Train" : m.name) + " #" + vh.id.slice(1);
    if (left < 1 && left > 0 && !vh.warnOld1) { vh.warnOld1 = true; EV.addNews(S.news, S.date, "info", name + " is getting old. Replace it within a year.", { x: vh.tile.x, y: vh.tile.y }); }
    if (left <= 0 && !vh.warnOld2) { vh.warnOld2 = true; EV.addNews(S.news, S.date, "bad", name + " is old and breaks down more often. Replace it.", { x: vh.tile.x, y: vh.tile.y }); }
  }
}
// What this vehicle should become at its next depot visit, if anything.
function replacementFor(vh) {
  const rr = replaceRules(), m = modelOf(vh), y = S.date.year;
  if (isTrain(vh)) {
    const to = rr.rules[m.parts.locoId];
    if (to && to !== m.parts.locoId) { const tm = V.buildTrainModel(to, m.parts.wagonId, m.parts.n); if (tm) return { model: tm, why: "replace" }; }
    if (rr.renew && ageYears(vh) >= lifeOf(m) - 0.5 && V.availableModels(y, "locomotive").some(l => l.id === m.parts.locoId)) return { model: m, why: "renew" };
    return null;
  }
  const to = rr.rules[vh.modelId];
  if (to && to !== vh.modelId) { const nm = V.getModel(to); if (nm) return { model: nm, why: "replace" }; }
  if (rr.renew && ageYears(vh) >= lifeOf(m) - 0.5 && V.availableModels(y).some(x => x.id === vh.modelId)) return { model: m, why: "renew" };
  return null;
}
function renewAtDepot(vh) {
  const rp = replacementFor(vh); if (!rp) return false;
  const old = modelOf(vh), back = core.vehicleSalePrice(vh.core, old), net = rp.model.price - back;
  if (S.company.cash - net < 10000) { if (!vh.warnNoCash) { vh.warnNoCash = true; EV.addNews(S.news, S.date, "bad", "Not enough money to " + rp.why + " " + old.name + " #" + vh.id.slice(1) + ".", { x: vh.tile.x, y: vh.tile.y }); } return false; }
  S.company.cash -= rp.model.price; post("newVehicles", -rp.model.price); S.company.cash += back; post("other", back);
  vh.modelId = rp.model.id; vh.cargo = rp.model.cargo; vh.core = core.newVehicle(vh.id, rp.model); vh.core.breakdownsEnabled = S.settings.breakdowns > 0;
  vh.loaded = 0; vh.origin = null; vh.warnOld1 = vh.warnOld2 = vh.warnNoCash = false;
  if (isTrain(vh)) { const L = trainLen(rp.model); vh.trail = vh.trail.slice(0, L); }
  EV.addNews(S.news, S.date, "good", (rp.why === "renew" ? "Renewed " : "Replaced with ") + rp.model.name + " (#" + vh.id.slice(1) + ").", { x: vh.tile.x, y: vh.tile.y });
  return true;
}
function afterDepotVisit(vh) {
  if (vh.owner === "player") renewAtDepot(vh);
  if (vh.stopAtDepot) { vh.stopAtDepot = false; vh.stopped = true; toast((isTrain(vh) ? "Train" : modelOf(vh).name) + " #" + vh.id.slice(1) + " is stopped in the depot."); }
}

// ---- refit: same generation, other cargo
function refitOptions(vh) {
  const m = modelOf(vh), y = S.date.year;
  if (isTrain(vh)) {
    const w = V.getModel(m.parts.wagonId);
    return [...new Set(V.availableModels(y, "wagon").map(x => x.cargo))].filter(c => c !== w.cargo).map(c => {
      const pick = V.availableModels(y, "wagon").filter(x => x.cargo === c).sort((a, b) => Math.abs(a.introYear - w.introYear) - Math.abs(b.introYear - w.introYear))[0];
      return { cargo: c, model: V.buildTrainModel(m.parts.locoId, pick.id, m.parts.n) };
    }).filter(o => o.model);
  }
  if (m.type !== "truck") return [];
  const mfr = m.name.split(" ")[0];
  return V.availableModels(y, "truck").filter(x => x.cargo !== m.cargo && x.name.startsWith(mfr + " ")).map(x => ({ cargo: x.cargo, model: x }));
}
function refitCost(vh) { return Math.round(modelOf(vh).price * 0.1); }
function refit(vh, cargo) {
  if (!vh.stopped || !R.depotAt.get(key(vh.tile.x, vh.tile.y))) return { ok: false, reason: "Stop the vehicle in a depot first (Stop in depot)." };
  const opt = refitOptions(vh).find(o => o.cargo === cargo); if (!opt) return { ok: false, reason: "It cannot carry that." };
  const c = refitCost(vh); if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
  spend("newVehicles", c);
  const age = vh.core.ageDays, rel = vh.core.reliability;
  vh.modelId = opt.model.id; vh.cargo = cargo; vh.loaded = 0; vh.origin = null;
  vh.core = core.newVehicle(vh.id, opt.model); vh.core.ageDays = age; vh.core.reliability = rel; vh.core.breakdownsEnabled = S.settings.breakdowns > 0;
  for (const od of vh.orders.orders) if (od.kind === "stop") markServed(stationById(od.stationId), cargo);
  return { ok: true, cost: c, model: opt.model };
}

function autoreplaceWin() {
  openWin("autorep", "Autoreplace", body => {
    const rr = replaceRules();
    function render() {
      const y = S.date.year, fleet = playerVehicles();
      const groups = {};
      for (const v of fleet) { const m = modelOf(v), id = isTrain(v) ? m.parts.locoId : v.modelId; groups[id] = (groups[id] || 0) + 1; }
      let h = "<label class='set'><input type='checkbox' id='ar-renew'" + (rr.renew ? " checked" : "") + "> Autorenew: replace old vehicles with a new one of the same model when they visit a depot</label>";
      h += "<p class='dim'>Pick a newer model to swap in. Vehicles change at their next depot visit, if you keep at least £10,000.</p>";
      const ids = Object.keys(groups);
      if (!ids.length) h += "<p class='dim'>You have no vehicles yet.</p>";
      for (const id of ids) {
        const m = V.getModel(id), type = m.type === "locomotive" ? "locomotive" : m.type;
        const options = V.availableModels(y, type).filter(x => x.id !== id && (type === "locomotive" || x.cargo === m.cargo));
        h += "<div class='kv'><span>" + m.name + " × " + groups[id] + "</span></div><select data-from='" + id + "' class='wide-sel'><option value=''>Keep</option>" + options.map(o => "<option value='" + o.id + "'" + (rr.rules[id] === o.id ? " selected" : "") + ">" + o.name + " · " + o.speedKmh + " km/h" + (o.capacity ? " · " + o.capacity : "") + "</option>").join("") + "</select>";
      }
      body.innerHTML = h;
    }
    body.onchange = e => {
      if (e.target.id === "ar-renew") rr.renew = e.target.checked;
      if (e.target.dataset.from) { if (e.target.value) rr.rules[e.target.dataset.from] = e.target.value; else delete rr.rules[e.target.dataset.from]; }
      toast("Saved. Changes happen at the next depot visit.");
    };
    render();
  });
}

// ---- road stops with several bays: spread vehicles over the tiles
function bayFor(vh, st) {
  const tiles = stationTiles(st).filter(t => R.roads.hasRoad(t.x, t.y));
  if (!tiles.length) return { x: st.x, y: st.y };
  const parked = (t) => R.roads.vehiclesAt(t).filter(id => id !== vh.id && (S.vehicles.find(v => v.id === id) || {}).state === "docked").length;
  if (vh.bay && tiles.some(t => sameT(t, vh.bay)) && parked(vh.bay) < 2) return vh.bay;
  let best = tiles[0], bs = 1e9;
  for (const t of tiles) { const sc = parked(t) * 8 + Math.abs(t.x - vh.tile.x) + Math.abs(t.y - vh.tile.y); if (sc < bs) { bs = sc; best = t; } }
  vh.bay = best; return best;
}

// ---- station window with serving vehicles and rating reasons
function stationVehicles(s) { return S.vehicles.filter(v => v.owner === s.owner && v.orders.orders.some(o => o.kind === "stop" && o.stationId === s.id)); }
function ratingReasons(s, cargo) {
  const days = s.daysSincePickup[cargo] ?? 30, wait = s.waiting[cargo] || 0, out = [];
  out.push(days <= 7 ? "picked up " + days + " days ago" : "no pickup for " + days + " days");
  out.push(s.lastSpeedKmh ? "last vehicle " + s.lastSpeedKmh + " km/h" : "no vehicle yet");
  if (s.lastAgeYears >= 3) out.push("vehicles " + Math.round(s.lastAgeYears) + " years old");
  if (wait > 100) out.push(wait + " waiting is a lot");
  return out.join(", ");
}
function stationWin(s) {
  ui.overlay = new Set(ST.catchmentTiles(s, S.map.w, S.map.h).map(q => q.y * S.map.w + q.x));
  openWin("st" + s.id, s.name, (body, o) => {
    o.refresh = () => {
      if (!S.stations.includes(s)) return closeWin("st" + s.id);
      const cs = Object.keys(s.served), c = covered(s), vs = stationVehicles(s);
      let h = "<div class='kv'><span>Type</span><b>" + ({ busStop: "Bus stop", truckStop: "Truck stop", trainStation: "Train station" })[s.kind] + " · " + stationTiles(s).length + " tile" + (stationTiles(s).length > 1 ? "s" : "") + "</b></div>";
      h += "<div class='kv'><span>Covers</span><b>" + c.houses + " buildings" + (c.inds.length ? ", " + c.inds.map(i => i.name).join(", ") : "") + "</b></div>";
      h += "<h4>Cargo</h4>" + (cs.length ? cs.map(k => { const r = Math.round(ST.ratingOf(s, k) * 100); return "<div class='cg'><div class='kv'><span>" + k + "</span><b>" + (s.waiting[k] || 0) + " waiting · " + r + "%</b></div><div class='bar'><i style='width:" + r + "%;background:" + (r >= 60 ? "var(--green)" : r >= 40 ? "#c99a1e" : "var(--red)") + "'></i></div><div class='dim small'>" + ratingReasons(s, k) + "</div></div>"; }).join("") : "<p class='dim'>No vehicle has served this stop yet.</p>");
      h += "<h4>Vehicles using it (" + vs.length + ")</h4>" + (vs.length ? vs.slice(0, 12).map(v => "<div class='kv sv-row' data-v='" + v.id + "'><span>#" + v.id.slice(1) + " " + (isTrain(v) ? "Train" : modelOf(v).name) + "</span><b>" + vehStatus(v)[0] + "</b></div>").join("") : "<p class='dim'>None yet.</p>");
      body.innerHTML = h;
    };
    body.onclick = e => { const r = e.target.closest("[data-v]"); if (r) { const v = S.vehicles.find(x => x.id === r.dataset.v); if (v) vehicleWin(v); } };
    o.refresh();
  }, { live: 1000 });
  const w = openWins["st" + s.id]; const x = w.w.querySelector(".wx"); const old = x.onclick; x.onclick = () => { ui.overlay = null; old(); };
}

// Little piles of waiting cargo next to busy stations.
const PILE_COL = { passengers: "#f2d6a2", mail: "#d33", coal: "#2b2b2e", wood: "#8a5a2b", grain: "#e0c050", goods: "#3f6d9a", steel: "#8a96a3" };
function drawCargoPiles(px, py, s) {
  if (view.z < 0.9) return;
  let n = 0;
  for (const [c, w] of Object.entries(s.waiting)) {
    if (w < 10) continue;
    const k = Math.min(6, Math.ceil(w / 40));
    for (let j = 0; j < k; j++) { const ox = -12 + (n % 4) * 4 + (j % 2) * 2, oy = 4 + Math.floor(n / 4) * 3 - j * 2.5; ctx.fillStyle = PILE_COL[c] || "#999"; ctx.fillRect(px + ox, py + oy, 3.5, 2.5); }
    n++;
  }
}
