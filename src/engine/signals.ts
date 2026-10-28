/**
 * signals.ts
 * Block signalling for tile-based railways.
 *
 * Idea: a signal sits on the EDGE between two adjacent track tiles.
 * Removing every signalled edge splits the track into "blocks".
 * A train may cross a signal only if the block ahead has no other train in it.
 */

export interface Pt { x: number; y: number }
export type SignalMode = "oneway" | "twoway";
export type SignalColour = "green" | "red";

const k = (x: number, y: number) => `${x},${y}`;
const kp = (p: Pt) => k(p.x, p.y);
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function parse(key: string): Pt {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

interface Signal {
  mode: SignalMode;
  /** For one-way signals: the only allowed travel direction is from -> to */
  from: string;
  to: string;
}

export type AdvanceResult =
  | { ok: true }
  | { ok: false; reason: "no-track" | "not-adjacent" | "wrong-way" | "red" };

export class RailNetwork {
  private tiles = new Set<string>();
  private signals = new Map<string, Signal>();
  private blockOf = new Map<string, number>();
  private occupancy = new Map<number, Set<string>>();
  private trainTiles = new Map<string, string[]>();
  private blocksDirty = true;

  // ---------------------------------------------------------------- track

  addTrack(x: number, y: number): void {
    this.tiles.add(k(x, y));
    this.blocksDirty = true;
  }

  removeTrack(x: number, y: number): void {
    const t = k(x, y);
    this.tiles.delete(t);
    for (const [edge, s] of this.signals) {
      if (s.from === t || s.to === t) this.signals.delete(edge);
    }
    this.blocksDirty = true;
  }

  hasTrack(x: number, y: number): boolean {
    return this.tiles.has(k(x, y));
  }

  // -------------------------------------------------------------- signals

  /** Place a signal between two adjacent track tiles. For one-way, trains may go a -> b only. */
  addSignal(a: Pt, b: Pt, mode: SignalMode = "twoway"): boolean {
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return false;
    if (!this.hasTrack(a.x, a.y) || !this.hasTrack(b.x, b.y)) return false;
    const ka = kp(a), kb = kp(b);
    this.signals.set(edgeKey(ka, kb), { mode, from: ka, to: kb });
    this.blocksDirty = true;
    return true;
  }

  removeSignal(a: Pt, b: Pt): void {
    this.signals.delete(edgeKey(kp(a), kp(b)));
    this.blocksDirty = true;
  }

  signalAt(a: Pt, b: Pt): Signal | undefined {
    return this.signals.get(edgeKey(kp(a), kp(b)));
  }

  /** For drawing: colour of the signal seen by a train travelling a -> b. */
  signalColour(a: Pt, b: Pt): SignalColour | "none" {
    const s = this.signalAt(a, b);
    if (!s) return "none";
    if (s.mode === "oneway" && !(s.from === kp(a) && s.to === kp(b))) return "red";
    this.rebuildBlocks();
    const block = this.blockOf.get(kp(b));
    const occ = block === undefined ? undefined : this.occupancy.get(block);
    return occ && occ.size > 0 ? "red" : "green";
  }

  // --------------------------------------------------------------- blocks

  private rebuildBlocks(): void {
    if (!this.blocksDirty) return;
    this.blockOf.clear();
    let id = 0;
    for (const start of this.tiles) {
      if (this.blockOf.has(start)) continue;
      this.blockOf.set(start, id);
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        const p = parse(cur);
        for (const d of DIRS) {
          const n = k(p.x + d.x, p.y + d.y);
          if (!this.tiles.has(n) || this.blockOf.has(n)) continue;
          if (this.signals.has(edgeKey(cur, n))) continue;
          this.blockOf.set(n, id);
          stack.push(n);
        }
      }
      id++;
    }
    this.blocksDirty = false;
    this.rebuildOccupancy();
  }

  private rebuildOccupancy(): void {
    this.occupancy.clear();
    for (const [train, tiles] of this.trainTiles) {
      for (const t of tiles) {
        const b = this.blockOf.get(t);
        if (b === undefined) continue;
        if (!this.occupancy.has(b)) this.occupancy.set(b, new Set());
        this.occupancy.get(b)!.add(train);
      }
    }
  }

  blockIdAt(x: number, y: number): number | undefined {
    this.rebuildBlocks();
    return this.blockOf.get(k(x, y));
  }

  // --------------------------------------------------------------- trains

  /**
   * Ask permission before moving a train from tile `from` to adjacent tile `to`.
   * If it returns ok:false the train should stop and try again next tick.
   */
  canAdvance(trainId: string, from: Pt, to: Pt): AdvanceResult {
    if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1) return { ok: false, reason: "not-adjacent" };
    if (!this.hasTrack(to.x, to.y) || !this.hasTrack(from.x, from.y)) return { ok: false, reason: "no-track" };
    this.rebuildBlocks();

    const s = this.signalAt(from, to);
    if (!s) return { ok: true }; // unsignalled: same block, TTD lets you crash here

    if (s.mode === "oneway" && !(s.from === kp(from) && s.to === kp(to))) {
      return { ok: false, reason: "wrong-way" };
    }

    const block = this.blockOf.get(kp(to));
    const occ = block === undefined ? undefined : this.occupancy.get(block);
    if (occ) {
      for (const other of occ) if (other !== trainId) return { ok: false, reason: "red" };
    }
    return { ok: true };
  }

  /** Call after every move with ALL tiles the train currently covers (head to tail). */
  setTrainTiles(trainId: string, tiles: Pt[]): void {
    this.rebuildBlocks();
    this.trainTiles.set(trainId, tiles.map(kp));
    this.rebuildOccupancy();
  }

  removeTrain(trainId: string): void {
    this.trainTiles.delete(trainId);
    this.rebuildOccupancy();
  }

  /** Trains sharing a tile. Only possible on unsignalled track. */
  collisions(): { tile: Pt; trains: string[] }[] {
    const byTile = new Map<string, string[]>();
    for (const [train, tiles] of this.trainTiles) {
      for (const t of new Set(tiles)) {
        if (!byTile.has(t)) byTile.set(t, []);
        byTile.get(t)!.push(train);
      }
    }
    const out: { tile: Pt; trains: string[] }[] = [];
    for (const [t, trains] of byTile) if (trains.length > 1) out.push({ tile: parse(t), trains });
    return out;
  }
}

/*
 * HOW TO USE
 *
 *   const rail = new RailNetwork();
 *   rail.addTrack(x, y);                       // when the player lays track
 *   rail.addSignal({x:5,y:3}, {x:6,y:3});      // when the player places a signal
 *
 *   // In the train movement code, each tick:
 *   const r = rail.canAdvance(train.id, train.tile, nextTile);
 *   if (!r.ok) { train.waiting = true; return; }
 *   moveTrain(...);
 *   rail.setTrainTiles(train.id, tilesCoveredByTrain);
 *
 *   // Every tick or so:
 *   for (const c of rail.collisions()) crash(c.trains);
 */
