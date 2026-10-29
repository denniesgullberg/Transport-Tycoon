// ------------------------------------------------------------------- rendering
// The map is drawn in passes. First the ground (terrain, water, roads, track) for every visible
// tile, then the shadows, then everything standing on the ground in back-to-front order, then
// vehicles, smoke, night and lights. Ground colours are worked out once per 16 x 16 chunk and kept
// until the land in that chunk changes.
const cv = $("#map"), ctx = cv.getContext("2d");
const view = { x: 0, y: 0, z: 1.4 };
let dpr = 1, cssW = 300, cssH = 300;

function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = Math.max(100, r.width); cssH = Math.max(100, r.height);
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
  // the floating bars sit over the map; other overlays keep clear of them
  const tb = $("#topbar"), tl = $("#tools"), root = document.documentElement.style;
  if (tb && tl) { root.setProperty("--toph", Math.round(tb.getBoundingClientRect().bottom) + "px"); root.setProperty("--dockh", Math.round(window.innerHeight - tl.getBoundingClientRect().top) + "px"); }
}
function iso(x, y, h) { return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 - (h || 0) * HS }; }
function tileH(x, y) {
  const i = y * S.map.w + x;
  const sp = S.spans[i]; if (sp) return sp.h;
  return S.map.height[i];
}
function screenToTile(sx, sy) {
  const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
  const u = wx / (TW / 2);
  for (let h = 12; h >= 0; h--) {
    const v = (wy + h * HS) / (TH / 2);
    const x = Math.round((u + v) / 2), y = Math.round((v - u) / 2);
    if (!inB(x, y)) continue;
    if (S.map.height[key(x, y)] === h || (S.map.water[key(x, y)] && h === 0)) return { x, y };
  }
  const v = wy / (TH / 2);
  const x = Math.round((u + v) / 2), y = Math.round((v - u) / 2);
  return inB(x, y) ? { x, y } : null;
}
function centerOn(x, y) {
  const p = iso(x, y, tileH(x, y));
  view.x = cssW / 2 - p.x * view.z; view.y = cssH / 2 - p.y * view.z;
}
function rgbOf(c) {
  if (c[0] === "r") { const m = c.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
  const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c, f) {
  const [r, g, b] = rgbOf(c);
  return "rgb(" + clamp(Math.round(r * f), 0, 255) + "," + clamp(Math.round(g * f), 0, 255) + "," + clamp(Math.round(b * f), 0, 255) + ")";
}
const SHC = new Map();
function shadeC(c, f) { const k = c + f; let v = SHC.get(k); if (!v) { v = shade(c, f); SHC.set(k, v); } return v; }
function mix(a, b, t) {
  const pa = rgbOf(a), pb = rgbOf(b);
  return "rgb(" + Math.round(pa[0] * (1 - t) + pb[0] * t) + "," + Math.round(pa[1] * (1 - t) + pb[1] * t) + "," + Math.round(pa[2] * (1 - t) + pb[2] * t) + ")";
}
const CLIM_EXTRA = {
  temperate: { sand: "#dccb92", earth: "#7d6a4a", deep: "#2f6fa8", trees: ["conifer", "round", "round"] },
  arctic: { sand: "#cfc9b0", earth: "#6f7a78", deep: "#3c6f92", trees: ["conifer"] },
  tropical: { sand: "#ecd59a", earth: "#a5703f", deep: "#1f7d98", trees: ["palm", "round"] },
  toyland: { sand: "#ffe2ad", earth: "#d98fb3", deep: "#4aa3d8", trees: ["lolly"] },
};
let palCache = null, palKey = "";
function palette() {
  const k = S.cfg.climate;
  if (palKey === k && palCache) return palCache;
  const c = CLIM[k], ex = CLIM_EXTRA[k] || CLIM_EXTRA.temperate, out = { top: [], top2: [], water: c.water, wall: [], tree: c.tree, sand: ex.sand, earth: ex.earth, deep: ex.deep, trees: ex.trees };
  for (let h = 0; h <= 12; h++) {
    let base = h >= 5 ? mix(c.grass, c.hill, Math.min(1, (h - 4) / 4)) : shade(c.grass, 1 + h * 0.025);
    if (c.snow && h >= 5) base = mix(base, c.snow, Math.min(1, (h - 4) / 2));
    out.top.push(base); out.top2.push(base);
    out.wall.push([shade(ex.earth, 0.74), shade(ex.earth, 0.95)]);
  }
  out.treeCols = [c.tree, shade(c.tree, 0.92), shade(c.tree, 1.06)];
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
  // box centred on tile centre (px,py), footprint wt tiles wide, hPx tall; light comes from the upper left
  const a = wt * TW / 2, b = wt * TH / 2, ty = py - hPx;
  poly([px - a, py, px, py + b, px, ty + b, px - a, ty], left);
  poly([px + a, py, px, py + b, px, ty + b, px + a, ty], right);
  poly([px, ty - b, px + a, ty, px, ty + b, px - a, ty], top);
  // a soft line where the walls meet the ground
  ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - a, py); ctx.lineTo(px, py + b); ctx.lineTo(px + a, py); ctx.stroke();
}
function hash(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }   // 0..1, spread evenly
function vnoise(x, y) {   // smooth value noise, 0..1
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ------------------------------------------------------------ ground cache
const CH = 16;
const GC = { map: null, chunks: new Map() };
function chunkSig(cx, cy) {
  const m = S.map; let s = 0;
  for (let y = cy * CH - 3; y < cy * CH + CH + 3; y++) for (let x = cx * CH - 3; x < cx * CH + CH + 3; x++) {
    if (!inB(x, y)) continue; const i = y * m.w + x;
    s = (s * 31 + m.height[i] * 3 + m.water[i] + 1) | 0;
  }
  return s;
}
function buildChunk(cx, cy) {
  const m = S.map, pal = palette(), top = [], wl = [], wr = [], kind = [];
  const H = (x, y) => inB(x, y) ? m.height[y * m.w + x] : 0, Wt = (x, y) => inB(x, y) && m.water[y * m.w + x];
  for (let y = cy * CH; y < cy * CH + CH; y++) for (let x = cx * CH; x < cx * CH + CH; x++) {
    const j = (y - cy * CH) * CH + (x - cx * CH);
    if (!inB(x, y)) { top[j] = "#000"; continue; }
    const i = y * m.w + x, h = m.height[i];
    if (m.water[i]) {
      // shallow near the shore, deeper further out
      let d = 4;
      for (let r = 1; r <= 3 && d === 4; r++) for (let dy = -r; dy <= r && d === 4; dy++) for (let dx = -r; dx <= r; dx++) if (inB(x + dx, y + dy) && !Wt(x + dx, y + dy)) { d = r; break; }
      const t = (d - 1) / 3, n = vnoise(x / 6, y / 6) * 0.06;
      top[j] = mix(mix(pal.water, pal.sand, 0.28), pal.deep, Math.min(1, t * 0.9 + n));
      kind[j] = d === 1 ? 2 : 1;
      continue;
    }
    let col = pal.top[h];
    let shore = 0;
    for (const [dx, dy] of DIR4) if (Wt(x + dx, y + dy)) shore = 1;
    if (!shore) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (Wt(x + dx, y + dy)) shore = 0.5;
    if (shore && h <= 2) col = mix(col, pal.sand, shore * 0.55);
    // light from the upper left: land behind higher ground is in shade, crests catch the light
    let f = 0.95 + vnoise(x / 5 + 31, y / 5 + 17) * 0.1 + (hash(x, y) - 0.5) * 0.025;
    f -= Math.max(0, H(x - 1, y) - h) * 0.06 + Math.max(0, H(x, y - 1) - h) * 0.035;
    let higher = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && H(x + dx, y + dy) > h) higher++;
    f -= higher * 0.012;
    if (H(x + 1, y) < h || H(x, y + 1) < h) f += 0.04;
    top[j] = shade(col, f);
    const e = shade(pal.earth, 0.9 + vnoise(x / 3, y / 3) * 0.16);
    wr[j] = shade(e, 0.76); wl[j] = shade(e, 1.0);
    kind[j] = 0;
  }
  return { sig: chunkSig(cx, cy), top, wl, wr, kind };
}
function ground(x, y) {
  if (GC.map !== S.map || GC.clim !== S.cfg.climate) { GC.map = S.map; GC.clim = S.cfg.climate; GC.chunks.clear(); }
  const cx = x >> 4, cy = y >> 4, k = cy * 1000 + cx;
  let c = GC.chunks.get(k);
  if (!c || c.checked !== R.frame) {
    const sig = chunkSig(cx, cy);
    if (!c || c.sig !== sig) { c = buildChunk(cx, cy); GC.chunks.set(k, c); }
    c.checked = R.frame;
  }
  return [c, (y - cy * CH) * CH + (x - cx * CH)];
}

// ------------------------------------------------------------ ground pass
let TS = 0;   // seconds, for water, trees and smoke
function drawGround(x, y, fx, topOnly) {
  const m = S.map, i = y * m.w + x, h = m.height[i], water = m.water[i];
  const [c, j] = ground(x, y), p = iso(x, y, water ? 0 : h);
  diamond(p.x, p.y, c.top[j], 1.02);
  if (topOnly) { if (R.roads.hasRoad(x, y)) drawRoad(p.x, p.y, x, y); else if (R.rail.hasRoad(x, y)) drawTrack(p.x, p.y, x, y, false); return; }
  if (water) {
    if (fx) {
      // shore foam on the edges that touch land, and a few glints out on open water; both are stroked
      // once per frame after the ground pass
      if (c.kind[j] === 2) {
        const F = R.foam, L = [p.x - TW / 2, p.y], Tt = [p.x, p.y - TH / 2], Rr = [p.x + TW / 2, p.y], B = [p.x, p.y + TH / 2];
        const land = (dx, dy) => inB(x + dx, y + dy) && !m.water[key(x + dx, y + dy)];
        if (land(1, 0)) F.push(Rr[0] - 2, Rr[1] + 1, B[0] - 1, B[1] - 1.5);
        if (land(-1, 0)) F.push(Tt[0] + 1, Tt[1] + 1.5, L[0] + 2, L[1] - 1);
        if (land(0, 1)) F.push(L[0] + 2, L[1] + 1, B[0] + 1, B[1] - 1.5);
        if (land(0, -1)) F.push(Tt[0] - 1, Tt[1] + 1.5, Rr[0] - 2, Rr[1] - 1);
      }
      const g = hash(x, y);
      if (g > 0.8) { const o = (g - 0.9) * 30; R.glint[Math.floor(g * 40) & 3].push(p.x - 6 + o, p.y + 1, p.x + 2 + o, p.y - 3); }
    }
  } else {
    // cliffs down to lower neighbours, with a grass lip along the top edge
    if (x + 1 < m.w) { const d = h - m.height[i + 1]; if (d > 0) { poly([p.x + TW / 2, p.y, p.x, p.y + TH / 2, p.x, p.y + TH / 2 + d * HS, p.x + TW / 2, p.y + d * HS], c.wr[j]); poly([p.x + TW / 2, p.y, p.x, p.y + TH / 2, p.x, p.y + TH / 2 + 2, p.x + TW / 2, p.y + 2], shadeC(c.top[j], 0.8)); } }
    if (y + 1 < m.h) { const d = h - m.height[i + m.w]; if (d > 0) { poly([p.x - TW / 2, p.y, p.x, p.y + TH / 2, p.x, p.y + TH / 2 + d * HS, p.x - TW / 2, p.y + d * HS], c.wl[j]); poly([p.x - TW / 2, p.y, p.x, p.y + TH / 2, p.x, p.y + TH / 2 + 2, p.x - TW / 2, p.y + 2], shadeC(c.top[j], 0.9)); } }
  }
  if (prefs.grid) { ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath(); ctx.stroke(); }
  if (ui.overlay && ui.overlay.has(i)) diamond(p.x, p.y, "rgba(255,214,60,.30)", 0.98);
  const rd = R.roads.hasRoad(x, y), rl2 = R.rail.hasRoad(x, y);
  const ph = (rd || rl2) && S.spans[i] ? iso(x, y, S.spans[i].h) : p;
  if (rd) { drawRoad(ph.x, ph.y, x, y); const ow = S.oneway && S.oneway[i]; if (ow) { const d = iso(ow.dx, ow.dy, 0), L = Math.hypot(d.x, d.y), ux = d.x / L, uy = d.y / L; ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.moveTo(ph.x + ux * 7, ph.y + uy * 7); ctx.lineTo(ph.x - ux * 3 - uy * 4, ph.y - uy * 3 + ux * 4); ctx.lineTo(ph.x - ux * 3 + uy * 4, ph.y - uy * 3 - ux * 4); ctx.fill(); } }
  if (rl2) drawTrack(ph.x, ph.y, x, y, rd);
}
// A raised tile in front of a tree or building must be drawn again over it, or the object would
// show through the hill. Only the three tiles behind it matter.
function standsOn(j, x, y) { const m = S.map; return (m.forest[j] && !m.water[j]) || (m.occupied[j] && !R.roads.hasRoad(x, y) && !R.rail.hasRoad(x, y)) || R.stationAt.has(j) || R.depotAt.has(j); }
function isCliff(x, y) {
  const m = S.map, i = y * m.w + x, h = m.height[i];
  if (!h || m.water[i]) return false;
  if (x > 0 && m.height[i - 1] < h && standsOn(i - 1, x - 1, y)) return true;
  if (y > 0 && m.height[i - m.w] < h && standsOn(i - m.w, x, y - 1)) return true;
  if (x > 0 && y > 0 && m.height[i - m.w - 1] < h && standsOn(i - m.w - 1, x - 1, y - 1)) return true;
  return false;
}

// ------------------------------------------------------------ shadows
// Light comes from the upper left, so shadows fall to the lower right. All shadows go in one
// path and are filled once, so where two overlap the ground does not get darker twice.
function shadowBox(px, py, wt, hPx) {
  const a = wt * TW / 2, b = wt * TH / 2, sx = hPx * 0.55, sy = hPx * 0.2;
  ctx.moveTo(px - a, py); ctx.lineTo(px, py - b); ctx.lineTo(px + sx, py - b + sy); ctx.lineTo(px + a + sx, py + sy); ctx.lineTo(px + sx, py + b + sy); ctx.lineTo(px, py + b); ctx.closePath();
}
function shadowBlob(px, py, rx, ry) { ctx.moveTo(px + rx, py); ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); }

// ------------------------------------------------------------ trees
function treesOn(x, y, p, h) {
  const pal = palette(), kinds = pal.trees, a = hash(x, y), b = hash(y, x), c = hash(x + 7, y + 3);
  const kindAt = (r) => kinds[Math.floor(r * kinds.length) % kinds.length];
  const out = [
    { px: p.x - 9 + a * 6, py: p.y + 1, s: a > 0.5 ? 1 : 0.82, k: kindAt(c), col: pal.treeCols[0] },
    { px: p.x + 7 - b * 5, py: p.y + 3, s: b > 0.4 ? 0.95 : 0.78, k: kindAt(a), col: pal.treeCols[1] },
  ];
  if (a > 0.3 && LOD > 0) out.push({ px: p.x - 1, py: p.y - 3 + b * 2, s: 0.9 + c * 0.2, k: kindAt(b), col: pal.treeCols[2] });
  if (S.cfg.climate === "arctic" && h >= 5) out.forEach(t => t.snow = true);
  return out;
}
const LOLLY = ["#ff6fa8", "#7c5cff", "#ffb02e", "#2ec4b6", "#ff5d5d"];
let LOD = 2;   // 2 full detail, 1 simpler shapes, 0 far away
function drawTree(t, sway) {
  const { px, py, s } = t, w = sway * s;
  if (LOD < 2 && t.k !== "palm") {
    // fewer shapes when zoomed out
    ctx.fillStyle = t.k === "lolly" ? LOLLY[Math.floor(hash(Math.round(px), Math.round(py)) * LOLLY.length)] : t.col;
    ctx.beginPath();
    if (t.k === "conifer") { ctx.moveTo(px - 5.5 * s, py - 2 * s); ctx.lineTo(px + 5.5 * s, py - 2 * s); ctx.lineTo(px, py - 20 * s); }
    else ctx.arc(px, py - 10 * s, 5.5 * s, 0, 7);
    ctx.fill();
    if (LOD === 1) { ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.beginPath(); if (t.k === "conifer") { ctx.moveTo(px - 5.5 * s, py - 2 * s); ctx.lineTo(px, py - 2 * s); ctx.lineTo(px, py - 20 * s); } else ctx.arc(px - 1.5 * s, py - 11.5 * s, 3 * s, 0, 7); ctx.fill(); }
    return;
  }
  if (t.k === "conifer") {
    ctx.fillStyle = "#5a3d1a"; ctx.fillRect(px - 1, py - 4 * s, 2, 4 * s);
    for (const [y0, y1, r] of [[-3, -12, 5.5], [-7, -16, 4.6], [-11, -20, 3.4]]) {
      const tx = px + w * (-y1 / 20);
      poly([px - r * s, py + y0 * s, px, py + (y0 + 1.5) * s, tx, py + y1 * s], shadeC(t.col, 1.12));
      poly([px + r * s, py + y0 * s, px, py + (y0 + 1.5) * s, tx, py + y1 * s], shadeC(t.col, 0.82));
    }
    if (t.snow) poly([px - 2.2 * s, py - 16.5 * s, px + 2.2 * s, py - 16.5 * s, px + w, py - 20 * s], "#f4f8fa");
  } else if (t.k === "palm") {
    ctx.strokeStyle = "#8a6236"; ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 3 * s, py - 8 * s, px + 1 * s + w, py - 15 * s); ctx.stroke();
    const tx = px + 1 * s + w, ty = py - 15 * s;
    ctx.strokeStyle = t.col; ctx.lineWidth = 2.2 * s; ctx.beginPath();
    for (const a of [-2.6, -2, -1.2, -0.4, 0.4]) { ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * 5 * s, ty + Math.sin(a) * 5 * s - 2, tx + Math.cos(a) * 8 * s, ty + Math.sin(a) * 4 * s + 3); }
    ctx.stroke();
  } else if (t.k === "lolly") {
    ctx.fillStyle = "#fff4e0"; ctx.fillRect(px - 0.8, py - 9 * s, 1.6, 9 * s);
    const col = LOLLY[Math.floor(hash(Math.round(px), Math.round(py)) * LOLLY.length)];
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px + w, py - 12 * s, 5 * s, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.arc(px + w - 1.6 * s, py - 13.8 * s, 1.8 * s, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = "#5a3d1a"; ctx.fillRect(px - 1, py - 6 * s, 2, 6 * s);
    const cx = px + w, cy = py - 11 * s;
    ctx.fillStyle = shadeC(t.col, 0.8); ctx.beginPath(); ctx.arc(cx + 1.5 * s, cy + 1 * s, 5.6 * s, 0, 7); ctx.fill();
    ctx.fillStyle = shadeC(t.col, 1.05); ctx.beginPath(); ctx.arc(cx - 1 * s, cy - 0.5 * s, 5 * s, 0, 7); ctx.fill();
    ctx.fillStyle = shadeC(t.col, 1.3); ctx.beginPath(); ctx.arc(cx - 2.4 * s, cy - 2.2 * s, 2.2 * s, 0, 7); ctx.fill();
  }
}

// ------------------------------------------------------------ buildings
const BCOL = {
  house: [["#f2e2c4", "#d4bd93", "#b9452f"], ["#e9d5b0", "#c9b186", "#7d4a2f"], ["#f5f0e0", "#d6ccb2", "#4f5a66"], ["#dfe7ea", "#b9c6cc", "#8a3b2a"]],
  shop: [["#e6eef5", "#bccbd8", "#2e6f9e"], ["#f3ece0", "#d3c7b2", "#c0392b"]], apartments: [["#e2ddd3", "#bdb6a9", "#7d7a74"], ["#d9c7b0", "#b29e86", "#6b5d4f"]], tower: [["#c4dcec", "#8fb0c8", "#33566f"], ["#d2d8de", "#a3adb7", "#4b5560"]], church: [["#f4f1e8", "#d4cebd", "#5d6470"]],
};
// a window on one wall: face "l" (the lit, left-facing wall) or "r"; u along the wall 0..1, z height in px
function winQuad(px, py, a, b, face, u0, u1, z0, z1, col) {
  const P = face === "l" ? (u, z) => [px - a + u * a, py + u * b - z] : (u, z) => [px + u * a, py + b - u * b - z];
  const p1 = P(u0, z0), p2 = P(u1, z0), p3 = P(u1, z1), p4 = P(u0, z1);
  poly([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]], col);
  return [(p1[0] + p3[0]) / 2, (p1[1] + p3[1]) / 2];
}
function buildingHeight(b) { return b.kind === "tower" ? 12 + b.floors * 6 : b.kind === "apartments" ? 6 + b.floors * 5 : b.kind === "church" ? 22 : 9 + b.floors * 4.5; }
function drawBuilding(px, py, b, x, y, night) {
  const set = BCOL[b.kind] || BCOL.house, c = set[Math.floor(hash(x, y) * set.length) % set.length], wt = b.kind === "tower" ? 0.68 : 0.74;
  const hh = b.kind === "tower" ? 12 + b.floors * 6 : b.kind === "apartments" ? 6 + b.floors * 5 : b.kind === "church" ? 11 : 5 + b.floors * 4.5;
  const a = wt * TW / 2, bb = wt * TH / 2;
  box(px, py, wt, hh, shadeC(c[0], 1.04), c[0], c[1]);
  const glass = "rgba(42,64,86,.62)", lit = "#ffd27a";
  const W = LOD < 2 && night <= 0.25 ? () => {} : (face, u0, u1, z0, z1) => { const on = night > 0.25 && hash(x * 7 + Math.round(u0 * 10), y * 5 + Math.round(z0)) > 0.35; const m = winQuad(px, py, a, bb, face, u0, u1, z0, z1, on ? lit : face === "l" ? glass : "rgba(30,48,66,.7)"); if (on && LOD === 2 && R.lights.length < 500) R.lights.push([m[0], m[1], 7, 0.5]); };
  if (b.kind === "house") {
    const floors = Math.max(1, b.floors);
    for (let f = 0; f < floors; f++) { const z0 = 2 + f * 4.5, z1 = z0 + 2.6; W("l", 0.18, 0.36, z0, z1); W("l", 0.62, 0.8, z0, z1); W("r", 0.22, 0.42, z0, z1); W("r", 0.6, 0.8, z0, z1); }
    winQuad(px, py, a, bb, "l", 0.43, 0.55, 0, 3.6, shadeC(c[2], 0.7));   // door
    const rh = 7, T0 = [px, py - bb - hh], L = [px - a - 1, py - hh], Rr = [px + a + 1, py - hh], B = [px, py + bb - hh + 0.5], A = [px, py - hh - rh];
    if (hash(y, x) > 0.5) {   // hip roof
      poly([T0[0], T0[1], L[0], L[1], A[0], A[1]], shadeC(c[2], 1.12)); poly([T0[0], T0[1], Rr[0], Rr[1], A[0], A[1]], shadeC(c[2], 0.92));
      poly([L[0], L[1], B[0], B[1], A[0], A[1]], c[2]); poly([B[0], B[1], Rr[0], Rr[1], A[0], A[1]], shadeC(c[2], 0.76));
    } else {   // gable roof with the ridge running left to right
      const r1 = [px - a / 2, py - bb / 2 - hh - rh], r2 = [px + a / 2, py + bb / 2 - hh - rh];
      poly([T0[0], T0[1], Rr[0], Rr[1], r2[0], r2[1], r1[0], r1[1]], shadeC(c[2], 1.1));
      poly([L[0], L[1], B[0], B[1], r2[0], r2[1], r1[0], r1[1]], c[2]);
      poly([B[0], B[1], Rr[0], Rr[1], r2[0], r2[1]], shadeC(c[1], 0.95));
      ctx.fillStyle = "#6d6258"; ctx.fillRect(px + a * 0.2, py - hh - rh, 2.4, 4.5);   // chimney
    }
  } else if (b.kind === "shop") {
    for (let f = 1; f < b.floors; f++) { const z0 = 2 + f * 4.5; W("l", 0.15, 0.45, z0, z0 + 2.6); W("l", 0.55, 0.85, z0, z0 + 2.6); W("r", 0.2, 0.8, z0, z0 + 2.6); }
    winQuad(px, py, a, bb, "l", 0.08, 0.92, 0.5, 3.6, night > 0.25 ? lit : "rgba(160,200,230,.85)");
    winQuad(px, py, a, bb, "l", 0.04, 0.96, 3.6, 5, c[2]);   // awning
    if (night > 0.25) R.lights.push([px - a / 2, py + bb / 2 - 2, 10, 0.6]);
  } else if (b.kind === "apartments" || b.kind === "tower") {
    const n = b.kind === "tower" ? b.floors + 2 : b.floors, step = (hh - 3) / n;
    for (let f = 0; f < n; f++) { const z0 = 2 + f * step, z1 = z0 + step * 0.55; for (const [u0, u1] of [[0.1, 0.28], [0.4, 0.58], [0.7, 0.88]]) { W("l", u0, u1, z0, z1); W("r", u0, u1, z0, z1); } }
    if (b.kind === "tower") { ctx.fillStyle = shadeC(c[2], 1.1); ctx.fillRect(px - 1, py - hh - 9, 2, 9); if (night > 0.25) R.lights.push([px, py - hh - 9, 6, 0.9, "#ff5a4a"]); }
  } else if (b.kind === "church") {
    W("l", 0.3, 0.5, 2, 8); W("r", 0.4, 0.6, 2, 8);
    poly([px - a, py - hh, px, py + bb - hh, px + a, py - hh, px, py - hh - 8], shadeC(c[2], 0.9));
    box(px, py - hh - 4, 0.22, 8, "#8a8a92", "#ece6d6", "#cfc8b6");
    poly([px - 4.4, py - hh - 12, px, py - hh - 26, px + 4.4, py - hh - 12, px, py - hh - 10], shadeC(c[2], 0.85));
  }
}

// ------------------------------------------------------------ industries
function chimneys(px, top, n) {
  for (let k = 0; k < n; k++) {
    const dx = -12 + k * 12;
    ctx.fillStyle = "#6a6d72"; ctx.fillRect(px + dx - 3, top - 22, 6, 22); ctx.fillStyle = "#4b4e53"; ctx.fillRect(px + dx + 1, top - 22, 2, 22);
    ctx.fillStyle = "#c0392b"; ctx.fillRect(px + dx - 3, top - 20, 6, 2);
    puff(px + dx, top - 23, "smoke", 0.5);
  }
}
function drawIndustry(px, py, ind) {
  const [tpl, c] = IND_LOOK[ind.kind] || ["works", "#888"];
  let top = py - TH * 0.5 - 8, tall = false;
  if (tpl === "rig") {
    ctx.fillStyle = "#4a4f57"; for (const [dx, dy] of [[-12, 0], [12, 0], [0, -6], [0, 6]]) ctx.fillRect(px + dx - 1, py + dy - 6, 2, 12);
    box(px, py - 8, 1.6, 4, "#a4aab2", "#848a92", "#5e646c");
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 4, py - 14); ctx.lineTo(px + 8, py - 40); ctx.lineTo(px + 12, py - 14); ctx.moveTo(px + 5, py - 22); ctx.lineTo(px + 11, py - 22); ctx.moveTo(px + 6, py - 30); ctx.lineTo(px + 10, py - 30); ctx.stroke();
    ctx.fillStyle = "#e8e8e8"; ctx.beginPath(); ctx.ellipse(px - 8, py - 16, 6, 3, 0, 0, 7); ctx.fill();
    puff(px + 8, py - 42, "flare", 0.4);
    top = py - 24; tall = true;
    R.lights.push([px + 8, py - 40, 10, 0.8, "#ffb04a"]);
  } else {
    box(px, py - TH * 0.5, 2.5, 8, shadeC(c, 1.2), shadeC(c, 0.92), shadeC(c, 0.68));
    if (tpl === "works") {
      chimneys(px, top, 2);
      box(px + 14, top + 6, 0.9, 12, shadeC(c, 1.35), shadeC(c, 1.1), shadeC(c, 0.85));
      for (let k = 0; k < 3; k++) winQuad(px + 14, top + 6, 0.9 * TW / 2, 0.9 * TH / 2, "l", 0.12 + k * 0.28, 0.3 + k * 0.28, 4, 8, "rgba(40,60,80,.55)");
      tall = true; R.lights.push([px + 8, top + 2, 12, 0.55]);
    } else if (tpl === "tanks") {
      for (const [dx, dy] of [[-12, 4], [0, 8], [12, 4]]) { ctx.fillStyle = "#c9cdd2"; ctx.beginPath(); ctx.ellipse(px + dx, top + dy + 2, 7, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#b3b8be"; ctx.fillRect(px + dx - 7, top + dy - 6, 14, 8); ctx.fillStyle = "#dde1e6"; ctx.fillRect(px + dx - 7, top + dy - 6, 5, 8); ctx.fillStyle = "#eef1f4"; ctx.beginPath(); ctx.ellipse(px + dx, top + dy - 6, 7, 3, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#555"; ctx.fillRect(px + 18, top - 26, 3, 26); puff(px + 19.5, top - 29, "flare", 0.6); tall = true;
      R.lights.push([px + 19.5, top - 29, 12, 0.9, "#ffb04a"]);
    } else if (tpl === "mine") {
      poly([px - 18, top + 4, px - 4, top - 12, px + 10, top + 4], shadeC(c, 0.75)); poly([px - 4, top - 12, px + 10, top + 4, px + 2, top + 4], shadeC(c, 0.55));
      ctx.strokeStyle = "#555"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 10, top + 2); ctx.lineTo(px + 24, top - 10); ctx.stroke();
      ctx.strokeStyle = "#3d3f44"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + 12, top + 2); ctx.lineTo(px + 15.5, top - 18); ctx.lineTo(px + 19, top + 2); ctx.stroke();
      const r = (TS * 2) % (Math.PI * 2); ctx.beginPath(); ctx.arc(px + 15.5, top - 18, 3.5, r, r + 5); ctx.stroke();
    } else if (tpl === "farm") { box(px - 8, top + 4, 1, 12, "#d8cdb8", c, shadeC(c, 0.75)); box(px + 16, top + 6, 0.5, 20, "#d0d0d4", "#b5b5bc", "#8a8a92"); ctx.fillStyle = "#c9c9cf"; ctx.beginPath(); ctx.ellipse(px + 16, top - 14, 5, 2.5, 0, 0, 7); ctx.fill(); }
    else if (tpl === "orchard") { for (let k = 0; k < 6; k++) { const ox = -18 + (k % 3) * 14, oy = top + 2 + Math.floor(k / 3) * 8; ctx.fillStyle = "#2f6b2f"; ctx.beginPath(); ctx.arc(px + ox, oy, 5, 0, 7); ctx.fill(); ctx.fillStyle = "#3f8a3a"; ctx.beginPath(); ctx.arc(px + ox - 1.5, oy - 1.5, 3, 0, 7); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px + ox + 1, oy - 1, 1.6, 0, 7); ctx.fill(); } }
    else if (tpl === "forest") { for (let k = 0; k < 4; k++) drawTree({ px: px - 18 + k * 12, py: top + 8 + (k % 2) * 4, s: 1, k: "conifer", col: "#2f6b2f" }, 0); }
    else if (tpl === "sawmill") { for (let k = 0; k < 3; k++) { ctx.fillStyle = "#8a5a2b"; ctx.fillRect(px - 16 + k * 11, top + 2, 9, 5); ctx.fillStyle = "#b07a42"; ctx.fillRect(px - 16 + k * 11, top + 2, 9, 1.5); } puff(px + 10, top - 6, "dust", 0.15); }
    else if (tpl === "wells") {
      for (const dx of [-12, 8]) { const bob = Math.sin(TS * 1.6 + dx) * 3; ctx.strokeStyle = shadeC(c, 1.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + dx - 6, top + 6); ctx.lineTo(px + dx, top - 8); ctx.lineTo(px + dx + 6, top + 6); ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px + dx - 9, top - 8 + bob); ctx.lineTo(px + dx + 9, top - 8 - bob); ctx.stroke(); }
    } else if (tpl === "fountain") {
      for (const dx of [-10, 10]) { ctx.fillStyle = shadeC(c, 0.8); ctx.beginPath(); ctx.ellipse(px + dx, top + 6, 7, 3, 0, 0, 7); ctx.fill(); ctx.strokeStyle = shadeC(c, 1.4); ctx.lineWidth = 1.5; ctx.beginPath(); for (const a of [-0.5, 0, 0.5]) { ctx.moveTo(px + dx, top + 5); ctx.quadraticCurveTo(px + dx + a * 10, top - 16 - Math.sin(TS * 3) * 2, px + dx + a * 16, top + 4); } ctx.stroke(); }
    }
  }
  if (prefs.labels && view.z >= 1.1) R.labelsLate.push([px, top - (tall ? 44 : 26), ind.name, 9.5, false]);
}

// ------------------------------------------------------------ labels
function label(px, py, text, size, col) {
  ctx.font = "700 " + size + "px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(15,20,25,.75)";
  ctx.strokeText(text, px, py); ctx.fillStyle = col || "#fff"; ctx.fillText(text, px, py);
}
const PILLW = new Map();
function pill(px, py, text, size, strong) {
  ctx.font = (strong ? "700 " : "600 ") + size + "px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const k = size + "|" + (strong ? 1 : 0) + text; let w = PILLW.get(k); if (w == null) { w = ctx.measureText(text).width; PILLW.set(k, w); }
  const W = w + size * 1.3, H = size * 1.75, x = px - W / 2, y = py - H / 2, r = H / 2;
  ctx.fillStyle = strong ? "rgba(17,24,33,.78)" : "rgba(17,24,33,.6)";
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + W - r, y); ctx.arc(x + W - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + H); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.fillText(text, px, py + 0.5); ctx.textBaseline = "alphabetic";
}

// ------------------------------------------------------------ roads and track
function townZoneFast(x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inB(x + dx, y + dy) && R.bld.has(key(x + dx, y + dy))) return true;
  return false;
}
function drawRoad(px, py, x, y) {
  const m = S.map, i = y * m.w + x;
  const sp = S.spans[i];
  if (sp && sp.kind === "tunnel") { diamond(px, py, "rgba(0,0,0,.25)", 0.5); return; }
  const dirs = [[1, 0, TW / 4, TH / 4], [-1, 0, -TW / 4, -TH / 4], [0, 1, -TW / 4, TH / 4], [0, -1, TW / 4, -TH / 4]];
  const conn = dirs.filter(d => inB(x + d[0], y + d[1]) && R.roads.hasRoad(x + d[0], y + d[1]));
  if (sp && sp.kind === "bridge") {
    ctx.strokeStyle = "#b9a27a"; ctx.lineWidth = 13; ctx.lineCap = "butt";
    ctx.beginPath(); for (const d of (conn.length ? conn : dirs.slice(0, 2))) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(px - 2, py + 5, 4, 9);
  }
  const town = !sp && townZoneFast(x, y);
  // butt ends meet the next tile exactly at the shared edge; bends and junctions get a round middle
  ctx.lineCap = "butt"; ctx.lineJoin = "round";
  const bend = !(conn.length === 2 && conn[0][0] === -conn[1][0] && conn[0][1] === -conn[1][1]);
  const layer = (col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke(); if (bend) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px, py, w / 2, w / 2, 0, 0, 7); ctx.fill(); } };
  if (town) layer("#c4c0b6", TH * 0.86);   // pavement in towns
  layer("#4b4f55", TH * 0.62);
  ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 0.9; ctx.setLineDash([3, 4]);
  ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke(); ctx.setLineDash([]);
  ctx.lineCap = "butt";
  if (town && hash(x + 101, y + 57) > 0.7) R.lamps.push([px + 6, py - 2]);
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
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(px - 2, py + 5, 4, 9);
  }
  ctx.lineCap = "butt"; ctx.lineJoin = "round";
  if (!crossing) {
    ctx.strokeStyle = "#9a9081"; ctx.lineWidth = TH * 0.56;
    ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke();
    if (!(conn.length === 2 && conn[0][0] === -conn[1][0] && conn[0][1] === -conn[1][1])) { ctx.fillStyle = "#9a9081"; ctx.beginPath(); ctx.arc(px, py, TH * 0.28, 0, 7); ctx.fill(); }
    ctx.lineCap = "butt"; ctx.strokeStyle = "#5a4630"; ctx.lineWidth = TH * 0.42; ctx.setLineDash([1.6, 2.8]);
    ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py); ctx.lineTo(px + d[2], py + d[3]); } ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = "#dfe3e8"; ctx.lineWidth = 1;
  for (const off of [-2.2, 2.2]) { ctx.beginPath(); for (const d of conn) { const len = Math.hypot(d[2], d[3]), nx = -d[3] / len * off, ny = d[2] / len * off; ctx.moveTo(px + nx, py + ny); ctx.lineTo(px + d[2] + nx, py + d[3] + ny); } ctx.stroke(); }
  const res = R.res && R.res.get(i);
  if (crossing) {   // barriers: striped poles, lowered when a train has the crossing
    ctx.lineWidth = 2; ctx.setLineDash([2, 2]); ctx.strokeStyle = res ? "#d22" : "#eee";
    ctx.beginPath(); ctx.moveTo(px - 12, py - 2); ctx.lineTo(px - 12 + (res ? 10 : 2), py - 2 - (res ? 0 : 10)); ctx.moveTo(px + 12, py + 2); ctx.lineTo(px + 12 - (res ? 10 : 2), py + 2 - (res ? 0 : 10)); ctx.stroke(); ctx.setLineDash([]);
    if (res && Math.floor(performance.now() / 333) % 2) R.lights.push([px - 12, py - 4, 6, 0.9, "#ff3b30"]);
  }
  if (S.elec && S.elec[i]) {   // catenary: a mast and the wire over each connection
    ctx.strokeStyle = "#5b5f66"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px + 9, py - 2); ctx.lineTo(px + 9, py - 15); ctx.stroke();
    ctx.strokeStyle = "rgba(40,40,40,.75)"; ctx.lineWidth = 0.7; ctx.beginPath(); for (const d of conn) { ctx.moveTo(px, py - 13); ctx.lineTo(px + d[2], py + d[3] - 13); } ctx.stroke();
  }
  const sg = S.signals && S.signals[i];
  if (sg) {
    const nx = x + sg.dx, ny = y + sg.dy, free = !(R.res && R.res.get(ny * m.w + nx));
    const off = iso(sg.dy, -sg.dx, 0), ox = off.x * 0.35, oy = off.y * 0.35;   // to the right of the direction of travel
    R.signalsLate.push([px + ox, py + oy, free, sg]);
  }
}
function drawSignal(sx, sy, free, sg) {
  ctx.fillStyle = "#3a3d42"; ctx.fillRect(sx - 1, sy - 13, 2, 13);
  ctx.fillStyle = "#1d1f23"; ctx.fillRect(sx - 3, sy - 20, 6, 8);
  const col = free ? "#3ddc5a" : "#ff3b30";
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy - 16, 2, 0, 7); ctx.fill();
  R.lights.push([sx, sy - 16, 5, 0.9, col]);
  if (sg.two) { ctx.fillStyle = "#fff"; ctx.fillRect(sx - 3, sy - 22, 6, 1.6); }
  if (sg.path) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(sx - 3, sy - 20.5); ctx.lineTo(sx + 3, sy - 20.5); ctx.lineTo(sx, sy - 24.5); ctx.fill(); }
}

// ------------------------------------------------------------ stations and depots
function drawPier(px, py, s) {
  const w = s.water, d = iso(w.x - s.x, w.y - s.y, 0), bx = px + d.x * 0.85, by = py + d.y * 0.85;
  poly([px + d.x * 0.3 - 5, py + d.y * 0.3, px + d.x * 0.3 + 5, py + d.y * 0.3, bx + 5, by, bx - 5, by], "#8a6a3e");
  ctx.fillStyle = "#5a4326"; for (const [ox, oy] of [[-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]]) ctx.fillRect(bx + ox * TW - 1.5, by + oy * TH, 3, 7);
  diamond(bx, by, "#9a7646", 0.55);
  ctx.strokeStyle = "rgba(60,40,20,.4)"; ctx.lineWidth = 1;
  for (const f of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(bx - TW * 0.275 * (1 - Math.abs(f)), by + f * TH * 0.55); ctx.lineTo(bx + TW * 0.275 * (1 - Math.abs(f)), by + f * TH * 0.55); ctx.stroke(); }
  const cx = px + d.x * 0.42, cy = py + d.y * 0.42;
  ctx.strokeStyle = "#e0a91f"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 28); ctx.lineTo(bx, by - 30); ctx.stroke();
  ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by - 30); ctx.lineTo(bx, by - 16); ctx.stroke();
  ctx.fillStyle = "#333"; ctx.fillRect(bx - 2, by - 16, 4, 3);
  R.lights.push([bx, by - 4, 9, 0.7]);
}
function ownerColor(o) { return o === "player" ? PLAYER_COLOR : o === "public" ? "#777" : ((S.rivals.find(r => r.ai.id === o) || {}).color || "#888"); }
function drawStation(px, py, s, x, y) {
  const col = ownerColor(s.owner);
  if (s.kind === "dock") {
    if (s.rigId) return;
    // the shed on the shore; the pier and crane are drawn after the land so the shore does not hide them
    const w = s.water, d = iso(w.x - s.x, w.y - s.y, 0);
    box(px - d.x * 0.12, py - d.y * 0.12, 0.6, 12, "#d3c09a", "#b49f78", "#8a7552");
    diamond(px - d.x * 0.12, py - d.y * 0.12 - 12, col, 0.3);
    (R.docksLate || (R.docksLate = [])).push([px, py, s]);
    return;
  }
  if (s.kind === "airport") {
    diamond(px, py, "#8d9096", 0.98);
    const big = s.size === "large", n = big ? 3 : 2, cx = x - s.x, cy = y - s.y;
    if (cy === n - 1) { ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px - TW / 4, py - TH / 4); ctx.lineTo(px + TW / 4, py + TH / 4); ctx.stroke(); ctx.setLineDash([]); R.lights.push([px - TW / 4, py - TH / 4, 5, 0.8, "#7fc4ff"], [px + TW / 4, py + TH / 4, 5, 0.8, "#7fc4ff"]); }
    if (cx === 0 && cy === 0) { box(px, py, 0.7, 10, "#ece8dc", "#cfc9b4", "#aaa38c"); ctx.fillStyle = "#3a6fa8"; ctx.fillRect(px - 8, py - 13, 16, 3); }
    if (cx === n - 1 && cy === 0) { ctx.fillStyle = "#666"; ctx.fillRect(px - 1.5, py - 26, 3, 24); ctx.fillStyle = "#bfe3ff"; ctx.fillRect(px - 5, py - 31, 10, 6); ctx.fillStyle = col; ctx.fillRect(px - 5, py - 33, 10, 2); R.lights.push([px, py - 28, 9, 0.8, "#bfe3ff"]); }
    if (cx === 0 && cy === n - 1) box(px, py, 0.8, 9, "#bec2c8", "#9aa0a8", "#7a8088");
    return;
  }
  if (s.kind === "trainStation") {
    box(px, py, 0.85, 3, "#d4cfbd", "#b3ad99", "#8f8873");
    ctx.fillStyle = "#3a3d42"; ctx.fillRect(px - 10, py - 15, 2, 13); ctx.fillRect(px + 8, py - 15, 2, 13);
    poly([px - 14, py - 16, px + 2, py - 22, px + 14, py - 16, px - 2, py - 10], col);
    poly([px - 14, py - 16, px - 2, py - 10, px - 2, py - 8.5, px - 14, py - 14.5], shade(col, 0.7));
    R.lights.push([px, py - 12, 10, 0.7]);
    return;
  }
  box(px, py, 0.55, 3, "#ddd8c7", "#b4ae9c", "#99937f");
  ctx.fillStyle = "#3a3d42"; ctx.fillRect(px - 1, py - 24, 2, 21);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py - 23, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "800 5.5px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.kind === "busStop" ? "BUS" : "GDS", px, py - 21);
  R.lights.push([px, py - 22, 7, 0.6]);
}
function drawDepot(px, py, d) {
  if (d && d.kind === "ship") { box(px, py + 2, 0.8, 9, "#8a6a43", "#8a6a43", "#5a4223"); ctx.fillStyle = "#1c2a3a"; ctx.fillRect(px - 5, py - 4, 10, 6); return; }
  if (d && d.kind === "air") return;
  if (d && d.kind === "rail") {
    box(px, py, 0.85, 12, "#5d6b82", "#6b7b94", "#3f4b5d");
    ctx.fillStyle = "#15181f"; ctx.beginPath(); ctx.moveTo(px - 5, py - 1); ctx.lineTo(px - 5, py - 6); ctx.quadraticCurveTo(px, py - 12, px + 5, py - 6); ctx.lineTo(px + 5, py - 1); ctx.fill();
    R.lights.push([px, py - 8, 8, 0.6]);
    return;
  }
  box(px, py, 0.8, 11, "#b55a44", "#c0644a", "#8f3f2e");
  ctx.fillStyle = "#2a2018"; ctx.fillRect(px - 4, py - 7, 8, 7); ctx.fillStyle = "rgba(255,255,255,.25)"; for (let k = 1; k < 4; k++) ctx.fillRect(px - 4, py - 7 + k * 1.8, 8, 0.6);
  R.lights.push([px, py - 8, 8, 0.6]);
}

// ------------------------------------------------------------ particles
const PT = [];
function puff(x, y, kind, rate) {
  if (!prefs.effects || PT.length > 260 || Math.random() > rate * (R.dtF || 1) * 0.25) return;
  const smoke = kind === "smoke" || kind === "steam";
  PT.push({ x: x + (Math.random() - 0.5) * 2, y, vx: 3 + Math.random() * 3, vy: -(smoke ? 8 : 5) - Math.random() * 4, r: kind === "flare" ? 2 : 2.5, g: kind === "flare" ? 2.6 : smoke ? 5 : 3, life: 0, max: kind === "flare" ? 0.5 : smoke ? 3.2 : 1.6, kind });
}
function drawParticles(dt) {
  for (let k = PT.length - 1; k >= 0; k--) {
    const p = PT[k]; p.life += dt; if (p.life >= p.max) { PT.splice(k, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.g * dt; p.vy *= 0.99;
    const f = p.life / p.max, a = (1 - f) * (p.kind === "flare" ? 0.9 : p.kind === "dust" ? 0.35 : 0.5), g = Math.round(150 + f * 70);
    ctx.fillStyle = p.kind === "flare" ? "rgba(255," + Math.round(180 - f * 120) + ",60," + a.toFixed(2) + ")" : p.kind === "dust" ? "rgba(200,170,120," + a.toFixed(2) + ")" : p.kind === "steam" ? "rgba(245,245,245," + a.toFixed(2) + ")" : "rgba(" + g + "," + g + "," + (g + 5) + "," + a.toFixed(2) + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
}

// ------------------------------------------------------------ day and night
// A full day lasts five minutes of play while the game runs. Returns 0 (day) to 1 (deep night).
const DAYNIGHT_SECONDS = 300;
function dayPhase() { return ((R && R.clock) || 0) / DAYNIGHT_SECONDS % 1; }
function darkness() {
  if (!prefs.daynight || !S) return 0;
  const ph = dayPhase();
  if (ph < 0.55) return 0; if (ph < 0.65) return (ph - 0.55) / 0.1; if (ph < 0.9) return 1; return 1 - (ph - 0.9) / 0.1;
}
function duskWarmth() { if (!prefs.daynight) return 0; const ph = dayPhase(); return ph > 0.5 && ph < 0.66 ? 1 - Math.abs(ph - 0.58) / 0.08 : ph > 0.88 && ph < 0.97 ? (1 - Math.abs(ph - 0.925) / 0.045) * 0.6 : 0; }
let GLOW = null;
const TINTED = new Map();
function tintedGlow(col) {
  let c = TINTED.get(col); if (c) return c;
  if (!GLOW) {
    GLOW = document.createElement("canvas"); GLOW.width = GLOW.height = 64; const g = GLOW.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.drawImage(GLOW, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, 64, 64);
  TINTED.set(col, c); return c;
}
function drawNight(dk, W, H) {
  const warm = duskWarmth();
  if (dk <= 0.01 && warm <= 0.01) return;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = mix(mix("#ffffff", "#ffb48a", warm * 0.45), "#3c4a86", dk * 0.72); ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function drawLights(dk) {
  if (dk < 0.15) return;
  const a0 = Math.min(1, (dk - 0.15) / 0.5);
  if (view.z > 0.8) { ctx.fillStyle = "#3a3d42"; for (const [x, y] of R.lamps) ctx.fillRect(x - 0.5, y - 13, 1, 13); }
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const [x, y] of R.lamps) { ctx.globalAlpha = a0 * 0.55; ctx.drawImage(tintedGlow("#ffcf7a"), x - 10, y - 24, 20, 20); }
  for (const l of R.lights) { const r = l[2]; ctx.globalAlpha = a0 * l[3]; ctx.drawImage(tintedGlow(l[4] || "#ffd27a"), l[0] - r, l[1] - r, r * 2, r * 2); }
  ctx.restore();
}

// ------------------------------------------------------------ the frame
function draw() {
  if (!S) return;
  const m = S.map, W = cssW, H = cssH, now = performance.now();
  const dt = Math.min(0.1, (now - (R.lastDraw || now)) / 1000); R.lastDraw = now; R.frame = (R.frame || 0) + 1; R.dtF = dt * 60;
  if (!ui.paused) R.clock = (R.clock || 0) + dt;
  TS = prefs.effects ? now / 1000 : 0;
  LOD = view.z >= 1.2 ? 2 : view.z >= 0.75 ? 1 : 0;
  const fx = prefs.effects && view.z > 0.6, dk = darkness();
  R.lights = []; R.lamps = []; R.signalsLate = []; R.labelsLate = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#121a10"; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
  // visible tile range
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z, u = wx / (TW / 2), v = wy / (TH / 2);
    const x = (u + v) / 2, y = (v - u) / 2; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const x0 = clamp(Math.floor(minX) - 3, 0, m.w - 1), x1 = clamp(Math.ceil(maxX) + 3, 0, m.w - 1), y0 = clamp(Math.floor(minY) - 3, 0, m.h - 1), y1 = clamp(Math.ceil(maxY) + 8, 0, m.h - 1);
  // 1. ground
  R.foam = []; R.glint = [[], [], [], []];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawGround(x, y, fx);
  if (fx) {
    const seg = (a) => { ctx.beginPath(); for (let k = 0; k < a.length; k += 4) { ctx.moveTo(a[k], a[k + 1]); ctx.lineTo(a[k + 2], a[k + 3]); } ctx.stroke(); };
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.3 + 0.12 * Math.sin(TS * 1.7); seg(R.foam);
    ctx.lineWidth = 1; R.glint.forEach((a, q) => { ctx.globalAlpha = Math.max(0, Math.sin(TS * 1.3 + q * 1.6)) * 0.45; if (ctx.globalAlpha > 0.03) seg(a); });
    ctx.globalAlpha = 1;
  }
  // 2. shadows of everything standing on the ground
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * m.w + x;
    const b = R.bld.get(i), ind = R.indAt.get(i), st = R.stationAt.get(i), dp = R.depotAt.get(i);
    if (!b && !ind && !st && !dp && !(m.forest[i] && !m.water[i])) continue;
    const p = iso(x, y, m.water[i] ? 0 : m.height[i]);
    if (b) shadowBox(p.x, p.y, 0.74, buildingHeight(b));
    else if (ind && ind.kind !== "oilRig") shadowBox(p.x, p.y - TH * 0.5, 2.5, 14);
    else if (dp && dp.kind !== "air") shadowBox(p.x, p.y, 0.8, 11);
    else if (st && (st.kind === "busStop" || st.kind === "truckStop")) shadowBlob(p.x + 7, p.y - 1, 6, 2);
    else if (LOD > 0 && !st && !dp && !R.roads.hasRoad(x, y) && !R.rail.hasRoad(x, y)) for (const t of treesOn(x, y, p, m.height[i])) shadowBlob(t.px + 6 * t.s, t.py + 1, 6 * t.s, 2.4 * t.s);
  }
  ctx.fillStyle = "rgba(10,20,10,.22)"; ctx.fill();
  // 3. objects, back to front; a raised tile is drawn again over whatever stands behind it
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * m.w + x;
    if ((x > x0 || y > y0) && isCliff(x, y)) drawGround(x, y, false, true);
    const rd = R.roads.hasRoad(x, y), rl = R.rail.hasRoad(x, y);
    const hasTree = !rd && !rl && m.forest[i] && !m.water[i];
    const st = R.stationAt.get(i), dp = R.depotAt.get(i), b = R.bld.get(i), ind = R.indAt.get(i);
    if (!hasTree && !st && !dp && !b && !ind) continue;
    const p = iso(x, y, m.water[i] ? 0 : m.height[i]);
    const ph = (rd || rl) && S.spans[i] ? iso(x, y, S.spans[i].h) : p;
    if (hasTree && !st && !b && !dp) { const sw = fx ? Math.sin(TS * 1.2 + hash(x, y) * 6) * 0.7 : 0; for (const t of treesOn(x, y, p, m.height[i])) drawTree(t, sw); }
    if (st) { drawStation(ph.x, ph.y, st, x, y); if (st.x === x && st.y === y && st.kind !== "airport") drawCargoPiles(ph.x, ph.y, st); }
    if (dp) drawDepot(ph.x, ph.y, dp);
    if (b) drawBuilding(p.x, p.y, b, x, y, dk);
    if (ind) drawIndustry(p.x, p.y, ind);
  }
  if (R.docksLate) { for (const [px, py, s] of R.docksLate) drawPier(px, py, s); R.docksLate = null; }
  for (const s of R.signalsLate) drawSignal(s[0], s[1], s[2], s[3]);
  // planned road or track while dragging
  if (ui.plan && ui.plan.tiles) for (const q of ui.plan.tiles) { if (!inB(q.x, q.y)) continue; const p = iso(q.x, q.y, tileH(q.x, q.y)); diamond(p.x, p.y, q.st === "bad" ? "rgba(230,70,50,.5)" : q.st === "have" ? "rgba(255,255,255,.22)" : "rgba(110,230,120,.5)", 0.9); }
  // hover / selected tile
  if (ui.hover && inB(ui.hover.x, ui.hover.y)) {
    const t = ui.hover, p = iso(t.x, t.y, tileH(t.x, t.y));
    ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // 4. vehicles
  const inTunnel = (x, y) => (S.spans[key(Math.round(x), Math.round(y))] || {}).kind === "tunnel";
  const vis = (gx, gy) => gx >= x0 - 2 && gx <= x1 + 2 && gy >= y0 - 2 && gy <= y1 + 2;
  const vs = [];
  for (const v of S.vehicles) {
    if (isTrain(v)) { if (!vis(v.tile.x, v.tile.y) && !(v.trail || []).some(t => vis(t.x, t.y))) continue; for (const u of trainUnits(v)) if (!inTunnel(u.gx, u.gy)) vs.push({ v, pos: u, unit: u }); }
    else if (!inTunnel(v.tile.x, v.tile.y) && (isAir(v) || vis(v.tile.x, v.tile.y))) vs.push({ v, pos: vehiclePos(v) });
  }
  vs.sort((a, b) => (a.pos.gx + a.pos.gy) - (b.pos.gx + b.pos.gy));
  for (const it of vs) it.unit ? drawUnit(it.v, it.unit, dk) : drawVehicle(it.v, it.pos, dk);
  drawParticles(dt);
  // 5. night falls over everything drawn so far; lights shine through it
  drawNight(dk, W, H);
  drawLights(dk);
  // 6. labels and income pop-ups
  for (const l of R.labelsLate) pill(l[0], l[1], l[2], l[3], l[4]);
  if (prefs.labels && view.z >= 0.6) for (const t of m.towns) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    const p = iso(t.x, t.y, tileH(t.x, t.y));
    pill(p.x, p.y - 30 - (t.size === "city" ? 20 : 0), t.name, t.size === "city" ? 12.5 : 11, true);
  }
  R.floats = R.floats.filter(f => now - f.t < 1600);
  for (const f of R.floats) {
    const a = (now - f.t) / 1600, e = 1 - Math.pow(1 - Math.min(1, a * 1.6), 3), p = iso(f.x, f.y, tileH(f.x, f.y)), y = p.y - 26 - e * 24, s = a < 0.12 ? 0.6 + a / 0.12 * 0.5 : a < 0.22 ? 1.1 - (a - 0.12) : 1;
    ctx.globalAlpha = a > 0.7 ? 1 - (a - 0.7) / 0.3 : 1;
    ctx.save(); ctx.translate(p.x, y); ctx.scale(s, s);
    ctx.fillStyle = "#c98a00"; ctx.beginPath(); ctx.arc(-14, 0.6, 5.4, 0, 7); ctx.fill(); ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(-14, 0, 5.4, 0, 7); ctx.fill();
    ctx.fillStyle = "#9a6a00"; ctx.font = "800 7px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("£", -14, 2.5);
    ctx.textAlign = "left"; ctx.font = "800 11px Inter, system-ui, sans-serif"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(15,20,25,.7)"; ctx.strokeText(f.text, -7, 4); ctx.fillStyle = f.color === "#ffe26b" ? "#fff6c9" : f.color; ctx.fillText(f.text, -7, 4);
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ vehicles
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
function screenDir(dx, dy) { const d = iso(dx, dy, 0), L = Math.hypot(d.x, d.y) || 1; return [d.x / L, d.y / L]; }
function drawVehicle(v, pos, dk) {
  const img = spriteFor(v.modelId); if (!img) return;
  const dx = v.dir.dx || v.dir.dy ? v.dir.dx : 1, dy = v.dir.dy || 0, [ux, uy] = screenDir(dx, dy);
  if (isAir(v)) {
    const alt = v.state === "moving" ? 34 * Math.min(1, Math.sin(Math.PI * v.p) * 2.2) : 0;
    ctx.fillStyle = "rgba(0,0,0," + (alt > 2 ? 0.16 : 0.22) + ")"; ctx.beginPath(); ctx.ellipse(pos.x + alt * 0.3, pos.y + 2 + alt * 0.1, 9, 3, 0, 0, 7); ctx.fill();
    const k = 0.24, w = img.naturalWidth * k, h = img.naturalHeight * k;
    isoSprite(img, pos.x, pos.y + 2 - alt, w, h, dx, dy);
    if (dk > 0.2) { const blink = Math.floor(performance.now() / 500 + (+v.id.slice(1) || 0)) % 2; R.lights.push([pos.x - uy * 6, pos.y + 2 - alt + ux * 3, 5, 0.9, blink ? "#ff3b30" : "#3ddc5a"]); }
    return;
  }
  const ship = isShip(v), k = isTrain(v) ? Math.min(0.3, 66 / img.naturalWidth) : 0.3, w = img.naturalWidth * k, h = img.naturalHeight * k;
  if (ship) {
    if (v.state === "moving" && prefs.effects) {
      // wake: two white lines opening out behind the stern
      const sx = pos.x - ux * 9, sy = pos.y - uy * 9 + 2, nx = -uy, ny = ux;
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.2; ctx.beginPath();
      for (const sgn of [-1, 1]) { ctx.moveTo(sx + nx * sgn * 2, sy + ny * sgn * 2); ctx.lineTo(sx - ux * 16 + nx * sgn * 7, sy - uy * 16 + ny * sgn * 4); }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.ellipse(sx - ux * 5, sy - uy * 5, 4, 2, 0, 0, 7); ctx.fill();
    }
  } else { ctx.fillStyle = "rgba(10,20,10,.25)"; ctx.beginPath(); ctx.ellipse(pos.x + 3, pos.y + 3.5, 8, 3, 0, 0, 7); ctx.fill(); }
  const lk = ship ? null : (modelOf(v) || {}).look;
  isoSprite(img, pos.x, pos.y + 2, w, h, dx, dy, lk);
  if (dk > 0.2) { if (!ship) R.lights.push([pos.x + ux * 9, pos.y + uy * 9, 6, 0.8, "#fff1c4"]); else R.lights.push([pos.x, pos.y - 6, 5, 0.8]); }
  if (v.broken) { ctx.fillStyle = "rgba(230,60,45,.95)"; ctx.beginPath(); ctx.arc(pos.x, pos.y - 20, 4, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(pos.x - 0.8, pos.y - 22.5, 1.6, 3); ctx.fillRect(pos.x - 0.8, pos.y - 18.6, 1.6, 1.2); puff(pos.x, pos.y - 12, "smoke", 0.3); }
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
function drawUnit(v, u, dk) {
  const img = spriteFor(u.id); if (!img) return;
  const k = (u.loco ? 17 : 15) / img.naturalWidth, w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.fillStyle = "rgba(10,20,10,.22)"; ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + 3.5, 7, 2.6, 0, 0, 7); ctx.fill();
  const lk = (V.getModel(u.id) || {}).look;
  isoSprite(img, u.x, u.y + 2, w, h, u.dx || u.dy ? u.dx : 1, u.dy || 0, lk);
  if (u.loco) {
    const [ux, uy] = screenDir(u.dx || u.dy ? u.dx : 1, u.dy || 0);
    if (v.state === "moving" && lk && lk.shape === "steam") puff(u.x + ux * 4, u.y - 14, "steam", 0.9);
    else if (v.state === "moving" && lk && lk.shape === "diesel") puff(u.x, u.y - 12, "smoke", 0.15);
    if (dk > 0.2) R.lights.push([u.x + ux * 9, u.y + uy * 9 - 2, 7, 0.9, "#fff1c4"]);
  }
  if (u.loco && v.broken) { ctx.fillStyle = "rgba(230,60,45,.95)"; ctx.beginPath(); ctx.arc(u.x, u.y - 16, 4, 0, 7); ctx.fill(); }
  else if (u.loco && v.red && view.z > 1) { ctx.fillStyle = "rgba(255,60,40,.9)"; ctx.fillRect(u.x - 2, u.y - 18, 4, 4); }
}
