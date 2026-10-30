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
  const x = el("button", "wx", icon("close", 18)); x.setAttribute("aria-label", "Close"); x.onclick = () => closeWin(id); bar.appendChild(x);
  const body = el("div", "wbody");
  w.appendChild(bar); w.appendChild(body); wins.appendChild(w);
  const n = Object.keys(openWins).length;
  const topY = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--toph")) || 100) + 8;
  w.style.left = (12 + n * 16) + "px"; w.style.top = (topY + n * 16) + "px";
  // drag the title to move the window; on a phone the window is a sheet and a swipe down closes it
  const sheet = () => window.innerWidth <= 640;
  let drag = null;
  bar.addEventListener("pointerdown", e => { if (e.target.closest(".wx")) return; drag = { dx: e.clientX - w.offsetLeft, dy: e.clientY - w.offsetTop, y0: e.clientY }; try { bar.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or ended pointer */ } });
  bar.addEventListener("pointermove", e => {
    if (!drag) return;
    if (sheet()) { const d = Math.max(0, e.clientY - drag.y0); w.style.transform = d ? "translateY(" + d + "px)" : ""; return; }
    w.style.left = Math.max(0, e.clientX - drag.dx) + "px"; w.style.top = Math.max(0, e.clientY - drag.dy) + "px";
  });
  const endDrag = e => { if (!drag) return; const d = e.clientY - drag.y0; drag = null; if (sheet() && d > 80) closeWin(id); else w.style.transform = ""; };
  bar.addEventListener("pointerup", endDrag); bar.addEventListener("pointercancel", () => { drag = null; w.style.transform = ""; });
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


// ---- icons (24 x 24, drawn with the current text colour)
const ICON = {
  inspect: "<path d='M5 3l6.5 17 2.6-7.3L21.5 10z'/>",
  road: "<path d='M7 21L10 3M17 21L14 3M12 6v2.5M12 12v2.5M12 18v2'/>",
  busStop: "<path d='M12 22v-8'/><rect x='5' y='3' width='14' height='11' rx='2'/><path d='M8.5 7h7M8.5 10h7'/>",
  truckStop: "<path d='M2 6h11v10H2zM13 9.5h4.5L21 13v3h-8'/><circle cx='6' cy='18' r='2'/><circle cx='17' cy='18' r='2'/>",
  depot: "<path d='M3 21V9l9-5 9 5v12'/><path d='M7 21v-8h10v8M7 17h10'/>",
  track: "<path d='M8.5 3L6.5 21M15.5 3l2 18M7.5 7h9M7 12h10M6.5 17h11'/>",
  trainStation: "<path d='M2 9l10-5 10 5'/><path d='M4 9v3M20 9v3M3 21h18'/><rect x='7' y='12' width='10' height='7' rx='2'/><path d='M7 16h10'/>",
  railDepot: "<path d='M3 21V9l9-5 9 5v12'/><path d='M8 21v-5a4 4 0 018 0v5M9.5 19h5'/>",
  signal: "<path d='M12 22v-6'/><rect x='8' y='2' width='8' height='14' rx='4'/><circle cx='12' cy='6.5' r='1.6'/><circle cx='12' cy='11.5' r='1.6'/>",
  electrify: "<path d='M13 2L4.5 13.5H11L10 22l8.5-11.5H12z'/>",
  dock: "<circle cx='12' cy='5' r='2.5'/><path d='M12 7.5V21M8 11h8M4.5 13A7.5 7.5 0 0012 21a7.5 7.5 0 007.5-8'/>",
  shipyard: "<path d='M3 16l2 5h14l2-5zM6 16v-5h7v5M13 13h3l2.5 3M9 11V3h7l-3 3'/>",
  airport: "<path d='M21 15.5v-2L13 9V4a1.5 1.5 0 00-3 0v5l-8 4.5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z'/>",
  airportL: "<path d='M18 15.5v-2L11 9.5V5a1.5 1.5 0 00-3 0v4.5L1.5 13.5v2L8 13v4.5l-2 1.5V21l3-1 3 1v-2l-2-1.5V13z'/><path d='M19 3v6M16 6h6'/>",
  oneway: "<path d='M3 12h16M14 6.5l5.5 5.5-5.5 5.5'/>",
  bridge: "<path d='M2 9h20M4 9v11M20 9v11M4 16a8 6 0 0116 0M8 9v4M12 9v2M16 9v4'/>",
  raise: "<path d='M2 21l6-9 4 5 3-3 7 7zM17 3v7M14 6l3-3 3 3'/>",
  lower: "<path d='M2 21l6-9 4 5 3-3 7 7zM17 3v7M14 7l3 3 3-3'/>",
  bulldoze: "<path d='M2 14h11v5H2zM4 14V9h5l2 5M13 16h3l5-6M18 7l3 3'/><circle cx='5' cy='19' r='1'/><circle cx='10' cy='19' r='1'/>",
  undo: "<path d='M9 14L4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 010 11H11'/>",
  buy: "<path d='M2 3h3l2.7 12.4a2 2 0 002 1.6h8.6a2 2 0 002-1.5L22 7H6'/><circle cx='10' cy='20.5' r='1.3'/><circle cx='18' cy='20.5' r='1.3'/>",
  fleet: "<rect x='4' y='3' width='16' height='15' rx='3'/><path d='M4 11h16M8 21v-3M16 21v-3M8 14.5h.01M16 14.5h.01'/>",
  money: "<rect x='2' y='6' width='20' height='12' rx='2'/><circle cx='12' cy='12' r='2.8'/><path d='M6 9.5v5M18 9.5v5'/>",
  graphs: "<path d='M3 3v18h18'/><path d='M7 15l4-5 3 3 6-7'/>",
  company: "<path d='M4 21V5l8-3v19M12 9h8v12M2 21h20M7.5 7.5h1M7.5 11.5h1M7.5 15.5h1M15.5 13h1M15.5 17h1'/>",
  news: "<path d='M4 4h13v16H6a2 2 0 01-2-2zM17 8h3v10a2 2 0 01-2 2'/><path d='M7.5 8h6M7.5 12h6M7.5 16h4'/>",
  race: "<path d='M5 22V3M5 4h12l-2 4 2 4H5'/>",
  help: "<circle cx='12' cy='12' r='9.5'/><path d='M9.3 9a2.8 2.8 0 015.4 1c0 1.9-2.7 2.4-2.7 4M12 17.5h.01'/>",
  menu: "<path d='M4 7h16M4 12h16M4 17h16'/>",
  pause: "<path d='M9 5v14M15 5v14'/>",
  play: "<path d='M7 4.5v15l12.5-7.5z'/>",
  plus: "<path d='M12 5v14M5 12h14'/>",
  minus: "<path d='M5 12h14'/>",
  map: "<path d='M9 4L3 6.5v14L9 18l6 2.5 6-2.5V4l-6 2.5zM9 4v14M15 6.5v14'/>",
  close: "<path d='M6 6l12 12M18 6L6 18'/>",
};
function icon(n, size) { return "<svg class='ic' viewBox='0 0 24 24' width='" + (size || 22) + "' height='" + (size || 22) + "' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + (ICON[n] || "") + "</svg>"; }
// Put the icons on the fixed buttons once the page is up.
function decorateChrome() {
  document.querySelectorAll("#bar .nb").forEach(b => { if (!b.dataset.done) { b.innerHTML = icon(b.dataset.i) + "<span>" + b.textContent + "</span>"; b.dataset.done = 1; } });
  $("#zin").innerHTML = icon("plus", 20); $("#zout").innerHTML = icon("minus", 20); $("#bmm").innerHTML = icon("map", 20);
}
const TOOL_GROUPS = [["inspect"], ["road", "busStop", "truckStop", "depot", "oneway"], ["track", "trainStation", "railDepot", "signal", "electrify"], ["dock", "shipyard", "airport", "airportL"], ["bridge", "raise", "lower", "bulldoze"]];
const TOOL_SHORT = { busStop: "Bus stop", truckStop: "Truck stop", trainStation: "Station", railDepot: "Train depot", airportL: "City airport", raise: "Raise", lower: "Lower" };

// ---- tools
const TOOLS = [
  ["inspect", "Inspect", "Tap a vehicle, stop, depot, town or industry for details. Drag to move the map."],
  ["road", "Road", () => "Road: " + money(cost(ROAD_COST)) + " per tile. Drag to draw. Use two fingers to move or zoom without losing the line."],
  ["busStop", "Bus stop", () => "Bus stop: " + money(cost(STATION_COST)) + ". Tap a road tile near houses. Its catchment is highlighted."],
  ["truckStop", "Truck stop", () => "Truck stop: " + money(cost(STATION_COST)) + ". Tap a road tile within 3 tiles of a mine, farm, forest or factory."],
  ["depot", "Depot", () => "Depot: " + money(cost(DEPOT_COST)) + ". Tap a road tile or the land beside one. Vehicles are bought and serviced here."],
  ["track", "Track", () => "Railway track: " + money(cost(TRACK_COST)) + " per tile. Drag to lay track. Two fingers move or zoom without losing it. Track crosses roads only at a right angle."],
  ["trainStation", "Train station", () => "Train station: " + money(cost(RAIL_STATION_COST)) + ". Tap a track tile. Catchment is 4 tiles: place it beside a mine, forest, farm, factory or town."],
  ["railDepot", "Train depot", () => "Train depot: " + money(cost(RAIL_DEPOT_COST)) + ". Tap a track tile or the land beside one. Trains are built and serviced here."],
  ["signal", "Signal", () => "Signal: " + money(cost(SIGNAL_COST)) + ". Tap straight track. Each tap changes it: block one way, turned round, two-way, path signal one way, turned round, off."],
  ["electrify", "Electrify", () => "Electrify: " + money(cost(ELEC_COST)) + " per tile. Drag over track. Electric locomotives only run on electrified track."],
  ["dock", "Dock", () => "Dock: " + money(cost(2400)) + ". Tap the shore or the water beside it. Ships load and unload here."],
  ["shipyard", "Shipyard", () => "Shipyard: " + money(cost(3500)) + ". Tap open water next to the shore. Ships are built here."],
  ["airport", "Airport", () => "Small airport: " + money(cost(AIRPORTS.small.cost)) + ", 2 x 2 tiles. Tap the top corner of flat, clear land. Propeller planes only."],
  ["airportL", "City airport", () => "City airport: " + money(cost(AIRPORTS.large.cost)) + ", 3 x 3 tiles, from " + AIRPORTS.large.year + ". Jets need one at both ends."],
  ["oneway", "One-way", "One-way road: tap straight road to point traffic one way, again to turn it round, again to remove."],
  ["bridge", "Bridge", "Tap the last road or track tile before water or a hill. A bridge or tunnel is built to the far side at the same height."],
  ["raise", "Raise land", () => "Raise land: about " + money(cost(250)) + " per tile. Neighbours follow to keep slopes gentle."],
  ["lower", "Lower land", () => "Lower land: about " + money(cost(250)) + " per tile."],
  ["bulldoze", "Bulldoze", () => "Bulldoze: " + money(cost(BULLDOZE)) + ". Removes roads, track, stops, depots, houses and trees. Houses cost more and upset the town."],
];
function buildToolbar() {
  const tb = $("#tools"); tb.innerHTML = "";
  TOOL_GROUPS.forEach((g, gi) => {
    if (gi) tb.appendChild(el("span", "tsep"));
    for (const id of g) {
      const t = TOOLS.find(x => x[0] === id); if (!t) continue;
      const b = el("button", "tool" + (ui.tool === id ? " on" : ""), icon(id) + "<span>" + (TOOL_SHORT[id] || t[1]) + "</span>"); b.dataset.tool = id; b.title = t[1];
      b.onclick = () => { setTool(id); }; tb.appendChild(b);
    }
  });
  tb.appendChild(el("span", "tsep"));
  const u = el("button", "tool undo", icon("undo") + "<span>Undo</span>"); u.id = "bundo"; u.onclick = () => { const r = undoLast(); toast(r.ok ? "Undone. Refunded " + money(r.cost) + "." : r.reason, !r.ok); }; tb.appendChild(u); updateUndoBtn();
}
function setTool(id) {
  if (ui.plan && ui.plan.held && ui.plan.tool !== id) { ui.plan = null; const b = document.getElementById("planbar"); if (b) b.hidden = true; }
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
  $("#scompany").textContent = S.name;
  const mEl = $("#smoney"); mEl.textContent = money(S.company.cash); mEl.classList.toggle("neg", S.company.cash < 0);
  const pb = $("#bpause"), pk = ui.paused ? "play" : "pause"; if (pb.dataset.k !== pk) { pb.innerHTML = icon(pk, 18); pb.dataset.k = pk; pb.classList.toggle("on", ui.paused); }
  document.querySelectorAll(".spd").forEach(b => b.classList.toggle("on", !ui.paused && +b.dataset.s === ui.speed));
  const n = EV.latestNews(S.news, 1)[0];
  $("#ticker").textContent = n ? n.text : "";
  $("#ticker").className = "glass " + (n ? n.kind : "");
  ui.jump = n && n.x != null ? { x: n.x, y: n.y } : null;
}

// ---- input
// One finger: tap, drag the map, or (with Road, Track or Electrify) draw a line. Two fingers: pan and
// pinch-zoom at any time, also in the middle of drawing; the drawn line is kept. Near the edge of the
// screen the map scrolls by itself while drawing, so a line can be as long as you like.
const ptrs = new Map();
let tap = null, pinch = null, painting = false, fling = null;
const PAINT_TOOLS = ["road", "track", "electrify"];
const ZMIN = 0.45, ZMAX = 3;
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function twoFinger() { const [a, b] = [...ptrs.values()]; return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)) }; }
cv.addEventListener("pointerdown", e => {
  if (!S) return;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
  const p = pos(e); ptrs.set(e.pointerId, { x: p.x, y: p.y, t: performance.now() }); fling = null;
  if (ptrs.size === 2) {
    // a second finger: stop drawing for now but keep the line, and pan and zoom instead
    const f = twoFinger(); pinch = { ...f, z: view.z, vx: view.x, vy: view.y };
    if (painting) { painting = false; if (ui.plan) ui.plan.held = true; }
    tap = null; return;
  }
  if (ptrs.size > 2) return;
  const touch = e.pointerType === "touch";
  tap = { x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false, t: performance.now(), slop: touch ? 10 : 5, hist: [] };
  if (PAINT_TOOLS.includes(ui.tool)) {
    const t = screenToTile(p.x, p.y);
    // a held line carries on from its end if you put your finger back near it
    if (ui.plan && ui.plan.held && ui.plan.tool === ui.tool && t && Math.abs(t.x - ui.plan.end.x) + Math.abs(t.y - ui.plan.end.y) <= 1) { painting = true; ui.plan.held = false; }
    else if (!ui.plan || !ui.plan.held) { painting = true; startPlan(t); }
    else tap.keepPlan = true;   // a drag elsewhere moves the map; a tap elsewhere starts again
  }
});
cv.addEventListener("pointermove", e => {
  const p = pos(e);
  if (!S) return;
  if (!ptrs.has(e.pointerId)) { if (e.pointerType !== "touch") { ui.hover = screenToTile(p.x, p.y); updateOverlay(); } return; }
  ptrs.set(e.pointerId, { x: p.x, y: p.y, t: performance.now() });
  if (ptrs.size === 2 && pinch) {
    const f = twoFinger(), nz = clamp(pinch.z * f.d / pinch.d, ZMIN, ZMAX);
    // keep the point under the fingers' midpoint fixed while it moves and the zoom changes
    const wx = (pinch.mx - pinch.vx) / pinch.z, wy = (pinch.my - pinch.vy) / pinch.z;
    view.z = nz; view.x = f.mx - wx * nz; view.y = f.my - wy * nz; ui.follow = null;
    return;
  }
  if (!tap) return;
  if (Math.hypot(p.x - tap.x, p.y - tap.y) > tap.slop) tap.moved = true;
  if (painting) { ui.hover = screenToTile(p.x, p.y); updatePlan(ui.hover); ui.edge = edgeScroll(p); return; }
  if (tap.moved) {
    ui.follow = null; view.x = tap.vx + (p.x - tap.x); view.y = tap.vy + (p.y - tap.y);
    tap.hist.push({ x: p.x, y: p.y, t: performance.now() }); if (tap.hist.length > 6) tap.hist.shift();
  }
});
// how fast to scroll when a drawing finger is near the edge of the map (pixels per second)
function edgeScroll(p) {
  const m = 44, top = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--toph")) || 100) - cv.getBoundingClientRect().top, bot = cssH - ((parseInt(getComputedStyle(document.documentElement).getPropertyValue("--dockh")) || 80));
  const f = (d) => d < m ? (1 - d / m) * 520 : 0;
  const vx = f(p.x) - f(cssW - p.x), vy = f(p.y - top) - f(bot - p.y);
  return vx || vy ? { vx, vy, p } : null;
}
function edgeTick(dt) {
  if (!painting || !ui.edge) return;
  view.x += ui.edge.vx * dt; view.y += ui.edge.vy * dt;
  ui.hover = screenToTile(ui.edge.p.x, ui.edge.p.y); updatePlan(ui.hover);
}
function flingTick(dt) {
  if (!fling) return;
  view.x += fling.vx * dt; view.y += fling.vy * dt;
  const k = Math.exp(-dt * 5); fling.vx *= k; fling.vy *= k;
  if (Math.hypot(fling.vx, fling.vy) < 20) fling = null;
}
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  const p = pos(e); ptrs.delete(e.pointerId); ui.edge = null;
  if (ptrs.size === 1 && pinch) {
    // back to one finger after a pinch: carry on moving the map from here, without a jump
    pinch = null; const [q] = [...ptrs.values()]; tap = { x: q.x, y: q.y, vx: view.x, vy: view.y, moved: true, t: performance.now(), slop: 10, hist: [] }; return;
  }
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size > 0) return;
  if (painting) {
    painting = false;
    if (tap && !tap.moved && ui.plan && ui.plan.tiles && ui.plan.tiles.length === 1) commitPlan();
    else if (ui.plan && (ui.plan.held || ui.plan.long)) { ui.plan.held = true; showPlanBar(); }
    else commitPlan();
  } else if (tap && !tap.moved) {
    if (tap.keepPlan) { cancelPlan(); }
    else onTap(p);
  } else if (tap && tap.moved && tap.hist.length >= 2 && e.pointerType === "touch") {
    // let the map glide on after a quick swipe
    const a = tap.hist[0], b = tap.hist[tap.hist.length - 1], dt = (b.t - a.t) / 1000;
    if (dt > 0 && performance.now() - b.t < 80) { const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt; if (Math.hypot(vx, vy) > 300) fling = { vx: clamp(vx, -3000, 3000), vy: clamp(vy, -3000, 3000) }; }
  }
  if (ui.plan && ui.plan.held) showPlanBar();
  tap = null;
}
cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("wheel", e => { e.preventDefault(); const p = pos(e); const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)); zoomAt(p.x, p.y, clamp(view.z * f, ZMIN, ZMAX)); }, { passive: false });
// stop the page itself from zooming or scrolling on a pinch (Safari sends its own gesture events)
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
function zoomAt(sx, sy, nz) { const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z; view.z = nz; view.x = sx - wx * nz; view.y = sy - wy * nz; }
// A line that was paused by a pinch, or that ran off the screen, waits here to be built or dropped.
function showPlanBar() {
  let bar = $("#planbar");
  if (!bar) { bar = el("div", "glass"); bar.id = "planbar"; $("#stage").appendChild(bar); }
  const p = ui.plan; if (!p || !p.tiles) { bar.hidden = true; return; }
  const n = p.tiles.filter(q => q.st === "ok").length;
  bar.hidden = false;
  bar.innerHTML = "<span>" + n + " tile" + (n === 1 ? "" : "s") + " · " + money(p.cost || 0) + "</span><button class='gb' data-p='no'>Cancel</button><button class='gb go' data-p='ok'>Build</button>";
  bar.onclick = ev => { const b = ev.target.closest("button"); if (!b) return; if (b.dataset.p === "ok") commitPlan(); else cancelPlan(); bar.hidden = true; };
}
function cancelPlan() { ui.plan = null; const bar = $("#planbar"); if (bar) bar.hidden = true; setTool(ui.tool); }
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
  if (tool === "dock") { const r = placeDock(t.x, t.y); if (!r.ok) return toast(r.reason, true); pushUndo({ kind: "station", id: r.station.id, tile: r.tile, cost: r.cost }); sound.play("build"); toast(r.station.name + " built."); return; }
  if (tool === "shipyard") { const r = placeShipyard(t.x, t.y); if (!r.ok) return toast(r.reason, true); sound.play("build"); toast(r.depot.name + " built."); return; }
  if (tool === "airport" || tool === "airportL") { const r = placeAirport(t.x, t.y, tool === "airportL" ? "large" : "small"); if (!r.ok) return toast(r.reason, true); sound.play("build"); toast(r.station.name + " built."); return; }
  if (tool === "oneway") { const r = cycleOneWay(t.x, t.y); if (!r.ok) return toast(r.reason, true); sound.play("click"); toast(r.oneway ? "One-way road." : "Two-way road again."); return; }
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
function vehicleWin(vh) {
  const m = modelOf(vh);
  openWin("veh" + vh.id, m.name, (body, o) => {
    const live = el("div"), ord = el("div"), acts = el("div", "row");
    body.appendChild(el("div", "spr", V.vehicleSvg(m, 46))); body.appendChild(live); body.appendChild(ord); body.appendChild(acts);
    function renderLive() {
      if (!S.vehicles.includes(vh)) return closeWin("veh" + vh.id);
      const c = vh.core, rel = Math.round(c.reliability * 100);
      const status = vehStatus(vh)[0];
      live.innerHTML = "<div class='kv'><span>Status</span><b>" + status + "</b></div><div class='kv'><span>Cargo</span><b>" + vh.loaded + " / " + m.capacity + " " + vh.cargo + "</b></div><div class='kv'><span>Age</span><b>" + (c.ageDays / 365).toFixed(1) + " of " + lifeOf(m) + " years</b></div><div class='kv'><span>Speed</span><b>" + m.speedKmh + " km/h</b></div>" +
        "<div class='kv'><span>Reliability</span><b>" + rel + "%</b></div><div class='bar'><i style='width:" + rel + "%'></i></div>" +
        "<div class='kv'><span>Profit this year</span><b class='" + (vh.profit.thisYear < 0 ? "neg" : "") + "'>" + money(vh.profit.thisYear) + "</b></div><div class='kv'><span>Profit last year</span><b>" + money(vh.profit.lastYear) + "</b></div><div class='kv'><span>Value</span><b>" + money(core.vehicleSalePrice(c, m)) + "</b></div>";
    }
    function renderOrders() { ordersEditor(vh, ord); }
    o.refresh = renderLive; renderLive(); renderOrders();
    if (vh.owner === "player") {
      const ss = btn(vh.stopped ? "Start" : "Stop", () => { toggleStopped(vh); ss.textContent = vh.stopped ? "Start" : "Stop"; toast(vh.stopped ? "Stopped." : "Started."); });
      acts.appendChild(ss);
      acts.appendChild(btn("Service", () => { const r = sendToDepot(vh, false); if (!r.ok) return toast(r.reason, true); renderOrders(); toast("Heading to " + r.depot.name + "."); }));
      acts.appendChild(btn("Stop in depot", () => { const r = sendToDepot(vh, true); if (!r.ok) return toast(r.reason, true); renderOrders(); toast("Heading to " + r.depot.name + " to stop there."); }));
      acts.appendChild(btn("Follow", () => { followVehicle(vh); }));
      acts.appendChild(btn("Clone", () => { const r = cloneVehicle(vh); if (!r.ok) return toast(r.msg, true); toast("Cloned with the same orders."); vehicleWin(r.vh); }));
      const ro = refitOptions(vh);
      if (ro.length) {
        const rf = el("div", "row"); rf.innerHTML = "<select aria-label='Refit to'>" + ro.map(o => "<option value='" + o.cargo + "'>" + (CARGO_NAME[o.cargo] || o.cargo) + "</option>").join("") + "</select>";
        rf.appendChild(btn("Refit (" + money(refitCost(vh)) + ")", () => { const r = refit(vh, rf.querySelector("select").value); if (!r.ok) return toast(r.reason, true); toast("Refitted to carry " + r.model.cargo + "."); closeWin("veh" + vh.id); vehicleWin(vh); }));
        body.appendChild(rf);
      }
      acts.appendChild(btn("Skip order", () => { OR.skipOrder(vh.orders); vh.state = "idle"; renderOrders(); }));
      acts.appendChild(btn("Sell", () => { const v = sellVehicle(vh); toast("Sold for " + money(v) + "."); closeWin("veh" + vh.id); }, "danger"));
    }
  }, { live: 1000 });
}

// ---- vehicle shop
const CARGO_NAME = { coal: "Coal", wood: "Timber", grain: "Grain", steel: "Steel", goods: "Goods", mail: "Mail", passengers: "Passengers", paper: "Paper", food: "Food", gold: "Gold", oil: "Oil", rubber: "Rubber", fruit: "Fruit", water: "Water", diamonds: "Diamonds", sugar: "Sugar", plastic: "Plastic", cola: "Cola", sweets: "Sweets", toys: "Toys", fizzy: "Fizzy drinks", batteries: "Batteries" };
// Every material on this map with the wagons that carry it, and where it comes from.
function trainCargoes(models) {
  const m = S.map, order = climateCargos().filter(c => c !== "passengers" && c !== "mail").concat(["passengers", "mail"]);
  const plural = (k, n) => { const l = mapgen.INDUSTRY_LABELS[k].toLowerCase(); return n === 1 ? l : /y$/.test(l) && !/ay$/.test(l) ? l.slice(0, -1) + "ies" : /s$/.test(l) ? l : l + "s"; };
  return order.map(c => {
    const wagons = models.filter(w => w.type === "wagon" && w.cargo === c).sort((a, b) => a.introYear - b.introYear);
    let sources = 0, where = "";
    if (c === "passengers" || c === "mail") { sources = m.towns.length; where = sources + " towns"; }
    else { const by = {}; for (const i of m.industries) if (CARGO_FROM_IND[i.kind] === c) by[i.kind] = (by[i.kind] || 0) + 1; sources = Object.values(by).reduce((a, b) => a + b, 0); where = Object.entries(by).map(([k, n]) => n + " " + plural(k, n)).join(", ") || "none on this map"; }
    return { cargo: c, wagons, sources, where };
  }).filter(f => f.wagons.length);
}
function shopWin(depot, startTab) {
  const year = S.date.year;
  let trainCargo = "", curWagon = null, depSel = depot ? depot.id : null, tab = startTab || "bus", cargoF = "all", pick = "", wagonPick = "", wagons = 5, locoPick = "";
  openWin("shop", depot ? "Buy vehicles · " + depot.name : "Buy vehicles", (body, o) => {
    function render() {
      const models = V.availableModels(year);
      const types = tab === "train" ? ["locomotive"] : tab === "air" ? ["aircraft"] : [tab];
      const cc = climateCargos();
      let inTab = models.filter(m => types.includes(m.type) && (tab === "train" || cc.includes(m.cargo)));
      const cargoes = [...new Set(inTab.map(m => m.cargo))];
      if ((tab === "truck" || tab === "ship") && cargoF !== "all") inTab = inTab.filter(m => m.cargo === cargoF);
      inTab.sort((a, b) => a.introYear - b.introYear || a.price - b.price);
      const sel = inTab.find(m => m.id === (tab === "train" ? locoPick : pick)) || inTab[0];
      let h = "<div class='tabs'>" + ["bus", "truck", "train", "ship", "air"].map(t => "<button class='" + (t === tab ? "on" : "") + "' data-a='tab' data-v='" + t + "'>" + ({ bus: "Buses", truck: "Trucks", train: "Trains", ship: "Ships", air: "Aircraft" })[t] + "</button>").join("") + "</div>";
      if ((tab === "truck" || tab === "ship") && cargoes.length > 1) h += "<div class='chips'>" + ["all", ...cargoes].map(c => "<button class='" + (c === cargoF ? "on" : "") + "' data-a='cargo' data-v='" + c + "'>" + (c === "all" ? "All cargo" : (CARGO_NAME[c] || (core.CARGO[c] || {}).label || c)) + "</button>").join("") + "</div>";
      if (tab === "train") {
        const fams = trainCargoes(models);
        if (!fams.some(f => f.cargo === trainCargo)) trainCargo = (fams.find(f => f.sources > 0) || fams[0]).cargo;
        h += "<h4>1. Material</h4><div class='mats'>" + fams.map(f => "<button class='mat" + (f.cargo === trainCargo ? " on" : "") + (f.sources ? "" : " none") + "' data-a='mat' data-v='" + f.cargo + "'><span class='ms'>" + V.vehicleSvg(f.wagons[0], 22) + "</span><b>" + (CARGO_NAME[f.cargo] || core.CARGO[f.cargo].label) + "</b><span class='dim'>" + f.where + "</span></button>").join("") + "</div>";
        const wl = fams.find(f => f.cargo === trainCargo).wagons;
        if (!wl.some(w => w.id === wagonPick)) wagonPick = wl[wl.length - 1].id;
        h += "<h4>2. Wagon</h4><div class='list short'>" + wl.map(w => "<div class='li" + (w.id === wagonPick ? " on" : "") + "' data-a='wag' data-v='" + w.id + "'><span class='ls'>" + V.vehicleSvg(w, 26) + "</span><span class='ln'>" + w.name + "</span><span>" + w.capacity + " " + V.cargoUnitLabel(w.cargo) + "</span></div>").join("") + "</div>";
        h += "<h4>3. Locomotive</h4>";
      }
      h += "<div class='list'>" + (inTab.length ? inTab.map(m => "<div class='li" + (sel && m.id === sel.id ? " on" : "") + "' data-a='pick' data-v='" + m.id + "'><span class='ls'>" + V.vehicleSvg(m, 30) + "</span><span class='ln'>" + m.name + "</span><span>" + money(vehiclePrice(m)) + "</span></div>").join("") : "<p class='dim'>Nothing available yet.</p>") + "</div>";
      if (sel) {
        let price = vehiclePrice(sel), speed = sel.speedKmh, runCost = sel.runningCostPerYear, capTxt = V.capacityText(sel), preview, warn = "";
        if (tab === "train") {
          const w = V.getModel(wagonPick);
          curWagon = w; const cs = V.consistStats(sel.id, w.id, wagons); wagons = cs.n; price = Math.round(cs.price * S.inflation); speed = cs.speedKmh; runCost = cs.runningCostPerYear; capTxt = cs.capacity + " " + V.cargoUnitLabel(w.cargo); warn = cs.warnings.join(" ");
          if (/^(Volt|Arc|Meridian|Tempest)/.test(sel.name)) warn = (warn ? warn + " " : "") + "Electric: needs electrified track (Electrify tool), including the depot.";
          h += "<div class='kv'><span>Train length</span><b>" + trainLen({ parts: { n: cs.n } }) + " tiles</b></div>";
          preview = V.trainSvg(sel.id, w.id, cs.n, 48);
          h += "<div class='prev'>" + preview + "</div><div class='dim'>" + cargoUse(w.cargo) + "</div><div class='row'>Wagons <button class='gb sm' data-a='wm'>−</button><b>" + cs.n + "</b><button class='gb sm' data-a='wp'>+</button></div>";
        } else h += "<div class='prev'>" + V.vehicleSvg(sel, 48) + "</div>";
        if (tab !== "train" && sel.cargo) h += "<div class='kv'><span>Used for</span><b style='text-align:right'>" + cargoUse(sel.cargo) + "</b></div>";
        h += "<div class='kv'><span>Cost</span><b>" + money(price) + "</b></div><div class='kv'><span>Speed</span><b>" + speed + " km/h</b></div><div class='kv'><span>Running cost</span><b>" + money(runCost) + " / year</b></div><div class='kv'><span>Capacity</span><b>" + capTxt + "</b></div><div class='kv'><span>Designed / life</span><b>" + sel.introYear + " / " + sel.maxAgeYears + " years</b></div><div class='kv'><span>Max. reliability</span><b>" + Math.round(sel.baseReliability * 100) + "%</b></div>";
        if (warn) h += "<p class='warn'>" + warn + "</p>";
        const dk = ({ train: "rail", ship: "ship", air: "air" })[tab] || "road", deps = S.depots.filter(d => (d.kind || "road") === dk && (d.owner || "player") === "player"), hasDepot = deps.length > 0;
        if (tab === "air" && isJet(sel)) h += "<p class='dim small'>Jets need a city airport at both ends.</p>";
        if (hasDepot) { if (!deps.some(d => d.id === depSel)) depSel = deps[0].id; h += "<div class='kv'><span>Build at</span>" + (deps.length > 1 ? "<select data-a='depot'>" + deps.map(d => "<option value='" + d.id + "'" + (d.id === depSel ? " selected" : "") + ">" + d.name + "</option>").join("") + "</select>" : "<b>" + deps[0].name + "</b>") + "</div>"; }
        h += "<button class='gb wide' data-a='buy'" + (!hasDepot ? " disabled" : "") + ">" + (!hasDepot ? ({ rail: "Build a train depot first", ship: "Build a shipyard first", air: "Build an airport first", road: "Build a road depot first" })[dk] : S.company.cash < price ? "Not enough money" : tab === "train" ? "Build train" : "Build vehicle") + "</button>";
      }
      body.innerHTML = h;
      const keep = body.querySelector(".list"); if (keep && o.scroll) keep.scrollTop = o.scroll;
      body.querySelector(".list") && body.querySelector(".list").addEventListener("scroll", ev => { o.scroll = ev.target.scrollTop; });
      body.onclick = ev => {
        const t = ev.target.closest("[data-a]"); if (!t) return; const a = t.dataset.a, v = t.dataset.v;
        if (a === "tab") { tab = v; cargoF = "all"; pick = ""; }
        else if (a === "cargo") cargoF = v;
        else if (a === "pick") { if (tab === "train") locoPick = v; else pick = v; }
        else if (a === "mat") { trainCargo = v; wagonPick = ""; }
        else if (a === "wag") wagonPick = v;
        else if (a === "wm") wagons = Math.max(1, wagons - 1);
        else if (a === "wp") wagons = Math.min(20, wagons + 1);
        else if (a === "buy") {
          const dk = ({ train: "rail", ship: "ship", air: "air" })[tab] || "road", dep = S.depots.find(d => d.id === depSel && (d.kind || "road") === dk) || S.depots.find(d => (d.kind || "road") === dk && (d.owner || "player") === "player");
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
      const tot = (y, inc) => CATS.reduce((a, c) => { const v = val(y, c[0]); return a + (inc ? Math.max(0, v) : Math.min(0, v)); }, 0);   // "Other" can be a reward or a cost
      const hist = S.history.slice(-24), thisYear = tot(S.date.year, true) + tot(S.date.year, false);
      let h = "<div class='cards'>" +
        card("Cash", money(S.company.cash), "", spark(hist.map(r => r.cash), "var(--accent)")) +
        card("Profit " + S.date.year, money(thisYear), "Last year " + money(tot(S.date.year - 1, true) + tot(S.date.year - 1, false)), "", thisYear < 0) +
        card("Loan", money(S.company.loan), "of " + money(S.company.maxLoan) + " at " + Math.round(S.company.interestRate * 1000) / 10 + "%", "<div class='bar'><i style='width:" + Math.round(100 * S.company.loan / Math.max(1, S.company.maxLoan)) + "%;background:var(--warnc)'></i></div>") +
        card("Company value", money(companyValue()), "", spark(hist.map(r => r.companyValue), "var(--info)")) + "</div>";
      h += S.bank !== "ok" ? "<p class='warn'>" + (S.bank === "bankrupt" ? "Your company is bankrupt." : "Warning: your company is losing money. Too many losing quarters in a row means bankruptcy.") + "</p>" : "";
      h += "<h4>Last three years</h4><div class='scroll'><table class='tb'><tr><th></th>" + ys.map(y => "<th>" + y + "</th>").join("") + "</tr>";
      for (const c of CATS.filter(c => c[2])) h += "<tr><td>" + c[1] + "</td>" + ys.map(y => "<td>" + money(val(y, c[0])) + "</td>").join("") + "</tr>";
      h += "<tr class='sum'><td>Total income</td>" + ys.map(y => "<td>" + money(tot(y, true)) + "</td>").join("") + "</tr>";
      for (const c of CATS.filter(c => !c[2])) h += "<tr><td>" + c[1] + "</td>" + ys.map(y => "<td>" + money(val(y, c[0])) + "</td>").join("") + "</tr>";
      h += "<tr class='sum'><td>Total costs</td>" + ys.map(y => "<td>" + money(tot(y, false)) + "</td>").join("") + "</tr><tr class='sum gold'><td>Profit</td>" + ys.map(y => "<td>" + money(tot(y, true) + tot(y, false)) + "</td>").join("") + "</tr></table></div>";
      h += "<div class='row'><button class='gb' data-a='b'>Borrow £10,000</button><button class='gb' data-a='r'>Repay £10,000</button></div>";
      body.innerHTML = h;
      body.onclick = e => { const a = e.target.dataset.a; if (a === "b") { if (!core.borrow(S.company)) toast("You are at your maximum loan.", true); else sound.play("cash"); } if (a === "r") { if (!core.repay(S.company)) toast("Not enough cash, or no loan to repay.", true); } o.refresh(); };
    };
    o.refresh();
  }, { live: 1500 });
}

// small summary card and sparkline used by the money, company and fleet windows
function card(label, value, sub, extra, neg) { return "<div class='card'><div class='cl'>" + label + "</div><div class='cv" + (neg ? " neg" : "") + "'>" + value + "</div>" + (sub ? "<div class='cs'>" + sub + "</div>" : "") + (extra || "") + "</div>"; }
function spark(vals, col) {
  if (!vals || vals.length < 2) return "";
  const lo = Math.min(...vals), hi = Math.max(...vals), W = 120, H = 28, sp = hi - lo || 1;
  const pts = vals.map((v, i) => (i / (vals.length - 1) * W).toFixed(1) + "," + (H - 2 - (v - lo) / sp * (H - 4)).toFixed(1));
  return "<svg class='spark' viewBox='0 0 " + W + " " + H + "' preserveAspectRatio='none'><polygon points='0," + H + " " + pts.join(" ") + " " + W + "," + H + "' fill='" + col + "' opacity='.14'/><polyline points='" + pts.join(" ") + "' fill='none' stroke='" + col + "' stroke-width='1.8' vector-effect='non-scaling-stroke' stroke-linejoin='round'/></svg>";
}

// ---- graphs
function graphsWin() {
  openWin("graphs", "Company graphs", (body, o) => {
    const SER = { income: ["Income", "#2f8f4a"], expenses: ["Expenses", "#c0392b"], cash: ["Cash", "#d8a82e"], companyValue: ["Company value", "#2e6f9e"], cargoDelivered: ["Cargo moved", "#7b3fa0"], vehicles: ["Vehicles", "#e07b00"] };
    let active = ["income", "expenses", "companyValue"], tab = "company";
    function render() {
      const d = S.history.slice(-60);
      let h = "<div class='tabs'><button data-tab='company' class='" + (tab === "company" ? "on" : "") + "'>Company</button><button data-tab='rates' class='" + (tab === "rates" ? "on" : "") + "'>Cargo payment rates</button></div>";
      if (tab === "rates") { body.innerHTML = h + cargoRatesSvg(); return; }
      if (d.length < 2) h += "<p class='dim'>Not enough data yet. Let the game run for a couple of months.</p>";
      else {
        const W = 320, Hh = 170, L = 44, Rr = 8, Tt = 8, B = 20;
        const mixed = active.some(k => ["cargoDelivered", "vehicles"].includes(k)) && active.some(k => !["cargoDelivered", "vehicles"].includes(k));
        const vals = k => d.map(r => r[k] || 0);
        const all = active.flatMap(vals); const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
        const x = i => L + i / (d.length - 1) * (W - L - Rr);
        const yf = (a, b) => v => Tt + (1 - (v - a) / (b - a)) * (Hh - Tt - B);
        let g = "";
        for (let t = 0; t <= 4; t++) { const v = lo + (hi - lo) * t / 4, yy = yf(lo, hi)(v); g += "<line x1='" + L + "' x2='" + (W - Rr) + "' y1='" + yy + "' y2='" + yy + "' stroke='currentColor' stroke-opacity='.18'/>" + (mixed ? "" : "<text x='" + (L - 4) + "' y='" + (yy + 3) + "' font-size='9' text-anchor='end' fill='currentColor'>" + (Math.abs(v) >= 1000 ? Math.round(v / 1000) + "k" : Math.round(v)) + "</text>"); }
        d.forEach((r, i) => { if (r.month === 0) g += "<text x='" + x(i) + "' y='" + (Hh - 6) + "' font-size='9' text-anchor='middle' fill='currentColor'>" + r.year + "</text>"; });
        for (const k of active) { const vs = vals(k); const a = mixed ? Math.min(0, ...vs) : lo, b = mixed ? Math.max(1, ...vs) : hi; g += "<polyline fill='none' stroke='" + SER[k][1] + "' stroke-width='2' points='" + vs.map((v, i) => x(i).toFixed(1) + "," + yf(a, b)(v).toFixed(1)).join(" ") + "'/>"; }
        h += "<svg viewBox='0 0 " + W + " " + Hh + "' class='gr'>" + g + "</svg>";
      }
      h += "<div class='chips'>" + Object.keys(SER).map(k => "<button data-k='" + k + "' class='" + (active.includes(k) ? "on" : "") + "' style='border-color:" + SER[k][1] + "'>" + SER[k][0] + "</button>").join("") + "</div>";
      body.innerHTML = h;
      body.onclick = e => { if (e.target.dataset.tab) { tab = e.target.dataset.tab; render(); return; } const k = e.target.dataset.k; if (!k) return; active = active.includes(k) ? (active.length > 1 ? active.filter(z => z !== k) : active) : [...active, k]; render(); };
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
      let h = "<div class='rate-head'><div class='ring' style='--p:" + Math.round(r.total / 10) + "'><b>" + r.total + "</b></div><div><div class='dim small'>Performance rating</div><div style='font-size:18px;font-weight:750'>" + r.title + "</div><div class='dim small'>out of 1000</div></div></div>";
      h += "<div class='cards'>" + card("Company value", money(companyValue())) + card("Vehicles", pv.length) + card("Stations", S.stations.filter(s => s.owner === "player").length) + card("Cash", money(S.company.cash), "", "", S.company.cash < 0) + "</div>";
      h += "<h4>Rating breakdown</h4><div class='scroll'><table class='tb'>" + r.parts.map(p => "<tr><td>" + p.label + "</td><td>" + p.score + " / " + p.max + "</td></tr>").join("") + "</table></div>";
      h += "<h4>Objectives</h4>" + S.objectives.map(ob => { const pr = Math.round(EV.progress(ob, m) * 100); return "<div class='obj " + ob.status + "'><div>" + ob.title + (ob.deadlineYear ? " <span class='dim'>by " + ob.deadlineYear + "</span>" : "") + (ob.status !== "active" ? " <b>(" + ob.status + ")</b>" : "") + "</div><div class='bar'><i style='width:" + pr + "%'></i></div></div>"; }).join("");
      const coCard = (col, name, sub, cash, routes) => "<div class='co-card'><i style='background:" + col + "'></i><div class='grow'><b>" + name + "</b><span>" + sub + "</span></div><div class='num'>" + money(cash) + "<div class='dim small'>" + routes + " routes</div></div></div>";
      h += "<h4>Companies</h4>" + coCard(PLAYER_COLOR, S.name, "You", S.company.cash, new Set(pv.map(v => v.orders.orders.map(o => o.stationId).join(">"))).size) + S.rivals.map(rv => coCard(rv.color, rv.ai.name, rv.ai.bankrupt ? "Bankrupt" : "Rival", rv.ai.cash, rv.ai.routes.length + (rv.rail ? rv.rail.length : 0) + (rv.sea || 0) + (rv.air || 0))).join("") + ((S.rivalQueue || []).length ? "<p class='dim small'>" + S.rivalQueue.length + " more " + (S.rivalQueue.length === 1 ? "company starts" : "companies start") + " later.</p>" : "");
      if (S.rivals.length) h += "<h4>Shares</h4>" + S.rivals.map((rv, i) => "<div class='sh'><div class='kv'><span>" + rv.ai.name + "</span><b>You own " + ((rv.shares || 0) * 25) + "% · " + money(sharePrice(rv)) + " per 25%</b></div><div class='row'><button class='gb sm' data-buy='" + i + "'" + (rv.ai.bankrupt ? " disabled" : "") + ">Buy 25%</button><button class='gb sm' data-sell='" + i + "'" + (rv.shares ? "" : " disabled") + ">Sell 25%</button></div></div>").join("") + "<p class='dim small'>Owning 100% takes the company over: its vehicles, stations and cash become yours.</p>";
      body.innerHTML = h;
    };
    body.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.buy != null) { const rv = S.rivals[+b.dataset.buy], r = buyShare(rv); toast(r.ok ? (r.takeover ? "Takeover complete." : "Bought 25% of " + rv.ai.name + " for " + money(r.cost) + ".") : r.reason, !r.ok); o.refresh(); }
      if (b.dataset.sell != null) { const rv = S.rivals[+b.dataset.sell], r = sellShare(rv); toast(r.ok ? "Sold for " + money(r.value) + "." : r.reason, !r.ok); o.refresh(); }
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
