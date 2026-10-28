/**
 * savegame.ts
 * Save and load the whole game: slots, autosave, and export/import as a file.
 * Handles typed arrays (the map), Maps and Sets, which plain JSON.stringify can't.
 * No imports. Works in the browser; falls back to memory if storage is blocked.
 */

const SAVE_VERSION = 1;
const PREFIX = "tycoon-save:";
const INDEX_KEY = "tycoon-save-index";

export interface SaveMeta {
  slot: string;
  label: string;
  savedAt: number;   // ms since epoch
  version: number;
}

// ------------------------------------------------------------ storage layer

const memory = new Map<string, string>();

function store(): { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void } {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      const probe = "__tycoon_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return { get: k => ls.getItem(k), set: (k, v) => ls.setItem(k, v), del: k => ls.removeItem(k) };
    }
  } catch { /* blocked or full */ }
  return { get: k => memory.get(k) ?? null, set: (k, v) => { memory.set(k, v); }, del: k => { memory.delete(k); } };
}

// -------------------------------------------------------------- encoding

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
  }
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const TYPED = ["Uint8Array", "Int8Array", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array"];

function replacer(_key: string, value: unknown): unknown {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const name = (value as { constructor: { name: string } }).constructor.name;
    if (TYPED.includes(name)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { __ta: name, d: bytesToB64(bytes) };
    }
  }
  if (value instanceof Set) return { __set: Array.from(value) };
  if (value instanceof Map) return { __map: Array.from(value.entries()) };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.__ta === "string" && typeof v.d === "string") {
      const bytes = b64ToBytes(v.d);
      const Ctor = (globalThis as unknown as Record<string, new (b: ArrayBuffer) => unknown>)[v.__ta];
      return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }
    if (Array.isArray(v.__set)) return new Set(v.__set);
    if (Array.isArray(v.__map)) return new Map(v.__map as [unknown, unknown][]);
  }
  return value;
}

export function serialize(state: unknown, label = ""): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), label, state }, replacer);
}

export function deserialize<T>(text: string): { state: T; meta: Omit<SaveMeta, "slot"> } {
  const raw = JSON.parse(text, reviver) as { version: number; savedAt: number; label: string; state: T };
  if (typeof raw.version !== "number" || raw.state === undefined) throw new Error("Not a valid save file");
  if (raw.version > SAVE_VERSION) throw new Error("This save is from a newer version of the game");
  return { state: migrate(raw.state, raw.version) as T, meta: { label: raw.label, savedAt: raw.savedAt, version: raw.version } };
}

/** Add upgrade steps here when the shape of your game state changes. */
function migrate(state: unknown, from: number): unknown {
  let s = state;
  // if (from < 2) s = upgradeV1toV2(s);
  void from;
  return s;
}

// ----------------------------------------------------------------- slots

function readIndex(): SaveMeta[] {
  try {
    const t = store().get(INDEX_KEY);
    return t ? (JSON.parse(t) as SaveMeta[]) : [];
  } catch { return []; }
}

function writeIndex(list: SaveMeta[]): void {
  store().set(INDEX_KEY, JSON.stringify(list));
}

export function saveGame(slot: string, state: unknown, label = ""): { ok: boolean; error?: string } {
  try {
    const text = serialize(state, label);
    store().set(PREFIX + slot, text);
    const list = readIndex().filter(m => m.slot !== slot);
    list.push({ slot, label, savedAt: Date.now(), version: SAVE_VERSION });
    writeIndex(list);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const full = /quota|storage/i.test(msg);
    return { ok: false, error: full ? "Browser storage is full. Delete an old save or export to a file." : msg };
  }
}

export function loadGame<T>(slot: string): T | null {
  try {
    const text = store().get(PREFIX + slot);
    return text ? deserialize<T>(text).state : null;
  } catch { return null; }
}

export function listSaves(): SaveMeta[] {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteSave(slot: string): void {
  store().del(PREFIX + slot);
  writeIndex(readIndex().filter(m => m.slot !== slot));
}

// -------------------------------------------------------------- autosave

/**
 * Saves into slot "auto" every few minutes of real time and when the tab is hidden.
 * Returns a stop function. Call it once after the game starts.
 */
export function startAutosave(getState: () => unknown, getLabel: () => string, everyMs = 60000): () => void {
  const run = () => { saveGame("auto", getState(), getLabel()); };
  const timer = setInterval(run, everyMs);
  const onHide = () => { if (document.visibilityState === "hidden") run(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHide);
  return () => {
    clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHide);
  };
}

// ------------------------------------------------------- file export/import

export function exportToFile(state: unknown, filename = "transport-co-save.json", label = ""): void {
  const blob = new Blob([serialize(state, label)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importFromFile<T>(file: File): Promise<T> {
  return deserialize<T>(await file.text()).state;
}

/*
 * HOW TO USE
 *
 *   // Gather everything that makes up your game in one object:
 *   const getState = () => ({ map, world, vehicles, stations, orders, ledger, objectives, news });
 *
 *   saveGame("slot1", getState(), "Oakwood, Mar 1953");
 *   const s = loadGame<ReturnType<typeof getState>>("slot1");
 *   if (s) restoreGame(s);
 *
 *   const stop = startAutosave(getState, () => `Autosave ${dateText}`);   // once at startup
 *
 *   // On startup, offer "Continue" if listSaves() has an entry.
 *
 * Keep classes (like RailNetwork or RoadNetwork) OUT of the saved state. Save their tile lists
 * and rebuild the networks after loading by calling addTrack / addRoad again.
 */
