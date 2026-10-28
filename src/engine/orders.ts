/**
 * orders.ts
 * Vehicle orders like Transport Tycoon: a list of stops, with load/unload settings,
 * "full load" waiting, and automatic visits to a depot for servicing.
 *
 * Pure logic with no imports. The game still moves the vehicle and moves the cargo;
 * this file decides WHERE it goes next and WHEN it leaves a stop.
 */

export type LoadMode = "auto" | "full" | "none";
export type UnloadMode = "auto" | "unload" | "none";

export interface StopOrder { kind: "stop"; stationId: string; load: LoadMode; unload: UnloadMode; temp?: boolean }
export interface DepotOrder { kind: "depot"; depotId?: string; temp?: boolean }
export type Order = StopOrder | DepotOrder;

export type Phase = "travelling" | "docked" | "servicing";

export interface VehicleOrders {
  vehicleId: string;
  orders: Order[];
  current: number;              // index of the order the vehicle is heading for (or docked at)
  phase: Phase;
  dwellDays: number;            // days spent at the current stop
  autoService: boolean;         // visit a depot when the vehicle needs servicing
  maxFullLoadWaitDays: number;  // don't wait forever for a full load
}

// ----------------------------------------------------------------- creating

/** Simple A -> B -> A route. Pass 2 or more station ids. */
export function newOrders(vehicleId: string, stationIds: string[]): VehicleOrders {
  return {
    vehicleId,
    orders: stationIds.map(id => ({ kind: "stop", stationId: id, load: "auto", unload: "auto" } as StopOrder)),
    current: 0,
    phase: "travelling",
    dwellDays: 0,
    autoService: true,
    maxFullLoadWaitDays: 30,
  };
}

/** Copy the orders to another vehicle (like TTD "clone vehicle"). */
export function cloneOrders(src: VehicleOrders, newVehicleId: string): VehicleOrders {
  return {
    ...src,
    vehicleId: newVehicleId,
    orders: src.orders.filter(o => !o.temp).map(o => ({ ...o })),
    current: 0,
    phase: "travelling",
    dwellDays: 0,
  };
}

// ---------------------------------------------------------------- reading

export function currentOrder(v: VehicleOrders): Order | undefined {
  return v.orders[v.current];
}

export interface Destination { kind: "stop" | "depot"; id?: string }

/** Where the vehicle should be driving to right now, or null if it has no orders. */
export function destination(v: VehicleOrders): Destination | null {
  const o = currentOrder(v);
  if (!o) return null;
  return o.kind === "stop" ? { kind: "stop", id: o.stationId } : { kind: "depot", id: o.depotId };
}

// ----------------------------------------------------------------- driving

/**
 * Call when the vehicle reaches a station or depot.
 * Returns true if this was its destination (so it should dock), false if it is only passing.
 */
export function arrive(v: VehicleOrders, at: { kind: "stop" | "depot"; id: string }): boolean {
  const o = currentOrder(v);
  if (!o || v.phase !== "travelling") return false;
  if (o.kind === "stop" && at.kind === "stop" && o.stationId === at.id) {
    v.phase = "docked"; v.dwellDays = 0; return true;
  }
  if (o.kind === "depot" && at.kind === "depot" && (!o.depotId || o.depotId === at.id)) {
    v.phase = "servicing"; v.dwellDays = 0; return true;
  }
  return false;
}

function depart(v: VehicleOrders): void {
  const o = currentOrder(v);
  if (o?.temp) {
    v.orders.splice(v.current, 1);              // temporary order is used up; the next one slides in
    if (v.current >= v.orders.length) v.current = 0;
  } else {
    v.current = (v.current + 1) % Math.max(1, v.orders.length);
  }
  v.phase = "travelling";
  v.dwellDays = 0;
}

/**
 * Call once per game day while the vehicle is docked or being serviced.
 * Do the unloading when it docks, loading each day, and servicing (serviceVehicle) at a depot.
 * `loaded` = units on board now. `capacity` = vehicle capacity.
 */
export function tickDock(v: VehicleOrders, loaded: number, capacity: number, days = 1): "wait" | "depart" {
  if (v.phase === "travelling") return "wait";
  v.dwellDays += days;
  const o = currentOrder(v);
  if (!o) { depart(v); return "depart"; }

  if (v.phase === "servicing") {
    if (v.dwellDays >= 2) { depart(v); return "depart"; }
    return "wait";
  }

  const load = o.kind === "stop" ? o.load : "none";
  let go = false;
  if (load === "none") go = v.dwellDays >= 1;
  else if (load === "auto") go = (loaded > 0 && v.dwellDays >= 1) || v.dwellDays >= 3;
  else go = loaded >= capacity || v.dwellDays >= v.maxFullLoadWaitDays;

  if (go) { depart(v); return "depart"; }
  return "wait";
}

/** Should the unloading step at this stop drop cargo? */
export function shouldUnload(v: VehicleOrders): boolean {
  const o = currentOrder(v);
  return !!o && o.kind === "stop" && o.unload !== "none";
}

export function shouldLoad(v: VehicleOrders): boolean {
  const o = currentOrder(v);
  return !!o && o.kind === "stop" && o.load !== "none";
}

// --------------------------------------------------------------- servicing

/**
 * Call each day (or each month) while travelling. If the vehicle needs servicing and
 * auto-service is on, a one-time depot visit is added before its next stop.
 */
export function maybeInsertService(v: VehicleOrders, needsService: boolean, depotId?: string): boolean {
  if (!v.autoService || !needsService || v.phase !== "travelling") return false;
  if (v.orders.some(o => o.kind === "depot")) return false;   // already has a depot visit planned
  v.orders.splice(v.current, 0, { kind: "depot", depotId, temp: true });
  return true;
}

// ----------------------------------------------------------------- editing

/** Replace the whole list (e.g. from the OrdersPanel). Keeps `current` in range. */
export function setOrders(v: VehicleOrders, orders: Order[]): void {
  v.orders = orders;
  if (v.current >= orders.length) v.current = 0;
  if (!orders.length) { v.phase = "travelling"; v.dwellDays = 0; }
}

export function addStop(v: VehicleOrders, stationId: string, load: LoadMode = "auto", unload: UnloadMode = "auto"): void {
  v.orders.push({ kind: "stop", stationId, load, unload });
}

export function removeOrder(v: VehicleOrders, index: number): void {
  if (index < 0 || index >= v.orders.length) return;
  v.orders.splice(index, 1);
  if (index < v.current) v.current -= 1;
  if (v.current >= v.orders.length) v.current = 0;
}

export function skipOrder(v: VehicleOrders): void {
  if (v.orders.length) { v.current = (v.current + 1) % v.orders.length; v.phase = "travelling"; v.dwellDays = 0; }
}

/** Call when a station is demolished. Removes it from every vehicle's orders. */
export function dropStation(v: VehicleOrders, stationId: string): void {
  let before = 0;
  v.orders = v.orders.filter((o, i) => {
    const hit = o.kind === "stop" && o.stationId === stationId;
    if (hit && i < v.current) before++;
    return !hit;
  });
  v.current = Math.max(0, v.current - before);
  if (v.current >= v.orders.length) v.current = 0;
  if (v.phase !== "travelling") { v.phase = "travelling"; v.dwellDays = 0; }
}

// ------------------------------------------------------------------- checks

export function validate(v: VehicleOrders, stationExists: (id: string) => boolean): string[] {
  const out: string[] = [];
  const stops = v.orders.filter((o): o is StopOrder => o.kind === "stop");
  if (stops.length === 0) out.push("No orders. The vehicle will stay where it is.");
  else if (stops.length === 1) out.push("Only one stop. Add a second stop so it has somewhere to go.");
  for (const s of stops) if (!stationExists(s.stationId)) out.push(`A stop on the list no longer exists (${s.stationId}).`);
  if (stops.some(s => s.load === "full") && stops.length < 2) out.push("Full load with a single stop will wait for a full load every time.");
  return out;
}

export function describe(v: VehicleOrders, nameOf: (id: string) => string): string[] {
  return v.orders.map((o, i) => {
    const arrow = i === v.current ? "▶ " : "  ";
    if (o.kind === "depot") return `${arrow}Service at depot${o.temp ? " (once)" : ""}`;
    const bits: string[] = [];
    if (o.load === "full") bits.push("full load");
    if (o.load === "none") bits.push("no loading");
    if (o.unload === "unload") bits.push("unload all");
    if (o.unload === "none") bits.push("no unloading");
    return `${arrow}Go to ${nameOf(o.stationId)}${bits.length ? ` (${bits.join(", ")})` : ""}`;
  });
}

/*
 * HOW TO USE
 *
 *   const ord = newOrders(vehicle.id, [stationA.id, stationB.id]);
 *
 *   // Each game day, for each vehicle:
 *   if (ord.phase === "travelling") {
 *     maybeInsertService(ord, needsService(vehicle), nearestDepot?.id);
 *     const dest = destination(ord);            // drive toward dest (use RoadNetwork.step)
 *     // when the vehicle reaches a station tile:
 *     if (arrive(ord, { kind: "stop", id: station.id })) {
 *       if (shouldUnload(ord)) deliverCargo(...);
 *     }
 *   } else {
 *     if (shouldLoad(ord)) loadCargo(...);
 *     if (ord.phase === "servicing") serviceVehicle(vehicle, model);
 *     if (tickDock(ord, vehicle.loaded, model.capacity) === "depart") startMoving();
 *   }
 *
 *   // When the player demolishes a station:  vehicles.forEach(v => dropStation(v.orders, id));
 */
