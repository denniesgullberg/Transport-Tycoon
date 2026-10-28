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
const INDCOL = { coalMine: "#3b3f45", powerStation: "#8a8f98", forest: "#7a5a33", sawmill: "#a8824a", farm: "#b3382c", factory: "#9a5a44", steelMill: "#6b3a3a" };
function drawIndustry(px, py, ind) {
  const c = INDCOL[ind.kind] || "#888";
  box(px - TW * 0.5 * 0, py - TH * 0.5, 2.5, 8, shade(c, 1.2), shade(c, 0.85), shade(c, 0.65));
  const top = py - TH * 0.5 - 8;
  if (ind.kind === "powerStation" || ind.kind === "steelMill" || ind.kind === "factory") {
    for (const dx of [-10, 6]) { ctx.fillStyle = "#555"; ctx.fillRect(px + dx - 3, top - 22, 6, 22); ctx.fillStyle = "rgba(235,235,235,.7)"; ctx.beginPath(); ctx.arc(px + dx + 2, top - 28 - (S.totalDays % 20) * 0.3, 5, 0, 7); ctx.fill(); }
    box(px + 14, top + 6, 0.9, 12, "#aab", "#99a", "#778");
  } else if (ind.kind === "coalMine") {
    poly([px - 18, top + 4, px - 4, top - 12, px + 10, top + 4], "#1c1c20");
    ctx.strokeStyle = "#666"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 10, top + 2); ctx.lineTo(px + 24, top - 10); ctx.stroke();
  } else if (ind.kind === "farm") {
    box(px - 8, top + 4, 1, 12, "#d8cdb8", "#b3382c", "#8a2a20"); box(px + 16, top + 6, 0.5, 20, "#c8c8cc", "#a9a9b0", "#8a8a92");
  } else if (ind.kind === "forest") {
    for (let k = 0; k < 4; k++) drawTree(px - 18 + k * 12, top + 8 + (k % 2) * 4, "#2f6b2f", true);
  } else if (ind.kind === "sawmill") {
    for (let k = 0; k < 3; k++) { ctx.fillStyle = "#8a5a2b"; ctx.fillRect(px - 16 + k * 11, top + 2, 9, 5); }
  }
  if (view.z >= 1.1) label(px, top - (ind.kind === "powerStation" || ind.kind === "steelMill" || ind.kind === "factory" ? 40 : 22), ind.name, 9);
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
function drawTrack(px, py, x, y) {
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
  ctx.strokeStyle = "#86775f"; ctx.lineWidth = TH * 0.52;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke();
  ctx.lineCap = "butt"; ctx.strokeStyle = "#4b3a26"; ctx.lineWidth = TH * 0.4; ctx.setLineDash([1.5, 3]);
  ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = "#cfd2d6"; ctx.lineWidth = 1;
  for (const off of [-2.2, 2.2]) { ctx.beginPath(); for (const d of conn) { const len = Math.hypot(d[2], d[3]), nx = -d[3] / len * off, ny = d[2] / len * off; ctx.moveTo(px + nx, py + ny); ctx.lineTo(px + d[2] + nx, py + d[3] + ny); } ctx.stroke(); }
}
function drawStation(px, py, s) {
  const col = s.owner === "player" ? PLAYER_COLOR : ((S.rivals.find(r => r.ai.id === s.owner) || {}).color || "#888");
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
      if (ov && ov.has(i)) diamond(p.x, p.y, "rgba(255,230,80,.28)", 0.98);
      const rd = R.roads.hasRoad(x, y), rl = !rd && R.rail.hasRoad(x, y);
      const ph = (rd || rl) && S.spans[i] ? iso(x, y, S.spans[i].h) : p;
      if (rd) drawRoad(ph.x, ph.y, x, y);
      else if (rl) drawTrack(ph.x, ph.y, x, y);
      else if (m.forest[i] && !water) { const a = hash(x, y), b = hash(y, x); drawTree(p.x - 8 + a * 6, p.y + 1, pal.tree, a > 0.5); drawTree(p.x + 7 - b * 5, p.y + 3, shade(pal.tree, 0.9), b > 0.4); if (a > 0.3) drawTree(p.x, p.y - 3 + b * 2, shade(pal.tree, 1.05), true); }
      const sIdx = R.stationAt.get(i); if (sIdx) drawStation(ph.x, ph.y, sIdx);
      const dIdx = R.depotAt.get(i); if (dIdx) drawDepot(ph.x, ph.y, dIdx);
      const b = R.bld.get(i); if (b) drawBuilding(p.x, p.y, b, x, y);
      const ind = R.indAt.get(i); if (ind) drawIndustry(p.x, p.y, ind);
    }
  }
  // hover / selected tile
  if (ui.hover && inB(ui.hover.x, ui.hover.y)) {
    const t = ui.hover, p = iso(t.x, t.y, tileH(t.x, t.y));
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath(); ctx.stroke();
  }
  // vehicles
  const vs = S.vehicles.filter(v => !(S.spans[key(v.tile.x, v.tile.y)] || {}).kind || S.spans[key(v.tile.x, v.tile.y)].kind !== "tunnel").map(v => ({ v, pos: vehiclePos(v) })).sort((a, b) => (a.pos.gx + a.pos.gy) - (b.pos.gx + b.pos.gy));
  for (const { v, pos } of vs) drawVehicle(v, pos);
  // labels
  if (view.z >= 0.7) for (const t of m.towns) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    const p = iso(t.x, t.y, tileH(t.x, t.y));
    label(p.x, p.y - 24 - (t.size === "city" ? 20 : 0), t.name, t.size === "city" ? 13 : 11);
  }
}
function vehiclePos(v) {
  let gx = v.tile.x, gy = v.tile.y;
  if (v.state === "moving") { gx = v.from.x + (v.to.x - v.from.x) * v.p; gy = v.from.y + (v.to.y - v.from.y) * v.p; }
  const h0 = tileH(v.from.x, v.from.y), h1 = tileH(v.to.x, v.to.y);
  const h = v.state === "moving" ? h0 + (h1 - h0) * v.p : tileH(v.tile.x, v.tile.y);
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
  const k = isTrain(v) ? Math.min(0.3, 66 / img.naturalWidth) : 0.3, w = img.naturalWidth * k, h = img.naturalHeight * k;
  const facingLeft = v.dir.dx < 0 || v.dir.dy > 0;
  ctx.save(); ctx.translate(pos.x, pos.y + 2);
  if (facingLeft) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h * 0.82, w, h);
  ctx.restore();
  if (v.broken) { ctx.fillStyle = "rgba(220,60,40,.9)"; ctx.beginPath(); ctx.arc(pos.x, pos.y - 20, 4, 0, 7); ctx.fill(); }
  else if (v.loaded > 0 && view.z > 1.2) { ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(pos.x - 3, pos.y - 20, 6, 3); }
}
