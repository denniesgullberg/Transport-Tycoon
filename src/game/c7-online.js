// ------------------------------------------------------------------ online
// Cloud saves (kept in your Claude account, private to you) and online races (everyone
// plays the same map at the same time and sees a live league table). Both only work when
// the game is opened in Claude; on its own the page plays exactly as before.
const CLOUD = { db: null, uid: null, ready: false };
const ONLINE = { room: null, race: null, peers: [], unsub: null, last: 0, started: false };
let CHUNK = 180000;   // characters per stored piece; each piece stays well under the 256 KiB document limit

async function initOnline() {
  if (!window.claude || !window.claude.use) return;
  try {
    const [db, user, room] = await Promise.all([window.claude.use("db"), window.claude.use("user"), window.claude.use("room")]);
    if (db && user) { const uid = await user.id(); if (uid) { CLOUD.db = db; CLOUD.uid = uid; CLOUD.ready = true; } }
    if (room) ONLINE.room = room;
  } catch (e) { /* the game works without these */ }
}

// ---- cloud saves: one small document per save plus its pieces underneath
function cloudCol(db, uid) { return db.collection("data/users/" + uid); }
async function cloudSave(name, db, uid) {
  db = db || CLOUD.db; uid = uid || CLOUD.uid; if (!db || !uid) throw new Error("Cloud saves are not available here.");
  syncPersist();
  const label = saveLabel(name), text = SV.serialize(S, label), id = "save-" + Date.now(), n = Math.ceil(text.length / CHUNK);
  const meta = cloudCol(db, uid).doc(id);
  for (let i = 0; i < n; i++) await meta.collection("chunks").doc(String(i)).set({ t: text.slice(i * CHUNK, (i + 1) * CHUNK) });
  await meta.set({ name: (name || S.name).slice(0, 40), label, savedAt: Date.now(), chunks: n, size: text.length });
  return id;
}
async function cloudList(db, uid) {
  db = db || CLOUD.db; uid = uid || CLOUD.uid; if (!db || !uid) return [];
  const q = await cloudCol(db, uid).get();
  return q.docs.filter(d => d.exists && /^save-/.test(d.id)).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.savedAt - a.savedAt);
}
async function cloudLoadText(id, db, uid) {
  db = db || CLOUD.db; uid = uid || CLOUD.uid;
  const meta = cloudCol(db, uid).doc(id), m = await meta.get(); if (!m.exists) throw new Error("That save is gone.");
  let text = ""; const n = m.data().chunks;
  for (let i = 0; i < n; i++) { const c = await meta.collection("chunks").doc(String(i)).get(); if (!c.exists) throw new Error("Part of that save is missing."); text += c.data().t; }
  return text;
}
async function cloudDelete(id, db, uid) {
  db = db || CLOUD.db; uid = uid || CLOUD.uid;
  const meta = cloudCol(db, uid).doc(id), m = await meta.get(); const n = m.exists ? m.data().chunks : 0;
  for (let i = 0; i < n; i++) await meta.collection("chunks").doc(String(i)).delete();
  await meta.delete();
}
function cloudSection(box) {
  if (!CLOUD.ready) { box.innerHTML = "<h4>Cloud saves</h4><p class='dim small'>Open the game in Claude while signed in to keep saves in your account and load them on any device.</p>"; return; }
  let armed = null;
  const render = async () => {
    box.innerHTML = "<h4>Cloud saves</h4><p class='dim small'>Loading…</p>";
    let list = [];
    try { list = await cloudList(); } catch (e) { box.innerHTML = "<h4>Cloud saves</h4><p class='warn'>Could not reach your cloud saves.</p>"; return; }
    const live = S && !ui.menuOpen;
    box.innerHTML = "<h4>Cloud saves</h4>" + (live ? "<button class='gb sm' data-c='save'>Save to cloud</button>" : "") +
      (list.length ? "<div class='saves'>" + list.map(s => "<div class='sv'><div class='svn'><b>" + esc(s.name) + "</b><span class='dim'>" + esc((s.label || "").split(" · ")[1] || "") + " · saved " + new Date(s.savedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) + "</span></div><div class='row'><button data-c='load' data-id='" + esc(s.id) + "'>Load</button><button data-c='del' data-id='" + esc(s.id) + "' class='" + (armed === s.id ? "armed" : "") + "'>" + (armed === s.id ? "Tap again to delete" : "Delete") + "</button></div></div>").join("") + "</div>" : "<p class='dim small'>No cloud saves yet.</p>");
  };
  box.onclick = async (e) => {
    const b = e.target.closest("button[data-c]"); if (!b) return; const a = b.dataset.c, id = b.dataset.id;
    b.disabled = true;
    try {
      if (a === "save") { await cloudSave(S.name); toast("Saved to the cloud."); armed = null; }
      if (a === "load") { const text = await cloudLoadText(id); if (importSaveText(text)) toast("Cloud save loaded."); return; }
      if (a === "del") { if (armed === id) { await cloudDelete(id); armed = null; toast("Deleted."); } else armed = id; }
    } catch (err) { toast((err && err.code === "quota_exceeded") ? "Cloud storage is full. Delete an old save first." : (err && err.message) || "Cloud save failed.", true); }
    render();
  };
  render();
}

// ---- online races
// The host's presence carries the settings; when the host starts, every player starts the
// same map. Each player's presence carries their company's numbers for the league table.
function randomCode() { const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
async function joinRace(code, name, host, cfg, room) {
  room = room || ONLINE.room; if (!room) return { ok: false, reason: "Online races work when the game is opened in Claude and shared with the other players." };
  code = String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12); if (code.length < 3) return { ok: false, reason: "Use a race code of at least 3 letters." };
  let r; try { r = await room.join("race-" + code); } catch (e) { return { ok: false, reason: e && e.code === "not_permitted" ? "Online races are not available for you here." : "Could not join that race. Try again." }; }
  if (ONLINE.race && ONLINE.race !== r) { try { ONLINE.race.leave(); } catch (e) { /* ignore */ } }
  ONLINE.race = r; ONLINE.code = code; ONLINE.host = !!host; ONLINE.name = (name || "Player").slice(0, 30); ONLINE.started = false;
  await r.presence({ name: ONLINE.name, role: host ? "host" : "player", state: "lobby", cfg: host ? cfg : null });
  if (ONLINE.unsub) ONLINE.unsub();
  ONLINE.unsub = r.onPeers(ch => { ONLINE.peers = ch.peers; raceWatch(); if (openWins.race && openWins.race.refresh) openWins.race.refresh(); });
  ONLINE.peers = r.peers();
  return { ok: true, code };
}
function raceHost() { return ONLINE.peers.find(p => p.presence && p.presence.role === "host"); }
// Players follow the host: when the host's race has started, start the same map.
function raceWatch() {
  if (ONLINE.host || ONLINE.started) return;
  const h = raceHost(); if (!h || h.presence.state !== "started" || !h.presence.cfg) return;
  ONLINE.started = true; startRaceGame(h.presence.cfg);
  toast("The race has started!");
}
async function startRace() {
  if (!ONLINE.race || !ONLINE.host) return { ok: false, reason: "Only the host starts the race." };
  const me = ONLINE.peers.find(p => p.sameTab), cfg = me && me.presence.cfg;
  const c = cfg || raceCfg();
  ONLINE.started = true;
  await ONLINE.race.presence({ state: "started", cfg: c, startedAt: Date.now() });
  startRaceGame(c);
  return { ok: true };
}
function raceCfg() {
  return { climate: menuState.climate, difficulty: menuState.difficulty, mapSize: menuState.size, towns: menuState.towns, rivals: menuState.rivals, startYear: menuState.year, seed: menuState.seed || String(mapgen.randomSeed()), retireYears: 20, water: ({ d: 0.15, n: null, w: 0.85 })[menuState.water], rivers: menuState.rivers, names: menuState.names === "auto" ? null : menuState.names };
}
function startRaceGame(cfg) {
  startGame({ ...cfg, retireYears: cfg.retireYears || 20 });
  S.name = ONLINE.name || S.name; S.race = { code: ONLINE.code };
  $("#brace").hidden = false;
  raceWindow();
}
// Send my numbers a few times a minute.
function racePulse(now) {
  if (!ONLINE.race || !S || !S.race || now - ONLINE.last < 3000) return;
  ONLINE.last = now;
  let rating = 0; try { rating = finalRating().total; } catch (e) { rating = 0; }
  ONLINE.race.presence({ name: S.name, state: S.ended ? "done" : "started", value: companyValue(), cash: Math.round(S.company.cash), rating, year: S.date.year, month: S.date.month, vehicles: playerVehicles().length }).catch(() => {});
}
function raceTable() {
  const rows = ONLINE.peers.filter(p => p.kind !== "agent" && p.presence && p.presence.name).map(p => ({ me: p.sameTab, name: String(p.presence.name), host: p.presence.role === "host", state: p.presence.state, value: +p.presence.value || 0, rating: +p.presence.rating || 0, year: p.presence.year, month: p.presence.month, vehicles: p.presence.vehicles || 0 }));
  return rows.sort((a, b) => b.value - a.value);
}
function raceWindow() {
  openWin("race", "Race " + (ONLINE.code || ""), (body, o) => {
    o.refresh = () => {
      const rows = raceTable(), end = S && S.retireYear;
      let h = "<p class='dim small'>Everyone plays the same map. Highest company value when the race ends" + (end ? " in " + end : "") + " wins. Share the code <b>" + esc(ONLINE.code || "") + "</b> so others can join.</p>";
      h += rows.length ? "<table class='tb'><tr><th>#</th><th>Company</th><th>Value</th><th>Date</th></tr>" + rows.map((r, i) => "<tr" + (r.me ? " class='sum'" : "") + "><td>" + (i + 1) + "</td><td>" + esc(r.name) + (r.me ? " (you)" : "") + (r.host ? " <span class='dim'>host</span>" : "") + "</td><td>" + money(r.value) + "</td><td>" + (r.year ? EV.MONTH_NAMES[r.month || 0].slice(0, 3) + " " + r.year : r.state === "lobby" ? "waiting" : "") + (r.state === "done" ? " ✓" : "") + "</td></tr>").join("") + "</table>" : "<p class='dim'>Nobody here yet.</p>";
      if (ONLINE.host && !ONLINE.started) h += "<button class='gb wide' data-r='start'>Start the race for everyone</button>";
      body.innerHTML = h;
    };
    body.onclick = async e => { if (e.target.dataset.r === "start") { const r = await startRace(); if (!r.ok) toast(r.reason, true); } };
    o.refresh();
  }, { live: 2000 });
}
function onlineView() {
  if (!ONLINE.room) return "<p class='dim'>Online races work when this game is opened in Claude. Share it from the Share menu, then everyone opens it, joins the same race code and plays the same map.</p><p class='dim'>Cloud saves are under Saved games.</p>";
  return "<label>Your company name</label><input id='on-name' maxlength='30' value='" + esc(ONLINE.name || "Oakwood Transport") + "' aria-label='Your company name'>" +
    "<label>Race code</label><div class='row'><input id='on-code' maxlength='12' value='" + esc(ONLINE.code || randomCode()) + "' aria-label='Race code'><button class='gb sm' data-act='on-new'>New code</button></div>" +
    "<p class='dim small'>The host's choices on the New game tab set the map. Races last 20 game years.</p>" +
    "<div class='row'><button class='gb' data-act='on-host'>Host this race</button><button class='gb' data-act='on-join'>Join this race</button></div>";
}
async function onlineAction(a) {
  const name = ($("#on-name") || {}).value || "Player", code = ($("#on-code") || {}).value || "";
  if (a === "on-new") { const c = $("#on-code"); if (c) c.value = randomCode(); return; }
  const host = a === "on-host";
  const r = await joinRace(code, name, host, host ? raceCfg() : null);
  if (!r.ok) return toast(r.reason, true);
  hideMenu(); raceWindow(); $("#brace").hidden = false;
  toast(host ? "Race " + r.code + " is open. Tap Start when everyone is in." : "Joined race " + r.code + ". Waiting for the host to start.");
}
