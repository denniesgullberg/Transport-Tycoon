// ------------------------------------------------------------------- rendering
const cv = $("#map"), ctx = cv.getContext("2d");
const view = { x: 0, y: 0, z: 1.4 };
let dpr = 1, cssW = 300, cssH = 300;

function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = Math.max(100, r.width); cssH = Math.max(100, r.height);
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
}
function iso(x, y, h) { return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 - (h || 0) * HS }; }
function tileH(x, y) {
  const i = y * S.map.w + x;
  const sp = S.spans[i]; if (sp) return sp.h;
  return S.map.height[i];
}
function screenToTile(sx, sy) {
  const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
  let best = null;
  const u = wx / (TW / 2);
  for (let pass = 0; pass < 2; pass++) {
    // try with heights 0..12, pick the tile whose own height matches
    for (let h = 12; h >= 0; h--) {
      const v = (wy + h * HS) / (TH / 2);
      const x = Math.round((u + v) / 2), y = Math.round((v - u) / 2);
      if (!inB(x, y)) continue;
      if (S.map.height[key(x, y)] === h || (S.map.water[key(x, y)] && h === 0)) { best = { x, y }; return best; }
    }
  }
  const v = wy / (TH / 2);
  const x = Math.round((u + v) / 2), y = Math.round((v - u) / 2);
  return inB(x, y) ? { x, y } : null;
}
function centerOn(x, y) {
  const p = iso(x, y, tileH(x, y));
  view.x = cssW / 2 - p.x * view.z; view.y = cssH / 2 - p.y * view.z;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r * f), 0, 255); g = clamp(Math.round(g * f), 0, 255); b = clamp(Math.round(b * f), 0, 255);
  return "rgb(" + r + "," + g + "," + b + ")";
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "rgb(" + c(16) + "," + c(8) + "," + c(0) + ")";
}
let palCache = null, palKey = "";
function palette() {
  const k = S.cfg.climate;
  if (palKey === k && palCache) return palCache;
  const c = CLIM[k], out = { top: [], top2: [], water: c.water, wall: [], tree: c.tree };
  for (let h = 0; h <= 12; h++) {
    let base = h >= 5 ? mix(c.grass, c.hill, Math.min(1, (h - 4) / 4)) : shade(c.grass, 1 + h * 0.03);
    let base2 = h >= 5 ? mix(c.grass2, c.hill, Math.min(1, (h - 4) / 4)) : shade(c.grass2, 1 + h * 0.03);
    if (c.snow && h >= 5) { base = c.snow; base2 = shade(c.snow, 0.97); }
    out.top.push(base); out.top2.push(base2);
    out.wall.push([shade(c.grass, 0.55 + (h > 4 ? 0.1 : 0)), shade(c.grass, 0.42)]);
  }
  palCache = out; palKey = k; return out;
}
function poly(pts, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.stroke(); }
}
function diamond(px, py, fill, w) {
  const a = (w || 1) * TW / 2, b = (w || 1) * TH / 2;
  poly([px, py - b, px + a, py, px, py + b, px - a, py], fill);
}
function box(px, py, wt, hPx, top, left, right) {
  // box centred on tile centre (px,py), footprint wt tiles wide, hPx tall
  const a = wt * TW / 2, b = wt * TH / 2, ty = py - hPx;
  poly([px - a, py, px, py + b, px, ty + b, px - a, ty], left);
  poly([px + a, py, px, py + b, px, ty + b, px + a, ty], right);
  poly([px, ty - b, px + a, ty, px, ty + b, px - a, ty], top);
}
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }

function drawTree(px, py, c, big) {
  const s = big ? 1 : 0.8;
  ctx.fillStyle = "#5a3d1a"; ctx.fillRect(px - 1, py - 4 * s, 2, 4 * s);
  poly([px - 5 * s, py - 3 * s, px + 5 * s, py - 3 * s, px, py - 14 * s], c);
  poly([px - 4 * s, py - 8 * s, px + 4 * s, py - 8 * s, px, py - 17 * s], shade(c, 1.15));
}
const BCOL = {
  house: [["#f2e2c4", "#d9c39a", "#c0392b"], ["#e9d5b0", "#cfb88c", "#a93226"], ["#f5f0e0", "#dcd2b8", "#7b4a2a"]],
  shop: [["#cfe0f0", "#a9c3da", "#2e6f9e"]], apartments: [["#d8d4cc", "#b4afa5", "#8a8680"]], tower: [["#b9d6ea", "#8fb4cf", "#2c4f6b"]], church: [["#f4f1e8", "#d8d3c4", "#6b6b72"]],
};
function drawBuilding(px, py, b, x, y) {
  const set = BCOL[b.kind] || BCOL.house, c = set[Math.floor(hash(x, y) * set.length) % set.length];
  const hh = b.kind === "tower" ? 12 + b.floors * 6 : b.kind === "apartments" ? 6 + b.floors * 5 : b.kind === "church" ? 11 : 5 + b.floors * 4.5;
  box(px, py, 0.72, hh, c[2], c[0], c[1]);
  if (b.kind === "house") { poly([px - 0.72 * TW / 2, py - hh, px, py - hh - 7, px + 0.72 * TW / 2, py - hh, px, py - hh + 0.72 * TH / 2], c[2]); }
  if (b.kind === "church") { box(px, py - hh, 0.26, 10, "#8a8a92", "#e8e2d2", "#cfc8b6"); }
  if (b.kind === "tower" || b.kind === "apartments") { ctx.fillStyle = "rgba(255,255,255,.35)"; for (let k = 1; k < b.floors + (b.kind === "tower" ? 2 : 0); k++) ctx.fillRect(px - 8, py - k * 6 - 1, 3, 2); }
}
function chimneys(px, top, n) {
  for (let k = 0; k < n; k++) { const dx = -12 + k * 12; ctx.fillStyle = "#555"; ctx.fillRect(px + dx - 3, top - 22, 6, 22); ctx.fillStyle = "rgba(235,235,235,.7)"; ctx.beginPath(); ctx.arc(px + dx + 2, top - 28 - ((S.totalDays + k * 7) % 20) * 0.3, 5, 0, 7); ctx.fill(); }
}
function drawIndustry(px, py, ind) {
  const [tpl, c] = IND_LOOK[ind.kind] || ["works", "#888"];
  let top = py - TH * 0.5 - 8, tall = false;
  if (tpl === "rig") {
    ctx.fillStyle = "#4a4f57"; for (const [dx, dy] of [[-12, 0], [12, 0], [0, -6], [0, 6]]) ctx.fillRect(px + dx - 1, py + dy - 6, 2, 12);
    box(px, py - 8, 1.6, 4, "#9aa0a8", "#7a8088", "#5a6068");
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 4, py - 14); ctx.lineTo(px + 8, py - 40); ctx.lineTo(px + 12, py - 14); ctx.moveTo(px + 5, py - 22); ctx.lineTo(px + 11, py - 22); ctx.moveTo(px + 6, py - 30); ctx.lineTo(px + 10, py - 30); ctx.stroke();
    ctx.fillStyle = "#e8e8e8"; ctx.beginPath(); ctx.ellipse(px - 8, py - 16, 6, 3, 0, 0, 7); ctx.fill();
    top = py - 24; tall = true;
  } else {
    box(px, py - TH * 0.5, 2.5, 8, shade(c, 1.2), shade(c, 0.85), shade(c, 0.65));
    if (tpl === "works") { chimneys(px, top, 2); box(px + 14, top + 6, 0.9, 12, shade(c, 1.35), shade(c, 1.1), shade(c, 0.9)); tall = true; }
    else if (tpl === "tanks") {
      for (const [dx, dy] of [[-12, 4], [0, 8], [12, 4]]) { ctx.fillStyle = "#d8dce0"; ctx.beginPath(); ctx.ellipse(px + dx, top + dy - 6, 7, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#b8bcc2"; ctx.fillRect(px + dx - 7, top + dy - 6, 14, 8); ctx.fillStyle = "#e8ecf0"; ctx.beginPath(); ctx.ellipse(px + dx, top + dy - 6, 7, 3, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#555"; ctx.fillRect(px + 18, top - 26, 3, 26); ctx.fillStyle = "#ff9a2a"; ctx.beginPath(); ctx.arc(px + 19.5, top - 29, 3 + (S.totalDays % 3), 0, 7); ctx.fill(); tall = true;
    } else if (tpl === "mine") {
      poly([px - 18, top + 4, px - 4, top - 12, px + 10, top + 4], shade(c, 0.6));
      ctx.strokeStyle = "#666"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 10, top + 2); ctx.lineTo(px + 24, top - 10); ctx.stroke();
      ctx.fillStyle = "#444"; ctx.fillRect(px + 14, top - 18, 3, 20);
    } else if (tpl === "farm") { box(px - 8, top + 4, 1, 12, "#d8cdb8", c, shade(c, 0.75)); box(px + 16, top + 6, 0.5, 20, "#c8c8cc", "#a9a9b0", "#8a8a92"); }
    else if (tpl === "orchard") { for (let k = 0; k < 6; k++) { const ox = -18 + (k % 3) * 14, oy = top + 2 + Math.floor(k / 3) * 8; ctx.fillStyle = "#2f6b2f"; ctx.beginPath(); ctx.arc(px + ox, oy, 5, 0, 7); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px + ox + 1, oy - 1, 1.6, 0, 7); ctx.fill(); } }
    else if (tpl === "forest") { for (let k = 0; k < 4; k++) drawTree(px - 18 + k * 12, top + 8 + (k % 2) * 4, "#2f6b2f", true); }
    else if (tpl === "sawmill") { for (let k = 0; k < 3; k++) { ctx.fillStyle = "#8a5a2b"; ctx.fillRect(px - 16 + k * 11, top + 2, 9, 5); } }
    else if (tpl === "wells") {
      for (const dx of [-12, 8]) { const bob = Math.sin((S.totalDays + dx) * 0.9) * 3; ctx.strokeStyle = shade(c, 1.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + dx - 6, top + 6); ctx.lineTo(px + dx, top - 8); ctx.lineTo(px + dx + 6, top + 6); ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px + dx - 9, top - 8 + bob); ctx.lineTo(px + dx + 9, top - 8 - bob); ctx.stroke(); }
    } else if (tpl === "fountain") {
      for (const dx of [-10, 10]) { ctx.fillStyle = shade(c, 0.8); ctx.beginPath(); ctx.ellipse(px + dx, top + 6, 7, 3, 0, 0, 7); ctx.fill(); ctx.strokeStyle = shade(c, 1.4); ctx.lineWidth = 1.5; ctx.beginPath(); for (const a of [-0.5, 0, 0.5]) { ctx.moveTo(px + dx, top + 5); ctx.quadraticCurveTo(px + dx + a * 10, top - 16, px + dx + a * 16, top + 4); } ctx.stroke(); }
    }
  }
  if (prefs.labels && view.z >= 1.1) label(px, top - (tall ? 40 : 22), ind.name, 9);
}
function label(px, py, text, size, col) {
  ctx.font = "bold " + size + "px Verdana, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(20,30,10,.8)";
  ctx.strokeText(text, px, py); ctx.fillStyle = col || "#fff"; ctx.fillText(text, px, py);
}
function drawRoad(px, py, x, y) {
  const m = S.map, i = y * m.w + x;
  const sp = S.spans[i];
  if (sp && sp.kind === "tunnel") { diamond(px, py, "rgba(0,0,0,.25)", 0.5); return; }
  const dirs = [[1, 0, TW / 4, TH / 4], [-1, 0, -TW / 4, -TH / 4], [0, 1, -TW / 4, TH / 4], [0, -1, TW / 4, -TH / 4]];
  const conn = dirs.filter(d => inB(x + d[0], y + d[1]) && R.roads.hasRoad(x + d[0], y + d[1]));
  if (sp && sp.kind === "bridge") {
    ctx.strokeStyle = "#c9a15a"; ctx.lineWidth = 12; ctx.lineCap = "butt";
    ctx.beginPath(); for (const d of (conn.length ? conn : dirs.slice(0, 2))) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(px - 2, py + 5, 4, 8);
  }
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#4a4d52"; ctx.lineWidth = TH * 0.62;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke(); ctx.setLineDash([]);
  ctx.lineCap = "butt";
}
function drawTrack(px, py, x, y, crossing) {
  const m = S.map, i = y * m.w + x, sp = S.spans[i];
  if (sp && sp.kind === "tunnel") { diamond(px, py, "rgba(0,0,0,.25)", 0.5); return; }
  const dirs = [[1, 0, TW / 4, TH / 4], [-1, 0, -TW / 4, -TH / 4], [0, 1, -TW / 4, TH / 4], [0, -1, TW / 4, -TH / 4]];
  let conn = dirs.filter(d => inB(x + d[0], y + d[1]) && R.rail.hasRoad(x + d[0], y + d[1]));
  if (!conn.length) conn = dirs.slice(0, 2);
  if (sp && sp.kind === "bridge") {
    ctx.strokeStyle = "#8d8d95"; ctx.lineWidth = 11; ctx.lineCap = "butt";
    ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(px - 2, py + 5, 4, 8);
  }
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (!crossing) {
  ctx.strokeStyle = "#86775f"; ctx.lineWidth = TH * 0.52;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke();
  ctx.lineCap = "butt"; ctx.strokeStyle = "#4b3a26"; ctx.lineWidth = TH * 0.4; ctx.setLineDash([1.5, 3]);
  ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = "#cfd2d6"; ctx.lineWidth = 1;
  for (const off of [-2.2, 2.2]) { ctx.beginPath(); for (const d of conn) { const len = Math.hypot(d[2], d[3]), nx = -d[3] / len * off, ny = d[2] / len * off; ctx.moveTo(px + nx, py + ny); ctx.lineTo(px + d[2] + nx, py + d[3] + ny); } ctx.stroke(); }
  const res = R.res && R.res.get(i);
  if (crossing) {   // barriers: striped poles, lowered when a train has the crossing
    ctx.lineWidth = 2; ctx.setLineDash([2, 2]); ctx.strokeStyle = res ? "#d22" : "#eee";
    ctx.beginPath(); ctx.moveTo(px - 12, py - 2); ctx.lineTo(px - 12 + (res ? 10 : 2), py - 2 - (res ? 0 : 10)); ctx.moveTo(px + 12, py + 2); ctx.lineTo(px + 12 - (res ? 10 : 2), py + 2 - (res ? 0 : 10)); ctx.stroke(); ctx.setLineDash([]);
  }
  if (S.elec && S.elec[i]) {   // catenary: a mast and the wire over each connection
    ctx.strokeStyle = "#5b5f66"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px + 9, py - 2); ctx.lineTo(px + 9, py - 15); ctx.stroke();
    ctx.strokeStyle = "rgba(40,40,40,.75)"; ctx.lineWidth = 0.7; ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py - 13); ctx.lineTo(px + d[2], py + d[3] - 13); } ctx.stroke();
  }
  const sg = S.signals && S.signals[i];
  if (sg) {
    const nx = x + sg.dx, ny = y + sg.dy, free = !(R.res && R.res.get(ny * m.w + nx)) || (R.res.get(ny * m.w + nx) === res && res && false);
    const off = iso(sg.dy, -sg.dx, 0), ox = off.x * 0.35, oy = off.y * 0.35;   // to the right of the direction of travel
    ctx.fillStyle = "#333"; ctx.fillRect(px + ox - 1, py + oy - 13, 2, 13);
    ctx.fillStyle = "#222"; ctx.fillRect(px + ox - 3, py + oy - 19, 6, 7);
    ctx.fillStyle = free ? "#3ddc5a" : "#ff3b30"; ctx.beginPath(); ctx.arc(px + ox, py + oy - 15.5, 2, 0, 7); ctx.fill();
    if (sg.two) { ctx.fillStyle = "#fff"; ctx.fillRect(px + ox - 3, py + oy - 21, 6, 2); }
    if (sg.path) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(px + ox - 3, py + oy - 19); ctx.lineTo(px + ox + 3, py + oy - 19); ctx.lineTo(px + ox, py + oy - 23); ctx.fill(); }
  }
}
function drawPier(px, py, s) {
  const w = s.water, d = iso(w.x - s.x, w.y - s.y, 0), bx = px + d.x * 0.85, by = py + d.y * 0.85;
  poly([px + d.x * 0.3 - 5, py + d.y * 0.3, px + d.x * 0.3 + 5, py + d.y * 0.3, bx + 5, by, bx - 5, by], "#8a6a3e");
  ctx.fillStyle = "#5a4326"; for (const [ox, oy] of [[-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]]) ctx.fillRect(bx + ox * TW - 1.5, by + oy * TH, 3, 7);
  diamond(bx, by, "#9a7646", 0.55);
  ctx.strokeStyle = "rgba(60,40,20,.4)"; ctx.lineWidth = 1;
  for (const f of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(bx - TW * 0.275 * (1 - Math.abs(f)), by + f * TH * 0.55); ctx.lineTo(bx + TW * 0.275 * (1 - Math.abs(f)), by + f * TH * 0.55); ctx.stroke(); }
  const cx = px + d.x * 0.42, cy = py + d.y * 0.42;
  ctx.strokeStyle = "#d6a82e"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 28); ctx.lineTo(bx, by - 30); ctx.stroke();
  ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by - 30); ctx.lineTo(bx, by - 16); ctx.stroke();
  ctx.fillStyle = "#333"; ctx.fillRect(bx - 2, by - 16, 4, 3);
}
function drawStation(px, py, s, x, y) {
  const col = s.owner === "player" ? PLAYER_COLOR : s.owner === "public" ? "#777" : ((S.rivals.find(r => r.ai.id === s.owner) || {}).color || "#888");
  if (s.kind === "dock") {
    if (s.rigId) return;
    // the shed on the shore; the pier and crane are drawn after the land so the shore does not hide them
    const w = s.water, d = iso(w.x - s.x, w.y - s.y, 0);
    box(px - d.x * 0.12, py - d.y * 0.12, 0.6, 12, "#c9b48a", "#a8916a", "#8a7552");
    diamond(px - d.x * 0.12, py - d.y * 0.12 - 12, col, 0.3);
    (R.docksLate || (R.docksLate = [])).push([px, py, s]);
    return;
  }
  if (s.kind === "airport") {
    diamond(px, py, "#8d9096", 0.98);
    const big = s.size === "large", n = big ? 3 : 2, cx = x - s.x, cy = y - s.y;
    if (cy === n - 1) { ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px - TW / 4, py - TH / 4); ctx.lineTo(px + TW / 4, py + TH / 4); ctx.stroke(); ctx.setLineDash([]); }
    if (cx === 0 && cy === 0) { box(px, py, 0.7, 10, "#e6e2d6", "#c9c3ae", "#aaa38c"); ctx.fillStyle = "#3a6fa8"; ctx.fillRect(px - 8, py - 13, 16, 3); }
    if (cx === n - 1 && cy === 0) { ctx.fillStyle = "#666"; ctx.fillRect(px - 1.5, py - 26, 3, 24); ctx.fillStyle = "#bfe3ff"; ctx.fillRect(px - 5, py - 31, 10, 6); ctx.fillStyle = col; ctx.fillRect(px - 5, py - 33, 10, 2); }
    if (cx === 0 && cy === n - 1) box(px, py, 0.8, 9, "#b8bcc2", "#9aa0a8", "#7a8088");
    return;
  }
  if (s.kind === "trainStation") {
    box(px, py, 0.85, 3, "#c9c3ae", "#aaa38c", "#8f8873");
    ctx.fillStyle = "#333"; ctx.fillRect(px - 10, py - 15, 2, 13); ctx.fillRect(px + 8, py - 15, 2, 13);
    ctx.fillStyle = col; ctx.fillRect(px - 13, py - 19, 26, 5);
    ctx.fillStyle = "#fff"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText("STN", px, py - 21);
    return;
  }
  box(px, py, 0.55, 3, "#d8d2c0", "#b4ae9c", "#99937f");
  ctx.fillStyle = "#333"; ctx.fillRect(px - 1, py - 24, 2, 21);
  ctx.fillStyle = col; ctx.fillRect(px - 8, py - 26, 16, 8);
  ctx.fillStyle = "#fff"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.kind === "busStop" ? "BUS" : "GDS", px, py - 20);
}
function drawDepot(px, py, d) {
  if (d && d.kind === "ship") { box(px, py + 2, 0.8, 9, "#7a5a33", "#8a6a43", "#5a4223"); ctx.fillStyle = "#1c2a3a"; ctx.fillRect(px - 5, py - 4, 10, 6); return; }
  if (d && d.kind === "rail") {
    box(px, py, 0.85, 12, "#4f5d73", "#6b7b94", "#3f4b5d");
    ctx.fillStyle = "#15181f"; ctx.beginPath(); ctx.moveTo(px - 5, py - 1); ctx.lineTo(px - 5, py - 6); ctx.quadraticCurveTo(px, py - 12, px + 5, py - 6); ctx.lineTo(px + 5, py - 1); ctx.fill();
    return;
  }
  box(px, py, 0.8, 11, "#a14a36", "#c0644a", "#8f3f2e");
  ctx.fillStyle = "#2a2018"; ctx.fillRect(px - 4, py - 7, 8, 7);
}

const dirTiles = {};
function draw() {
  if (!S) return;
  const m = S.map, pal = palette(), W = cssW, H = cssH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#16210f"; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
  // visible tile range
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z, u = wx / (TW / 2), v = wy / (TH / 2);
    const x = (u + v) / 2, y = (v - u) / 2; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const x0 = clamp(Math.floor(minX) - 3, 0, m.w - 1), x1 = clamp(Math.ceil(maxX) + 3, 0, m.w - 1), y0 = clamp(Math.floor(minY) - 3, 0, m.h - 1), y1 = clamp(Math.ceil(maxY) + 8, 0, m.h - 1);
  const ov = ui.overlay;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * m.w + x, h = m.height[i], water = m.water[i];
      const p = iso(x, y, water ? 0 : h);
      if (water) {
        diamond(p.x, p.y, ((x + y) & 1) ? pal.water : shade(pal.water, 1.05));
      } else {
        diamond(p.x, p.y, ((x + y) & 1) ? pal.top[h] : pal.top2[h]);
        if (x + 1 < m.w) { const d = h - m.height[i + 1]; if (d > 0) poly([p.x + TW / 2, p.y, p.x, p.y + TH / 2, p.x, p.y + TH / 2 + d * HS, p.x + TW / 2, p.y + d * HS], pal.wall[h][0]); }
        if (y + 1 < m.h) { const d = h - m.height[i + m.w]; if (d > 0) poly([p.x - TW / 2, p.y, p.x, p.y + TH / 2, p.x, p.y + TH / 2 + d * HS, p.x - TW / 2, p.y + d * HS], pal.wall[h][1]); }
      }
      if (prefs.grid) { ctx.strokeStyle = "rgba(0,0,0,.13)"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath(); ctx.stroke(); }
      if (ov && ov.has(i)) diamond(p.x, p.y, "rgba(255,230,80,.28)", 0.98);
      const rd = R.roads.hasRoad(x, y), rl = !rd && R.rail.hasRoad(x, y);
      const ph = (rd || rl) && S.spans[i] ? iso(x, y, S.spans[i].h) : p;
      const rl2 = R.rail.hasRoad(x, y);
      if (rd) { drawRoad(ph.x, ph.y, x, y); const ow = S.oneway && S.oneway[i]; if (ow) { const d = iso(ow.dx, ow.dy, 0), L = Math.hypot(d.x, d.y), ux = d.x / L, uy = d.y / L; ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.moveTo(ph.x + ux * 7, ph.y + uy * 7); ctx.lineTo(ph.x - ux * 3 - uy * 4, ph.y - uy * 3 + ux * 4); ctx.lineTo(ph.x - ux * 3 + uy * 4, ph.y - uy * 3 - ux * 4); ctx.fill(); } }
      if (rl2) drawTrack(ph.x, ph.y, x, y, rd);
      if (!rd && !rl2 && m.forest[i] && !water) { const a = hash(x, y), b = hash(y, x); drawTree(p.x - 8 + a * 6, p.y + 1, pal.tree, a > 0.5); drawTree(p.x + 7 - b * 5, p.y + 3, shade(pal.tree, 0.9), b > 0.4); if (a > 0.3) drawTree(p.x, p.y - 3 + b * 2, shade(pal.tree, 1.05), true); }
      const sIdx = R.stationAt.get(i); if (sIdx) { drawStation(ph.x, ph.y, sIdx, x, y); if (sIdx.x === x && sIdx.y === y && sIdx.kind !== "airport") drawCargoPiles(ph.x, ph.y, sIdx); }
      const dIdx = R.depotAt.get(i); if (dIdx) drawDepot(ph.x, ph.y, dIdx);
      const b = R.bld.get(i); if (b) drawBuilding(p.x, p.y, b, x, y);
      const ind = R.indAt.get(i); if (ind) drawIndustry(p.x, p.y, ind);
    }
  }
  if (R.docksLate) { for (const [px, py, s] of R.docksLate) drawPier(px, py, s); R.docksLate = null; }
  // planned road or track while dragging
  if (ui.plan && ui.plan.tiles) for (const q of ui.plan.tiles) { if (!inB(q.x, q.y)) continue; const p = iso(q.x, q.y, tileH(q.x, q.y)); diamond(p.x, p.y, q.st === "bad" ? "rgba(220,60,40,.5)" : q.st === "have" ? "rgba(255,255,255,.22)" : "rgba(120,230,90,.5)", 0.9); }
  // hover / selected tile
  if (ui.hover && inB(ui.hover.x, ui.hover.y)) {
    const t = ui.hover, p = iso(t.x, t.y, tileH(t.x, t.y));
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath(); ctx.stroke();
  }
  // vehicles
  const inTunnel = (x, y) => (S.spans[key(Math.round(x), Math.round(y))] || {}).kind === "tunnel";
  const vs = [];
  for (const v of S.vehicles) {
    if (isTrain(v)) { for (const u of trainUnits(v)) if (!inTunnel(u.gx, u.gy)) vs.push({ v, pos: u, unit: u }); }
    else if (!inTunnel(v.tile.x, v.tile.y)) vs.push({ v, pos: vehiclePos(v) });
  }
  vs.sort((a, b) => (a.pos.gx + a.pos.gy) - (b.pos.gx + b.pos.gy));
  for (const it of vs) it.unit ? drawUnit(it.v, it.unit) : drawVehicle(it.v, it.pos);
  // labels
  if (prefs.labels && view.z >= 0.7) for (const t of m.towns) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    const p = iso(t.x, t.y, tileH(t.x, t.y));
    label(p.x, p.y - 24 - (t.size === "city" ? 20 : 0), t.name, t.size === "city" ? 13 : 11);
  }
  // income pop-ups rise and fade over 1.6 s
  const now = performance.now();
  R.floats = R.floats.filter(f => now - f.t < 1600);
  for (const f of R.floats) { const a = (now - f.t) / 1600, p = iso(f.x, f.y, tileH(f.x, f.y)); ctx.globalAlpha = 1 - a * a; label(p.x, p.y - 30 - a * 26, f.text, 11, f.color); ctx.globalAlpha = 1; }
}
function vehiclePos(v) {
  let gx = v.tile.x, gy = v.tile.y;
  if (v.state === "moving") { gx = v.from.x + (v.to.x - v.from.x) * v.p; gy = v.from.y + (v.to.y - v.from.y) * v.p; }
  const h0 = tileH(Math.round(v.from.x), Math.round(v.from.y)), h1 = tileH(Math.round(v.to.x), Math.round(v.to.y));
  const h = v.state === "moving" ? h0 + (h1 - h0) * v.p : tileH(v.tile.x, v.tile.y);
  if (isAir(v) && v.state !== "moving" && v.pos) { const p = iso(v.pos.x, v.pos.y, tileH(v.tile.x, v.tile.y)); return { gx: v.pos.x, gy: v.pos.y, x: p.x, y: p.y }; }
  const p = iso(gx, gy, h);
  return { gx, gy, x: p.x, y: p.y };
}
function spriteFor(modelId) {
  let s = R.sprites[modelId];
  if (!s) {
    const m = V.getModel(modelId); if (!m) return null;
    const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(V.vehicleSvg(m, 40));
    s = R.sprites[modelId] = img;
  }
  return s.complete && s.naturalWidth ? s : null;
}
function drawVehicle(v, pos) {
  const img = spriteFor(v.modelId); if (!img) return;
  if (isAir(v)) {
    const alt = v.state === "moving" ? 34 * Math.min(1, Math.sin(Math.PI * v.p) * 2.2) : 0;
    if (alt > 2) { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 2, 9, 3, 0, 0, 7); ctx.fill(); }
    const k = 0.24, w = img.naturalWidth * k, h = img.naturalHeight * k;
    isoSprite(img, pos.x, pos.y + 2 - alt, w, h, v.dir.dx || v.dir.dy ? v.dir.dx : 1, v.dir.dy);
    return;
  }
  const k = isTrain(v) ? Math.min(0.3, 66 / img.naturalWidth) : 0.3, w = img.naturalWidth * k, h = img.naturalHeight * k;
  const lk = isShip(v) ? null : (modelOf(v) || {}).look;
  isoSprite(img, pos.x, pos.y + 2, w, h, v.dir.dx || v.dir.dy ? v.dir.dx : 1, v.dir.dy, lk);
  if (v.broken) { ctx.fillStyle = "rgba(220,60,40,.9)"; ctx.beginPath(); ctx.arc(pos.x, pos.y - 20, 4, 0, 7); ctx.fill(); }
  else if (v.loaded > 0 && view.z > 1.2) { ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(pos.x - 3, pos.y - 20, 6, 3); }
}

// A train is drawn as its locomotive and wagons, each half a tile apart along the track it covers.
function trainUnits(v) {
  const m = modelOf(v); if (!m || !m.parts) return [];
  const pts = [];
  const head = v.state === "moving" ? { x: v.tile.x + (v.to.x - v.tile.x) * v.p, y: v.tile.y + (v.to.y - v.tile.y) * v.p } : { x: v.tile.x, y: v.tile.y };
  pts.push(head);
  for (const t of (v.trail || [v.tile])) if (!(pts.length === 1 && v.state !== "moving" && t.x === head.x && t.y === head.y)) pts.push(t);
  const n = Math.min(m.parts.n, 12) + 1, out = [];
  let seg = 0, along = 0;   // walk back along the polyline
  for (let u = 0; u < n; u++) {
    const want = 0.15 + u * 0.5;
    while (seg < pts.length - 1) {
      const a = pts[seg], b = pts[seg + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 0;
      if (along + len >= want) {
        const f = len ? (want - along) / len : 0, gx = a.x + (b.x - a.x) * f, gy = a.y + (b.y - a.y) * f;
        const h0 = tileH(Math.round(a.x), Math.round(a.y)), h1 = tileH(Math.round(b.x), Math.round(b.y));
        const p = iso(gx, gy, h0 + (h1 - h0) * f);
        out.push({ gx, gy, x: p.x, y: p.y, dx: a.x - b.x, dy: a.y - b.y, id: u === 0 ? m.parts.locoId : m.parts.wagonId, loco: u === 0 });
        break;
      }
      along += len; seg++;
    }
    if (seg >= pts.length - 1) break;   // the rest of the train is still inside the depot
  }
  if (!out.length) { const p = iso(head.x, head.y, tileH(v.tile.x, v.tile.y)); out.push({ gx: head.x, gy: head.y, x: p.x, y: p.y, dx: v.dir ? v.dir.dx : 1, dy: v.dir ? v.dir.dy : 0, id: m.parts.locoId, loco: true }); }
  return out;
}
function drawUnit(v, u) {
  const img = spriteFor(u.id); if (!img) return;
  const k = (u.loco ? 17 : 15) / img.naturalWidth, w = img.naturalWidth * k, h = img.naturalHeight * k;
  isoSprite(img, u.x, u.y + 2, w, h, u.dx || u.dy ? u.dx : 1, u.dy || 0, (V.getModel(u.id) || {}).look);
  if (u.loco && v.broken) { ctx.fillStyle = "rgba(220,60,40,.9)"; ctx.beginPath(); ctx.arc(u.x, u.y - 16, 4, 0, 7); ctx.fill(); }
  else if (u.loco && v.red && view.z > 1) { ctx.fillStyle = "rgba(255,60,40,.9)"; ctx.fillRect(u.x - 2, u.y - 18, 4, 4); }
}
