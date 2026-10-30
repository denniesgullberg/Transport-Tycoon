// ------------------------------------------------------------------ tutorial
// Short guided steps for a first game. Each step moves on by itself once it is done.
const TUTORIAL = [
  { title: "Lay a road", text: "Pick Road and drag along the ground in a town to add a few tiles of road.", done: () => (S.stats && S.stats.roads >= 3) },
  { title: "Two bus stops", text: "Pick Bus stop and tap two road tiles at least 6 tiles apart, each near houses.", done: () => { const b = S.stations.filter(s => s.owner === "player" && s.kind === "busStop"); return b.some(a => b.some(c => Math.abs(a.x - c.x) + Math.abs(a.y - c.y) >= 6)); } },
  { title: "A depot", text: "Pick Depot and tap a road tile connected to your stops. Vehicles are built there.", done: () => S.depots.some(d => d.owner === "player" && d.kind === "road") },
  { title: "Buy a bus", text: "Tap Buy, choose a bus and tap Build vehicle.", done: () => playerVehicles().some(v => modelOf(v).type === "bus") },
  { title: "Check the orders", text: "Tap Fleet, then your bus. It needs both stops in its orders. Add them if they are missing.", done: () => playerVehicles().some(v => modelOf(v).type === "bus" && v.orders.orders.filter(o => o.kind === "stop").length >= 2) },
  { title: "First passengers", text: "Tap 2× to speed up and wait for the first delivery. Watch for the +£ above the stop.", done: () => S.metrics.passengers > 0 },
  { title: "You are up and running", text: "Next, tap an industry to see what it makes and which trucks carry it. Good luck!", done: () => false, last: true },
];
function tutorialStart() { S.tutorial = { step: 0 }; prefs.tutorialDone = false; savePrefs(); renderTutorial(); }
function tutorialStop() { if (S) S.tutorial = null; prefs.tutorialDone = true; savePrefs(); renderTutorial(); }
function tutorialTick() {
  if (!S || !S.tutorial) return;
  const st = TUTORIAL[S.tutorial.step]; if (!st) return tutorialStop();
  if (!st.last && st.done()) { S.tutorial.step++; sound.play("cash"); renderTutorial(); }
}
function renderTutorial() {
  const box = $("#tut"); if (!box) return;
  const t = S && S.tutorial, st = t && TUTORIAL[t.step];
  if (!st) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = "<div class='tut-h'><b>" + (t.step + 1) + " of " + TUTORIAL.length + ": " + st.title + "</b><button data-t='skip' aria-label='Close the tutorial'>" + (st.last ? "Done" : "Skip") + "</button></div><div>" + st.text + "</div>";
  box.onclick = e => { if (e.target.dataset.t === "skip") tutorialStop(); };
}

// ------------------------------------------------------------------ minimap
// A small overview of the whole map. Tap or drag on it to move the view there.
const MM = { canvas: null, img: null, at: 0, size: 112, show: true };
function minimapColour(x, y) {
  const m = S.map, i = y * m.w + x, k = key(x, y);
  if (R.stationAt.has(k)) { const s = R.stationAt.get(k); return s.owner === "player" ? "#1e5aa8" : s.owner === "public" ? "#777" : "#c0392b"; }
  if (R.rail.hasRoad(x, y)) return "#6b4a2b";
  if (R.roads.hasRoad(x, y)) return "#55585e";
  if (R.bld.has(k)) return "#c0392b";
  if (m.water[i]) return "#4f9fd6";
  if (m.forest[i]) return "#2f6b2f";
  const pal = palette(); return pal.top[m.height[i]] || "#78a853";
}
function renderMinimapImage() {
  const m = S.map, c = document.createElement("canvas"); c.width = m.w; c.height = m.h;
  const g = c.getContext("2d"), data = g.createImageData(m.w, m.h);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const cache = {};
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const col = minimapColour(x, y), rgb = cache[col] || (cache[col] = /^#[0-9a-f]{6}$/i.test(col) ? hex(col) : [120, 168, 83]), o = (y * m.w + x) * 4;
    data.data[o] = rgb[0]; data.data[o + 1] = rgb[1]; data.data[o + 2] = rgb[2]; data.data[o + 3] = 255;
  }
  for (const ind of m.industries) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = ind.x + dx, y = ind.y + dy; if (!inB(x, y)) continue; const o = (y * m.w + x) * 4; data.data[o] = 230; data.data[o + 1] = 170; data.data[o + 2] = 40; }
  g.putImageData(data, 0, 0); MM.img = c;
}
function drawMinimap(now) {
  const cvm = MM.canvas; if (!cvm || !S || !MM.show) return;
  MM.size = window.innerWidth >= 900 ? 150 : 112;
  if (!MM.img || now - MM.at > 2000) { renderMinimapImage(); MM.at = now; }
  const g = cvm.getContext("2d"), n = MM.size, d = Math.min(2, window.devicePixelRatio || 1);
  if (cvm.width !== n * d) { cvm.width = n * d; cvm.height = n * d; cvm.style.width = n + "px"; cvm.style.height = n + "px"; }
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, n, n);
  // draw the map turned 45 degrees so it matches the isometric view
  g.save(); g.translate(n / 2, n / 2); g.scale(1, 0.5); g.rotate(Math.PI / 4);
  const s = n / Math.SQRT2 / S.map.w * 1.0;
  g.imageSmoothingEnabled = false; g.drawImage(MM.img, -S.map.w * s / 2, -S.map.h * s / 2, S.map.w * s, S.map.h * s);
  g.restore();
  // the part of the map on screen
  const corners = [[0, 0], [cssW, 0], [cssW, cssH], [0, cssH]].map(([sx, sy]) => { const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z; return mmPoint((wx / (TW / 2) + wy / (TH / 2)) / 2, (wy / (TH / 2) - wx / (TW / 2)) / 2); });
  g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.beginPath(); corners.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke();
  for (const v of playerVehicles()) { const p = mmPoint(v.tile.x, v.tile.y); g.fillStyle = "#ffe26b"; g.fillRect(p.x - 1, p.y - 1, 2, 2); }
}
function mmPoint(tx, ty) { const n = MM.size, s = n / Math.SQRT2 / S.map.w, u = (tx - S.map.w / 2) * s, v = (ty - S.map.h / 2) * s; return { x: n / 2 + (u - v) * Math.SQRT1_2, y: n / 2 + (u + v) * Math.SQRT1_2 * 0.5 }; }
function mmToTile(px, py) { const n = MM.size, s = n / Math.SQRT2 / S.map.w, a = (px - n / 2) / Math.SQRT1_2, b = (py - n / 2) / (Math.SQRT1_2 * 0.5); return { x: (a + b) / 2 / s + S.map.w / 2, y: (b - a) / 2 / s + S.map.h / 2 }; }
function setupMinimap() {
  MM.canvas = $("#minimap"); if (!MM.canvas) return;
  let down = false;
  const go = (e) => { const r = MM.canvas.getBoundingClientRect(), t = mmToTile(e.clientX - r.left, e.clientY - r.top); ui.follow = null; centerOn(clamp(Math.round(t.x), 0, S.map.w - 1), clamp(Math.round(t.y), 0, S.map.h - 1)); };
  MM.canvas.addEventListener("pointerdown", e => { down = true; MM.canvas.setPointerCapture(e.pointerId); go(e); e.stopPropagation(); });
  MM.canvas.addEventListener("pointermove", e => { if (down) go(e); });
  MM.canvas.addEventListener("pointerup", () => { down = false; });
  const set = (on) => { MM.show = on; MM.canvas.hidden = !on; document.body.classList.toggle("mm-on", on); };
  set(window.innerWidth >= 600);   // phones start with the minimap folded away
  $("#bmm").onclick = () => set(!MM.show);
}

// --------------------------------------------------------------- follow vehicle
function followVehicle(vh) { ui.follow = vh ? vh.id : null; if (vh) toast("Following #" + vh.id.slice(1) + ". Drag the map to stop."); }
function followTick() {
  if (!ui.follow || !S) return;
  const v = S.vehicles.find(x => x.id === ui.follow); if (!v) { ui.follow = null; return; }
  const u = isTrain(v) ? trainUnits(v)[0] : vehiclePos(v); if (!u) return;
  const tx = cssW / 2 - u.x * view.z, ty = cssH / 2 - u.y * view.z;
  view.x += (tx - view.x) * 0.2; view.y += (ty - view.y) * 0.2;
}

// ------------------------------------------------------------ keyboard and help
const KEYS = [
  ["Space", "Pause or play"], ["1 2 3", "Speed 1×, 2×, 4×"], ["Esc", "Close the top window, or back to Inspect"], ["+ −", "Zoom"], ["Arrows", "Move the map"],
  ["I", "Inspect"], ["R", "Road"], ["T", "Track"], ["S", "Signal"], ["B", "Bus stop"], ["K", "Truck stop"], ["N", "Train station"], ["D", "Depot"], ["P", "Train depot"],
  ["L", "Raise land"], ["O", "Lower land"], ["X", "Bulldoze"], ["Ctrl+Z", "Undo"], ["V", "Buy vehicles"], ["F", "Fleet"], ["M", "Money"], ["G", "Graphs"], ["C", "Company"], ["?", "This list"],
];
const KEY_TOOLS = { i: "inspect", r: "road", t: "track", s: "signal", b: "busStop", k: "truckStop", n: "trainStation", d: "depot", p: "railDepot", l: "raise", o: "lower", x: "bulldoze" };
function helpWin() {
  openWin("help", "Keys and help", body => {
    body.innerHTML = "<p class='dim'>On a phone: drag to move the map, pinch with two fingers to zoom, tap to use the tool. While drawing a road or track you can pinch or move to the edge of the screen; the line waits with Build and Cancel. Right-click on a computer goes back to Inspect.</p><table class='tb'>" + KEYS.map(([k, d]) => "<tr><td><b>" + k + "</b></td><td>" + d + "</td></tr>").join("") + "</table>";
    body.appendChild(btn("Start the tutorial", () => { closeWin("help"); tutorialStart(); }));
  });
}
function onKey(e) {
  if (!S || ui.menuOpen || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key;
  if (k === "Escape") { const ids = Object.keys(openWins); if (ids.length) { let top = ids[0]; for (const id of ids) if (+openWins[id].w.style.zIndex > +openWins[top].w.style.zIndex) top = id; closeWin(top); } else setTool("inspect"); return; }
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") { e.preventDefault(); const r = undoLast(); toast(r.ok ? "Undone. Refunded " + money(r.cost) + "." : r.reason, !r.ok); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === "1" || k === "2" || k === "3") { ui.speed = ({ 1: 1, 2: 2, 3: 4 })[k]; ui.paused = false; return; }
  if (k === "+" || k === "=") return zoomAt(cssW / 2, cssH / 2, clamp(view.z * 1.25, 0.45, 3));
  if (k === "-") return zoomAt(cssW / 2, cssH / 2, clamp(view.z / 1.25, 0.45, 3));
  if (k === "?") return helpWin();
  const low = k.toLowerCase();
  if (KEY_TOOLS[low]) return setTool(KEY_TOOLS[low]);
  const w = { v: openShop, f: fleetWin, m: financeWin, g: graphsWin, c: companyWin }[low]; if (w) w();
}
function setupDesktop() {
  window.addEventListener("keydown", onKey);
  cv.addEventListener("contextmenu", e => { e.preventDefault(); setTool("inspect"); });
}
