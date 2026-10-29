// ------------------------------------------------------------- orders editing
// Pure helpers first (tested), then the DOM editor and the fleet list.
function markServed(s, cargo) { if (!s) return; s.served[cargo] = true; if (s.daysSincePickup[cargo] == null) s.daysSincePickup[cargo] = 0; }
function resetIfCurrent(vh, i) {
  if (i === vh.orders.current && vh.state === "docked") { vh.orders.phase = "travelling"; vh.orders.dwellDays = 0; vh.state = "idle"; }
}
function setStopStation(vh, i, sid) {
  const od = vh.orders.orders[i]; if (!od || od.kind !== "stop") return false;
  const s = stationById(sid); if (!s) return false;
  od.stationId = sid; markServed(s, vh.cargo); resetIfCurrent(vh, i); return true;
}
function setStopLoad(vh, i, mode) { const od = vh.orders.orders[i]; if (!od || od.kind !== "stop" || !["auto", "full", "none"].includes(mode)) return false; od.load = mode; return true; }
function setStopUnload(vh, i, mode) { const od = vh.orders.orders[i]; if (!od || od.kind !== "stop" || !["auto", "none"].includes(mode)) return false; od.unload = mode; return true; }
function addStopTo(vh, sid, load) { const s = stationById(sid); if (!s) return false; OR.addStop(vh.orders, sid, load || "auto"); markServed(s, vh.cargo); if (vh.state === "idle" && vh.orders.orders.length === 1) vh.orders.phase = "travelling"; return true; }
function removeStop(vh, i) { if (!vh.orders.orders[i]) return false; const wasCur = i === vh.orders.current; OR.removeOrder(vh.orders, i); if (wasCur) { vh.orders.phase = "travelling"; if (vh.state === "docked") vh.state = "idle"; } return true; }
function moveOrder(vh, i, dir) {
  const o = vh.orders, j = i + dir; if (j < 0 || j >= o.orders.length) return false;
  [o.orders[i], o.orders[j]] = [o.orders[j], o.orders[i]];
  if (o.current === i) o.current = j; else if (o.current === j) o.current = i;
  return true;
}
function similarVehicles(vh) { const m = modelOf(vh); return playerVehicles().filter(v => v !== vh && v.cargo === vh.cargo && stationKindFor(modelOf(v)) === stationKindFor(m) && isJet(modelOf(v)) === isJet(m)); }
function copyOrdersToSimilar(vh) {
  const list = similarVehicles(vh);
  for (const v of list) { const n = OR.cloneOrders(vh.orders, v.id); v.orders = n; v.state = v.state === "docked" ? "idle" : v.state; for (const od of n.orders) if (od.kind === "stop") markServed(stationById(od.stationId), v.cargo); }
  return list.length;
}
function stopNote(s, cargo) {
  const p = producesAt(s, cargo), a = acceptsAt(s, cargo);
  return p && a ? "picks up and delivers " + cargo : p ? "has " + cargo + " to pick up" : a ? "accepts " + cargo : "no " + cargo + " here";
}
function orderWarnings(vh) {
  const out = OR.validate(vh.orders, id => !!stationById(id)).slice(0, 2);
  const stops = vh.orders.orders.filter(o => o.kind === "stop").map(o => ({ o, s: stationById(o.stationId) })).filter(x => x.s);
  if (stops.length >= 2) {
    if (!stops.some(x => x.o.load !== "none" && producesAt(x.s, vh.cargo))) out.push("None of these stops has " + vh.cargo + " to pick up.");
    if (!stops.some(x => x.o.unload !== "none" && acceptsAt(x.s, vh.cargo))) out.push("None of these stops accepts " + vh.cargo + ", so nothing gets paid.");
  }
  if (isShip(vh) && R.sea) for (const x of stops) if (x.s.water && !R.sea.connected(vh.tile, x.s.water)) out.push(x.s.name + " is on other water. This ship cannot sail there.");
  for (const x of stops) if (x.o.load === "full" && !producesAt(x.s, vh.cargo)) out.push("Full load at " + x.s.name + " will wait a long time: there is no " + vh.cargo + " there.");
  return out;
}

// Stops in the towns this vehicle already serves that it could also call at.
function townStopsMissing(vh) {
  const have = new Set(vh.orders.orders.filter(o => o.kind === "stop").map(o => o.stationId)), towns = new Set();
  for (const id of have) { const s = stationById(id); if (s) covered(s).towns.forEach(t => towns.add(t)); }
  if (!towns.size) return [];
  return S.stations.filter(s => !have.has(s.id) && reachable(vh, s) && (producesAt(s, vh.cargo) || acceptsAt(s, vh.cargo)) && [...covered(s).towns].some(t => towns.has(t)));
}
// Put each missing stop right after the stop in the same town that it is closest to.
function addTownStops(vh) {
  const add = townStopsMissing(vh);
  for (const s of add) {
    const list = vh.orders.orders; let at = list.length, bd = 1e9;
    list.forEach((o, i) => { if (o.kind !== "stop") return; const t = stationById(o.stationId); if (!t) return; const d = Math.abs(t.x - s.x) + Math.abs(t.y - s.y); if (d < bd && [...covered(t).towns].some(x => covered(s).towns.has(x))) { bd = d; at = i + 1; } });
    OR.addStop(vh.orders, s.id, "auto"); const o = list.pop(); list.splice(at, 0, o); if (vh.orders.current >= at && list.length > 1) vh.orders.current++;
    markServed(s, vh.cargo);
  }
  return add.length;
}
function ordersEditor(vh, box, onChange) {
  const m = modelOf(vh), mine = vh.owner === "player";
  function render() {
    // only stops this vehicle can drive, sail or fly to from where it is now
    const sts = S.stations.filter(s => mine ? reachable(vh, s) : (s.owner === vh.owner || s.owner === "public"));
    const opt = (sel) => { const cur = sel && !sts.some(s => s.id === sel) ? stationById(sel) : null; return (cur ? "<option value='" + cur.id + "' selected>" + cur.name + " (not reachable)</option>" : "") + sts.map(s => "<option value='" + s.id + "'" + (s.id === sel ? " selected" : "") + ">" + s.name + "</option>").join(""); };
    let h = "<h4>Orders</h4>";
    const list = vh.orders.orders;
    if (!list.length) h += "<p class='dim'>No orders yet. Add at least two stops.</p>";
    list.forEach((od, i) => {
      const cur = i === vh.orders.current;
      if (od.kind === "depot") { h += "<div class='oe" + (cur ? " cur" : "") + "'><div class='oh'><b>" + (i + 1) + ".</b> Service at depot" + (od.temp ? " (once)" : "") + (mine ? "<span class='grow'></span><button data-a='del' data-i='" + i + "'>Remove</button>" : "") + "</div></div>"; return; }
      const s = stationById(od.stationId);
      h += "<div class='oe" + (cur ? " cur" : "") + "'><div class='oh'><b>" + (i + 1) + ".</b>" + (cur ? " <span class='tag'>next</span>" : "") +
        (mine ? "<select data-f='st' data-i='" + i + "'>" + (s ? "" : "<option>(removed)</option>") + opt(od.stationId) + "</select>" : " " + (s ? s.name : "(removed)")) + "</div>" +
        (s ? "<div class='dim small'>" + stopNote(s, vh.cargo) + "</div>" : "") +
        (mine ? "<div class='row'><select data-f='load' data-i='" + i + "'><option value='auto'" + (od.load === "auto" ? " selected" : "") + ">Load available</option><option value='full'" + (od.load === "full" ? " selected" : "") + ">Full load</option><option value='none'" + (od.load === "none" ? " selected" : "") + ">No loading</option></select>" +
          "<select data-f='unload' data-i='" + i + "'><option value='auto'" + (od.unload !== "none" ? " selected" : "") + ">Deliver here</option><option value='none'" + (od.unload === "none" ? " selected" : "") + ">Don't unload</option></select></div>" +
          "<div class='row'><button data-a='up' data-i='" + i + "'" + (i === 0 ? " disabled" : "") + ">Up</button><button data-a='down' data-i='" + i + "'" + (i === list.length - 1 ? " disabled" : "") + ">Down</button><button data-a='go' data-i='" + i + "'>Go here now</button><button data-a='del' data-i='" + i + "'>Remove</button></div>" : "") + "</div>";
    });
    if (mine) {
      const kindName = ({ busStop: "bus stop", truckStop: "truck stop", trainStation: "train station", dock: "dock", airport: "airport" })[stationKindFor(m)];
      h += sts.length ? "<div class='row'><select id='add-" + vh.id + "'>" + opt("") + "</select><button class='gb sm' data-a='add'>Add stop</button></div>" : "<p class='warn'>No " + kindName + " can be reached from here. Build one on the same " + (isTrain(vh) ? "track" : isShip(vh) ? "water" : "road") + ".</p>";
      if (townStopsMissing(vh).length) h += "<button class='gb sm' data-a='town'>Add the other " + kindName + "s in these towns (" + townStopsMissing(vh).length + ")</button>";
      const sim = similarVehicles(vh).length;
      if (sim) h += "<button class='gb sm' data-a='copy'>Copy these orders to " + sim + " similar vehicle" + (sim > 1 ? "s" : "") + "</button>";
    }
    const wn = orderWarnings(vh); if (wn.length) h += wn.map(w => "<p class='warn'>" + w + "</p>").join("");
    box.innerHTML = h;
  }
  box.onchange = e => {
    const t = e.target, i = +t.dataset.i, f = t.dataset.f; if (!f) return;
    if (f === "st") setStopStation(vh, i, t.value);
    if (f === "load") setStopLoad(vh, i, t.value);
    if (f === "unload") setStopUnload(vh, i, t.value);
    render(); onChange && onChange();
  };
  box.onclick = e => {
    const b = e.target.closest("button"); if (!b || !b.dataset.a) return; const a = b.dataset.a, i = +b.dataset.i;
    if (a === "del") removeStop(vh, i);
    if (a === "up") moveOrder(vh, i, -1);
    if (a === "down") moveOrder(vh, i, 1);
    if (a === "go") { vh.orders.current = i; vh.orders.phase = "travelling"; vh.orders.dwellDays = 0; if (vh.state === "docked") vh.state = "idle"; }
    if (a === "add") { const sel = box.querySelector("#add-" + vh.id); if (sel && sel.value) addStopTo(vh, sel.value); }
    if (a === "town") { const n = addTownStops(vh); toast("Added " + n + " stop" + (n === 1 ? "" : "s") + "."); }
    if (a === "copy") { const n = copyOrdersToSimilar(vh); toast("Copied to " + n + " vehicle" + (n === 1 ? "" : "s") + "."); }
    render(); onChange && onChange();
  };
  render();
}

// ------------------------------------------------------------------ fleet list
function vehStatus(vh) {
  const c = vh.core;
  if (vh.stopped) return [R.depotAt.get(key(vh.tile.x, vh.tile.y)) ? "Stopped in depot" : "Stopped", "bad"];
  if (vh.broken) return ["Broken down", "bad"];
  if (vh.red) return ["Waiting at a signal", ""];
  const d = OR.currentOrder(vh.orders);
  if (!vh.orders.orders.length) return ["No orders", "bad"];
  if (vh.state === "docked") { if (d && d.kind === "depot") return ["Being serviced", ""]; const s = d && stationById(d.stationId); return [(d && d.load === "full" ? "Waiting for full load at " : "Loading at ") + (s ? s.name : "stop"), ""]; }
  if (core.needsService(c)) return ["Needs servicing", "bad"];
  const s = d && d.kind === "stop" ? stationById(d.stationId) : null;
  return [vh.state === "moving" ? "Heading to " + (s ? s.name : "depot") : "Waiting to move", ""];
}
function routeText(vh) {
  const names = vh.orders.orders.filter(o => o.kind === "stop").map(o => { const s = stationById(o.stationId); return s ? s.name : "?"; });
  return names.length ? names.join(" → ") : "no stops";
}
function fleetWin() {
  let filter = "all", open = null, sort = "id";
  openWin("fleet", "Your vehicles", (body, o) => {
    o.w.classList.add("wide");
    function rows() {
      let list = playerVehicles().filter(v => filter === "all" || (filter === "train" ? isTrain(v) : modelOf(v).type === filter));
      if (sort === "profit") list = list.slice().sort((a, b) => b.profit.thisYear - a.profit.thisYear);
      return list;
    }
    function render() {
      const all = playerVehicles(), list = rows();
      const count = t => all.filter(v => t === "all" || (t === "train" ? isTrain(v) : modelOf(v).type === t)).length;
      let h = "<div class='chips'>" + [["all", "All"], ["bus", "Buses"], ["truck", "Trucks"], ["train", "Trains"], ["ship", "Ships"], ["aircraft", "Planes"]].filter(([k]) => k === "all" || count(k) > 0).map(([k, l]) => "<button data-f='" + k + "' class='" + (filter === k ? "on" : "") + "'>" + l + " (" + count(k) + ")</button>").join("") + "<button data-sort='1' class='" + (sort === "profit" ? "on" : "") + "'>Sort by profit</button><button data-ar='1'>Autoreplace</button></div>";
      if (!list.length) h += "<p class='dim'>" + (all.length ? "No vehicles of this kind." : "You have no vehicles yet. Build a depot and tap Buy.") + "</p>";
      h += "<div class='fleet'>" + list.map(v => {
        const m = modelOf(v);
        return "<div class='fv" + (open === v.id ? " open" : "") + "' data-v='" + v.id + "'><div class='fr' data-row='" + v.id + "'><span class='fs'>" + V.vehicleSvg(m, 22) + "</span><span class='fm'><b>#" + v.id.slice(1) + " " + (isTrain(v) ? "Train" : m.name) + "</b><span class='dim' data-route>" + routeText(v) + "</span><span data-status></span></span><span class='fp' data-profit></span></div>" +
          (open === v.id ? "<div class='fx'><div class='row'><button class='gb sm' data-show='" + v.id + "'>Show on map</button><button class='gb sm' data-det='" + v.id + "'>Details</button></div><div class='oed'></div></div>" : "") + "</div>";
      }).join("") + "</div>";
      body.innerHTML = h;
      const ex = open && body.querySelector(".fv.open .oed");
      if (ex) { const vh = all.find(v => v.id === open); if (vh) ordersEditor(vh, ex, () => { const r = body.querySelector(".fv.open [data-route]"); if (r) r.textContent = routeText(vh); }); }
      live();
    }
    function live() {
      for (const el2 of body.querySelectorAll(".fv")) {
        const v = S.vehicles.find(x => x.id === el2.dataset.v); if (!v) continue;
        const [st, cls] = vehStatus(v), m = modelOf(v);
        const se = el2.querySelector("[data-status]"); se.textContent = st + " · " + v.loaded + "/" + m.capacity + " " + v.cargo; se.className = "st " + (cls || (v.state === "moving" ? "" : "idle"));
        const pe = el2.querySelector("[data-profit]"); pe.textContent = money(v.profit.thisYear); pe.className = "fp" + (v.profit.thisYear < 0 ? " neg" : "");
      }
    }
    let lastN = -1;
    o.refresh = () => { const n = playerVehicles().length; if (n !== lastN) { lastN = n; render(); } else live(); };
    body.onclick = e => {
      const f = e.target.closest("[data-f]"); if (f && f.closest(".chips")) { filter = f.dataset.f; render(); return; }
      if (e.target.closest("[data-sort]")) { sort = sort === "profit" ? "id" : "profit"; render(); return; }
      if (e.target.closest("[data-ar]")) { autoreplaceWin(); return; }
      const sh = e.target.closest("[data-show]"); if (sh) { const v = S.vehicles.find(x => x.id === sh.dataset.show); if (v) centerOn(v.tile.x, v.tile.y); return; }
      const dt = e.target.closest("[data-det]"); if (dt) { const v = S.vehicles.find(x => x.id === dt.dataset.det); if (v) vehicleWin(v); return; }
      const r = e.target.closest("[data-row]"); if (r) { open = open === r.dataset.row ? null : r.dataset.row; render(); }
    };
    lastN = playerVehicles().length; render();
  }, { live: 1500 });
}
