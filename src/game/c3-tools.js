// ---------------------------------------------------------------- preferences
// Per-player settings kept in this browser only.
const PREFS_KEY = "tt-prefs";
const prefs = Object.assign({ sounds: true, volume: 0.4, music: false, musicVolume: 0.25, autosaveMin: 1, labels: true, grid: false, daynight: true, effects: true, theme: "system" }, (() => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (e) { return {}; }
})());
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked: settings last for this visit */ } }
function applyPrefs() {
  sound.setVolume(prefs.volume); sound.setMuted(!prefs.sounds);
  if (sound.setMusicVolume) sound.setMusicVolume(prefs.musicVolume);
  if (sound.setMusic) sound.setMusic(prefs.music);
  if (prefs.theme === "light" || prefs.theme === "dark") document.documentElement.dataset.theme = prefs.theme; else delete document.documentElement.dataset.theme;
}
const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function settingsWin() {
  openWin("settings", "Settings", body => {
    const pct = v => Math.round(v * 100);
    body.innerHTML =
      "<label class='set'><input type='checkbox' id='set-sounds'" + (prefs.sounds ? " checked" : "") + "> Sound effects</label>" +
      "<label class='set'>Effects volume <input type='range' id='set-volume' min='0' max='100' value='" + pct(prefs.volume) + "'></label>" +
      "<label class='set'><input type='checkbox' id='set-music'" + (prefs.music ? " checked" : "") + "> Music</label>" +
      "<label class='set'>Music volume <input type='range' id='set-musicVolume' min='0' max='100' value='" + pct(prefs.musicVolume) + "'></label>" +
      "<label class='set'>Autosave <select id='set-autosave'>" + [[0, "Off"], [1, "Every minute"], [2, "Every 2 minutes"], [5, "Every 5 minutes"]].map(([v, l]) => "<option value='" + v + "'" + (prefs.autosaveMin === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select></label>" +
      "<label class='set'><input type='checkbox' id='set-labels'" + (prefs.labels ? " checked" : "") + "> Town and industry names</label>" +
      "<label class='set'><input type='checkbox' id='set-grid'" + (prefs.grid ? " checked" : "") + "> Grid lines</label>" +
      "<label class='set'><input type='checkbox' id='set-daynight'" + (prefs.daynight ? " checked" : "") + "> Day and night</label>" +
      "<label class='set'><input type='checkbox' id='set-effects'" + (prefs.effects ? " checked" : "") + "> Smoke, waves and swaying trees</label>" +
      "<label class='set'>Look <select id='set-theme'>" + [["system", "Follow device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => "<option value='" + v + "'" + (prefs.theme === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select></label>";
    body.oninput = body.onchange = e => {
      const t = e.target, k = t.id.replace("set-", "");
      if (k === "volume" || k === "musicVolume") prefs[k] = +t.value / 100;
      else if (k === "autosave") prefs.autosaveMin = +t.value;
      else if (k === "theme") prefs.theme = t.value;
      else if (k in prefs) prefs[k] = t.checked;
      savePrefs(); applyPrefs();
      if (e.type === "change" && (k === "sounds" || k === "volume")) sound.play("click");
    };
  });
}

// ---------------------------------------------------------- income pop-ups
function floatText(x, y, text, color) { if (R) R.floats.push({ x, y, text, color: color || "#ffe26b", t: performance.now() }); }
function departSound(vh) {
  const now = performance.now(); if (now - (R.lastHorn || 0) < 1500) return;
  R.lastHorn = now; sound.play(isTrain(vh) && tractionOf(vh) === "steam" ? "whistle" : "horn");
}

// ------------------------------------------------------------------- undo
// Building actions the player can take back, newest last. Each refunds what it cost.
const UNDO_MAX = 25;
function pushUndo(a) { R.undo.push(a); if (R.undo.length > UNDO_MAX) R.undo.shift(); updateUndoBtn(); }
function vehicleOnTile(net, x, y) { if (net === R.rail) return R.res.has(key(x, y)) || S.vehicles.some(v => isTrain(v) && trainTiles(v).some(t => t.x === x && t.y === y)); return R.roads.vehiclesAt({ x, y }).length > 0; }
function refund(c) { if (c > 0) { S.company.cash += c; post("construction", c); } }
function undoLast() {
  const a = R.undo[R.undo.length - 1]; if (!a) return { ok: false, reason: "Nothing to undo." };
  const m = S.map;
  if (a.kind === "road" || a.kind === "track" || a.kind === "crossing") {
    const net = a.kind === "road" || a.net === "road" ? R.roads : R.rail;
    for (const t of a.tiles) {
      const i = key(t.x, t.y);
      if (R.stationAt.has(i) || R.depotAt.has(i)) return { ok: false, reason: "Remove the stop or depot on that stretch first." };
      if (vehicleOnTile(net, t.x, t.y)) return { ok: false, reason: "A vehicle is on that stretch. Try again in a moment." };
    }
    for (const t of a.tiles) { const i = key(t.x, t.y); net.removeRoad(t.x, t.y); if (net === R.rail) { delete S.signals[i]; delete S.elec[i]; } if (!R.roads.hasRoad(t.x, t.y) && !R.rail.hasRoad(t.x, t.y)) { m.occupied[i] = 0; delete S.spans[i]; } }
  } else if (a.kind === "elec") {
    for (const t of a.tiles) delete S.elec[key(t.x, t.y)];
  } else if (a.kind === "signal") {
    if (a.prev) S.signals[a.k] = a.prev; else delete S.signals[a.k];
  } else if (a.kind === "station") {
    const st = stationById(a.id); if (!st) { R.undo.pop(); updateUndoBtn(); return { ok: false, reason: "That stop is already gone." }; }
    const t = a.tile || { x: st.x, y: st.y };
    if (R.stationAt.get(key(t.x, t.y)) !== st) { R.undo.pop(); updateUndoBtn(); return { ok: false, reason: "That stop is already gone." }; }
    removeStationTile(st, t.x, t.y);
  } else if (a.kind === "depot") {
    const d = depotById(a.id); if (!d) { R.undo.pop(); updateUndoBtn(); return { ok: false, reason: "That depot is already gone." }; }
    S.depots = S.depots.filter(x => x !== d); R.depotAt.delete(key(d.x, d.y));
  } else if (a.kind === "terrain") {
    for (const c of a.changes) if (m.occupied[c.i]) return { ok: false, reason: "Something has been built on that land since." };
    for (const c of a.changes) { m.height[c.i] = c.h; m.water[c.i] = c.w; }
  }
  R.undo.pop(); refund(a.cost); updateUndoBtn(); sound.play("demolish");
  return { ok: true, kind: a.kind, cost: a.cost };
}
function updateUndoBtn() { const b = document.getElementById("bundo"); if (b) b.disabled = !R || !R.undo.length; }

// Terrain changes as a list of tiles that differ, so undo restores only those.
function terrainDiff(beforeH, beforeW) {
  const m = S.map, out = [];
  for (let i = 0; i < m.height.length; i++) if (m.height[i] !== beforeH[i] || m.water[i] !== beforeW[i]) out.push({ i, h: beforeH[i], w: beforeW[i] });
  return out;
}

// --------------------------------------------------- drag-to-build preview
// Road and track are planned while the finger is down and built when it lifts.
function planTiles(a, b) {
  const pts = [{ x: a.x, y: a.y }]; let x = a.x, y = a.y;
  while (x !== b.x) { x += Math.sign(b.x - x); pts.push({ x, y }); }
  while (y !== b.y) { y += Math.sign(b.y - y); pts.push({ x, y }); }
  return pts;
}
function startPlan(t) { if (!t) return; ui.plan = { tool: ui.tool, start: t, end: t }; refreshPlan(); }
function updatePlan(t) { if (!ui.plan || !t) return; if (t.x === ui.plan.end.x && t.y === ui.plan.end.y) return; ui.plan.end = t; refreshPlan(); }
function refreshPlan() {
  const p = ui.plan, track = p.tool === "track", wire = p.tool === "electrify", unit = cost(wire ? ELEC_COST : track ? TRACK_COST : ROAD_COST);
  let total = 0, fresh = 0, bad = 0, blocked = false;
  p.tiles = planTiles(p.start, p.end).map(q => {
    const why = wire ? canElectrify(q.x, q.y) : track ? canBuildTrackOn(q.x, q.y) : canBuildRoadOn(q.x, q.y);
    if (why === "exists") return { ...q, st: "have" };
    if (why || blocked) { blocked = true; bad++; return { ...q, st: "bad", why }; }
    const c = unit + (!wire && S.map.forest[key(q.x, q.y)] ? cost(CLEAR_TREE) : 0) + (!wire && (track ? R.roads : R.rail).hasRoad(q.x, q.y) ? cost(CROSSING_EXTRA) : 0); total += c; fresh++;
    return { ...q, st: "ok", c };
  });
  p.cost = total;
  const name = wire ? "Electrification" : track ? "Track" : "Road";
  $("#hint").textContent = fresh || bad ? name + ": " + fresh + " new tile" + (fresh === 1 ? "" : "s") + ", " + money(total) + (bad ? ". Stops before a blocked tile." : "") + (total > S.company.cash ? " Not enough money." : "") : name + ": already built here.";
}
function commitPlan() {
  const p = ui.plan; ui.plan = null; if (!p || !p.tiles) return;
  const built = []; let spent = 0;
  for (const q of p.tiles) {
    if (q.st === "bad") { if (q.why && q.why !== "exists") toast(q.why, true); break; }
    if (q.st !== "ok") continue;
    const r = p.tool === "electrify" ? electrifyTile(q.x, q.y) : p.tool === "track" ? buildTrackTile(q.x, q.y) : buildRoadTile(q.x, q.y);
    if (!r.ok) { toast(r.reason, true); break; }
    if (r.cost) { built.push({ x: q.x, y: q.y }); spent += r.cost; }
  }
  if (built.length) { pushUndo({ kind: p.tool === "electrify" ? "elec" : p.tool === "track" ? "track" : "road", tiles: built, cost: spent }); sound.play("build"); toast("Built " + built.length + " tile" + (built.length === 1 ? "" : "s") + " for " + money(spent) + "."); }
  setTool(ui.tool);
}

// ------------------------------------------------------------ save and load
function savesList() { try { return SV.listSaves().slice().sort((a, b) => b.savedAt - a.savedAt); } catch (e) { return []; } }
function saveLabel(name) { return (name || S.name).trim().slice(0, 40) + " · " + EV.MONTH_NAMES[S.date.month].slice(0, 3) + " " + S.date.year; }
function saveToSlot(slot, name) {
  syncPersist();
  try { const r = SV.saveGame(slot, S, saveLabel(name)); if (!r.ok) { toast(r.error || "Could not save.", true); return false; } } catch (e) { toast("Saving is blocked in this browser.", true); return false; }
  return true;
}
function startLoaded(st) {
  if (!st || !st.map || !st.company || !st.date) { toast("That is not a Transport & Co. save.", true); return false; }
  S = st; if (!S.railTiles) S.railTiles = []; initRuntime(); ui.paused = false; closeAllWins(); hideMenu(); afterStart(); return true;
}
function importSaveText(text) {
  let st = null;
  try { st = SV.deserialize(text).state; } catch (e) { toast("Could not read that file.", true); return false; }
  if (!startLoaded(st)) return false;
  toast("Save file loaded."); return true;
}
async function exportSave() {
  syncPersist();
  const label = saveLabel(), text = SV.serialize(S, label);
  const filename = "transport-co-" + S.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-" + S.date.year + ".json";
  let dl = null;
  try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
  if (dl) {
    try { await dl.save({ filename, data: text }); toast("Save file ready."); }
    catch (e) { if (!e || e.code !== "declined") toast(e && e.code === "rate_limited" ? "A save prompt is already open." : "Could not save the file here.", true); }
    return;
  }
  try { SV.exportToFile(S, filename, label); toast("Save file downloaded."); } catch (e) { toast("Saving a file is blocked here.", true); }
}
function pickSaveFile() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) f.text().then(importSaveText); };
  inp.click();
}
function savesWin() {
  let armed = null;
  openWin("saves", "Save and load", body => {
    function render() {
      const live = S && !ui.menuOpen, list = savesList(), when = ms => new Date(ms).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
      let h = live ? "<div class='row'><input id='savename' maxlength='40' value='" + esc(S.name) + "' aria-label='Save name'><button class='gb sm' data-a='new'>Save new</button></div>" : "";
      h += list.length ? "<div class='saves'>" + list.map(sv => "<div class='sv'><div class='svn'><b>" + esc(sv.slot === AUTO ? "Autosave" : sv.label.split(" · ")[0]) + "</b><span class='dim'>" + esc(sv.label.split(" · ")[1] || "") + " · saved " + when(sv.savedAt) + "</span></div><div class='row'>" +
        "<button data-a='load' data-s='" + esc(sv.slot) + "'>Load</button>" + (live && sv.slot !== AUTO ? "<button data-a='over' data-s='" + esc(sv.slot) + "'>Overwrite</button>" : "") +
        "<button data-a='del' data-s='" + esc(sv.slot) + "' class='" + (armed === sv.slot ? "armed" : "") + "'>" + (armed === sv.slot ? "Tap again to delete" : "Delete") + "</button></div></div>").join("") + "</div>" : "<p class='dim'>No saved games yet.</p>";
      h += "<h4>Files</h4><div class='row'>" + (live ? "<button class='gb sm' data-a='export'>Export to file</button>" : "") + "<button class='gb sm' data-a='import'>Import a save file</button></div><div class='cloudbox'></div>";
      body.innerHTML = h;
      cloudSection(body.querySelector(".cloudbox"));
    }
    body.onclick = e => {
      const b = e.target.closest("button"); if (!b || !b.dataset.a) return; const a = b.dataset.a, slot = b.dataset.s;
      if (a !== "del") armed = null;
      if (a === "new") { const n = (body.querySelector("#savename").value || S.name).trim(); if (saveToSlot("s-" + Date.now(), n)) toast("Saved as " + n + "."); }
      if (a === "over") { const old = savesList().find(x => x.slot === slot); if (saveToSlot(slot, old ? old.label.split(" · ")[0] : S.name)) toast("Saved."); }
      if (a === "load") { let st = null; try { st = SV.loadGame(slot); } catch (err) { st = null; } if (!st) return toast("That save could not be read.", true); if (startLoaded(st)) toast("Game loaded."); return; }
      if (a === "del") { if (armed === slot) { try { SV.deleteSave(slot); } catch (err) { /* ignore */ } armed = null; toast("Deleted."); } else armed = slot; }
      if (a === "export") { exportSave(); return; }
      if (a === "import") { pickSaveFile(); return; }
      render();
    };
    render();
  });
}
