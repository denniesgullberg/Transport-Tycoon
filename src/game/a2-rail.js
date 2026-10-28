// ------------------------------------------------------------------ railways
// Trains are several tiles long. Before moving, a train reserves the track ahead up to the
// next signal that faces it (or up to its station), so two trains never share a tile.
// Without signals a whole line between two stations is one block: one train at a time.
const SIGNAL_COST = 400, ELEC_COST = 90, CROSSING_EXTRA = 250;
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tk = (t) => t.y * S.map.w + t.x;
const kt = (k) => ({ x: k % S.map.w, y: (k / S.map.w) | 0 });
const sameT = (a, b) => a && b && a.x === b.x && a.y === b.y;

function trainLen(m) { return m && m.parts ? clamp(Math.ceil((m.parts.n + 1) / 2), 1, 8) : 1; }
function railDepotAt(k) { const d = R.depotAt.get(k); return d && d.kind === "rail" ? d : null; }
function needsElec(vh) { return tractionOf(vh) === "electric"; }
function isElec(x, y) { return !!(S.elec && S.elec[y * S.map.w + x]); }

// Tiles a train covers right now: the tile it is entering, then its body.
function trainTiles(vh) {
  const L = trainLen(modelOf(vh)), out = [];
  if (vh.state === "moving") out.push(vh.to);
  for (const t of (vh.trail || [vh.tile]).slice(0, L)) if (!out.some(o => sameT(o, t))) out.push(t);
  return out;
}

// ---- reservations: tile key -> train id. Depot tiles are shared (trains wait inside).
function claim(t, id) { const k = tk(t); if (!railDepotAt(k)) R.res.set(k, id); }
function release(t, id) { const k = tk(t); if (R.res.get(k) === id) R.res.delete(k); }
function releaseAll(id) { for (const [k, v] of R.res) if (v === id) R.res.delete(k); }
function railFree(t, id) {
  const k = tk(t); if (railDepotAt(k)) return true;
  const o = R.res.get(k); if (o && o !== id) return false;
  if (R.roads.hasRoad(t.x, t.y) && R.roads.vehiclesAt(t).length) return false;   // car on the level crossing
  return true;
}
function rebuildRailRes() {
  R.res = new Map();
  for (const v of S.vehicles) {
    if (!isTrain(v)) continue;
    if (!v.trail) v.trail = [{ x: v.tile.x, y: v.tile.y }];
    if (!v.res) v.res = [];
    for (const t of trainTiles(v)) claim(t, v.id);
    for (const t of v.res) claim(t, v.id);
  }
}

// ---- signals. One-way signals only let trains through in their direction.
function signalAt(k) { return S.signals && S.signals[k]; }
function stopsHere(t, dx, dy) { const s = signalAt(tk(t)); return !!s && (s.two || (s.dx === dx && s.dy === dy)); }
function blocksEntry(k, dx, dy) { const s = signalAt(k); return !!s && !s.two && !(s.dx === dx && s.dy === dy); }
function trackAxis(x, y) {
  const has = (a, b) => inB(a, b) && R.rail.hasRoad(a, b);
  const xs = has(x + 1, y) || has(x - 1, y), ys = has(x, y + 1) || has(x, y - 1);
  if (xs && ys) return null;               // a junction
  return ys ? "y" : "x";
}
function cycleSignal(x, y) {
  const k = key(x, y);
  if (!R.rail.hasRoad(x, y)) return { ok: false, reason: "Signals go on railway track." };
  if (R.stationAt.has(k) || R.depotAt.has(k)) return { ok: false, reason: "Put signals on plain track, not in stations or depots." };
  const ax = trackAxis(x, y); if (!ax) return { ok: false, reason: "Put signals on straight track, not on a junction." };
  const [d1, d2] = ax === "x" ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  const cur = S.signals[k];
  let next;
  if (!cur) next = { dx: d1[0], dy: d1[1], two: false };
  else if (!cur.two && cur.dx === d1[0] && cur.dy === d1[1]) next = { dx: d2[0], dy: d2[1], two: false };
  else if (!cur.two) next = { dx: d1[0], dy: d1[1], two: true };
  else next = null;
  if (next && !cur) { const c = cost(SIGNAL_COST); if (S.company.cash < c) return { ok: false, reason: "Not enough money." }; spend("construction", c); }
  if (next) S.signals[k] = next; else delete S.signals[k];
  return { ok: true, signal: next, cost: next && !cur ? cost(SIGNAL_COST) : 0 };
}
function signalText(sg) { if (!sg) return "Signal removed."; return sg.two ? "Two-way signal: trains stop here in both directions." : "One-way signal: trains pass only one way and stop here for the block ahead."; }

// ---- pathfinding over track. Returns the tiles after `start` up to the first goal tile.
function railPath(start, goals, opt) {
  const W = S.map.w, s0 = tk(start);
  if (goals.has(s0)) return [];
  const gl = [...goals].map(kt);
  const h = (x, y) => { let b = 1e9; for (const g of gl) b = Math.min(b, Math.abs(g.x - x) + Math.abs(g.y - y)); return b; };
  const g = new Map([[s0, 0]]), prev = new Map(), closed = new Set();
  const heap = [[h(start.x, start.y), s0]];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let n = 0;
  while (heap.length && n++ < 60000) {
    const [, k] = pop(); if (closed.has(k)) continue; closed.add(k);
    if (goals.has(k)) { const out = []; let c = k; while (c !== s0) { out.push(kt(c)); c = prev.get(c); } return out.reverse(); }
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy; if (!inB(nx, ny) || !R.rail.hasRoad(nx, ny)) continue;
      const nk = ny * W + nx; if (closed.has(nk)) continue;
      if (opt.elec && !isElec(nx, ny)) continue;
      if (opt.owner && railOwnerOf(nk) !== opt.owner) continue;
      if (blocksEntry(nk, dx, dy)) continue;
      if (opt.avoid && opt.avoid(nk)) continue;
      const ng = g.get(k) + 1 + (opt.costOf ? opt.costOf(nk) : 0);
      if (ng < (g.has(nk) ? g.get(nk) : 1e18)) { g.set(nk, ng); prev.set(nk, k); push(ng + h(nx, ny), nk); }
    }
  }
  return null;
}

function goalTiles(dest) {
  if (dest.kind === "depot") return new Set([dest.y * S.map.w + dest.x]);
  const st = stationById(dest.id); if (!st) return new Set();
  return new Set((st.tiles || [st]).filter(t => R.rail.hasRoad(t.x, t.y)).map(tk));
}

// Find a route and reserve the first block of it. Reverses at a dead end or terminus.
function reserveAhead(vh, goals) {
  const elec = needsElec(vh);
  const busyCost = (k) => { const o = R.res.get(k); return o && o !== vh.id ? 40 : 0; };
  const tryFrom = () => {
    const body = new Set(trainTiles(vh).map(tk)); body.delete(tk(vh.tile));
    return railPath(vh.tile, goals, { elec, owner: vh.owner, avoid: (k) => body.has(k), costOf: busyCost });
  };
  let path = tryFrom();
  if (!path) {
    // turn around: the tail becomes the head
    const L = trainLen(modelOf(vh)), body = (vh.trail || [vh.tile]).slice(0, L);
    if (body.length > 1 || vh.dir) {
      const old = { trail: vh.trail, tile: vh.tile, dir: vh.dir };
      vh.trail = body.slice().reverse(); vh.tile = { ...vh.trail[0] };
      vh.dir = vh.trail[1] ? { dx: vh.trail[0].x - vh.trail[1].x, dy: vh.trail[0].y - vh.trail[1].y } : { dx: -vh.dir.dx, dy: -vh.dir.dy };
      path = tryFrom();
      if (!path) { vh.trail = old.trail; vh.tile = old.tile; vh.dir = old.dir; }
    }
  }
  if (!path) { vh.noRoute = true; return false; }
  vh.noRoute = false;
  if (!path.length) return true;
  const block = []; let prev = vh.tile;
  for (const t of path) {
    block.push(t);
    if (stopsHere(t, t.x - prev.x, t.y - prev.y)) break;
    prev = t;
  }
  if (!block.every(t => railFree(t, vh.id))) return false;     // red signal: wait
  for (const t of block) claim(t, vh.id);
  vh.res = block;
  return true;
}

function trainStep(vh) {
  const dest = destTile(vh);
  if (!dest) { vh.state = "idle"; return; }
  if (!vh.trail) vh.trail = [{ ...vh.tile }];
  if (!vh.res) vh.res = [];
  const goals = goalTiles(dest);
  if (!vh.res.length && goals.has(tk(vh.tile))) {
    // pull up to the far end of the platform, then stop
    const d = vh.dir || { dx: 0, dy: 0 }, n = { x: vh.tile.x + d.dx, y: vh.tile.y + d.dy };
    if ((d.dx || d.dy) && inB(n.x, n.y) && goals.has(tk(n)) && R.rail.hasRoad(n.x, n.y) && railFree(n, vh.id) && !(needsElec(vh) && !isElec(n.x, n.y))) { claim(n, vh.id); vh.res = [n]; }
    else if (OR.arrive(vh.orders, { kind: dest.kind, id: dest.id })) { dock(vh, dest); return; }
  }
  if (!vh.res.length && !reserveAhead(vh, goals)) {
    vh.state = "idle"; vh.wait++; vh.red = !vh.noRoute;
    if (vh.red) {
      if (vh.redSince == null) vh.redSince = S.totalDays;
      if (vh.owner === "player" && !vh.stuckWarned && S.totalDays - vh.redSince > 30) {
        vh.stuckWarned = true;
        EV.addNews(S.news, S.date, "bad", "Train #" + vh.id.slice(1) + " has waited a month for a free line. Add a passing loop with signals or a second platform.", { x: vh.tile.x, y: vh.tile.y });
      }
    }
    if (vh.noRoute && vh.wait > 240) { vh.wait = 0; OR.skipOrder(vh.orders); }
    return;
  }
  if (!vh.res.length) { vh.state = "idle"; return; }
  const next = vh.res.shift();
  vh.from = { x: vh.tile.x, y: vh.tile.y }; vh.to = next; vh.p = 0; vh.state = "moving"; vh.wait = 0; vh.red = false; vh.redSince = null; vh.stuckWarned = false;
  vh.dir = { dx: next.x - vh.tile.x, dy: next.y - vh.tile.y };
}

// Called when the head reaches vh.to.
function trainArrive(vh) {
  const L = trainLen(modelOf(vh));
  vh.trail.unshift({ x: vh.tile.x, y: vh.tile.y });
  while (vh.trail.length > L) {
    const old = vh.trail.pop();
    if (!vh.trail.some(t => sameT(t, old)) && !vh.res.some(t => sameT(t, old))) release(old, vh.id);
  }
}

// ---- level crossings and electrification
function crossingAt(x, y) { return R.rail.hasRoad(x, y) && R.roads.hasRoad(x, y); }
function canElectrify(x, y) {
  if (!inB(x, y) || !R.rail.hasRoad(x, y)) return "Electrify existing track only.";
  if (isElec(x, y)) return "exists";
  return "";
}
function electrifyTile(x, y) {
  const why = canElectrify(x, y);
  if (why === "exists") return { ok: true, cost: 0 };
  if (why) return { ok: false, reason: why };
  const c = cost(ELEC_COST); if (S.company.cash < c) return { ok: false, reason: "Not enough money." };
  spend("construction", c); S.elec[key(x, y)] = 1; return { ok: true, cost: c };
}

// ---- multi-tile stations: a station tile next to one of your stations of the same kind joins it
function stationNeighbour(x, y, kind, owner) {
  for (const [dx, dy] of DIR4) { const s = R.stationAt.get(key(x + dx, y + dy)); if (s && s.kind === kind && s.owner === owner) return s; }
  return null;
}
function stationTiles(st) { return st.tiles && st.tiles.length ? st.tiles : [{ x: st.x, y: st.y }]; }
function platformTilesUnder(vh, st) { const ks = new Set(stationTiles(st).map(tk)); return trainTiles(vh).filter(t => ks.has(tk(t))).length; }
