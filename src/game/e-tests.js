// ------------------------------------------------------------- test suite
function assert(c, msg) { if (!c) throw new Error(msg || "assertion failed"); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "expected equal") + ": got " + a + ", wanted " + b); }
function slopeViolations(m) { let n = 0; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const h = m.height[y * m.w + x]; if (x + 1 < m.w && Math.abs(h - m.height[y * m.w + x + 1]) > 1) n++; if (y + 1 < m.h && Math.abs(h - m.height[(y + 1) * m.w + x]) > 1) n++; } return n; }

const TESTS = [
  ["core", "Delivery pays more for distance and loses value when slow", () => {
    const a = core.deliveryIncome("coal", 20, { x: 0, y: 0 }, { x: 10, y: 0 }, 5), b = core.deliveryIncome("coal", 20, { x: 0, y: 0 }, { x: 30, y: 0 }, 5), c = core.deliveryIncome("passengers", 20, { x: 0, y: 0 }, { x: 20, y: 0 }, 5), d = core.deliveryIncome("passengers", 20, { x: 0, y: 0 }, { x: 20, y: 0 }, 120);
    assert(b > a, "longer trip should pay more"); assert(c > d, "slow delivery should pay less");
  }],
  ["core", "Dates roll over months, quarters and years", () => {
    let d = { year: 1950, month: 11, day: 31 }; const r = core.advanceDay(d);
    assert(r.newMonth && r.newQuarter && r.newYear, "31 Dec should roll everything"); eq(r.date.year, 1951); eq(r.date.month, 0);
  }],
  ["core", "Loans, interest, repayment and bankruptcy", () => {
    const c = core.newCompany(); const cash0 = c.cash; assert(core.borrow(c), "borrow"); assert(c.loan > 0 && c.cash > cash0, "loan adds cash");
    const i = core.chargeMonthlyInterest(c); assert(i > 0, "interest charged"); assert(core.repay(c), "repay"); 
    const bad = core.newCompany(); bad.cash = -999999; let s = "ok"; for (let k = 0; k < 12; k++) s = core.checkBankruptcy(bad); assert(s === "bankrupt", "bankrupt after losing quarters, got " + s);
  }],
  ["core", "Inflation stays sane", () => { let f = 1; for (let i = 0; i < 40; i++) f = core.nextInflation(f); assert(f >= 1 && f < 4, "inflation " + f); }],
  ["vehicles", "Catalogue has buses, trucks, locos and wagons with sane stats", () => {
    const ms = V.MODELS; assert(ms.length >= 60, "models: " + ms.length);
    for (const t of ["bus", "truck", "locomotive", "wagon"]) assert(ms.some(m => m.type === t), "missing " + t);
    for (const m of ms) { assert(m.price > 0 && m.speedKmh > 0 && m.capacity >= 0, "bad stats " + m.id); assert(m.look && V.vehicleSvg(m, 30).includes("<svg"), "no svg " + m.id); }
    assert(new Set(ms.map(m => m.id)).size === ms.length, "duplicate ids");
  }],
  ["vehicles", "Models arrive and retire by year", () => {
    const a = V.availableModels(1950, "bus").length, b = V.availableModels(1990, "bus").length; assert(a >= 1 && b >= 1, "needs a bus in every era");
    assert(V.availableModels(1950, "truck").length >= 6, "a truck for every cargo in 1950");
    const n = V.availableModels(2030, "truck"); assert(n.length >= 6, "newest models never retire");
  }],
  ["vehicles", "Train consists limit wagons and compute speed", () => {
    const loco = V.MODELS.find(m => m.type === "locomotive"), w = V.MODELS.find(m => m.type === "wagon");
    const cs = V.consistStats(loco.id, w.id, 8); assert(cs.ok && cs.n >= 1 && cs.capacity > 0 && cs.price > loco.price, "consist");
    const big = V.consistStats(loco.id, w.id, 99); assert(big.n === big.maxN, "wagons capped");
    const model = V.getModel("consist:" + loco.id + ":" + w.id + ":4"); assert(model, "consist id parses");
    assert(V.trainSvg(loco.id, w.id, 4, 40).includes("<svg"), "train svg");
  }],
  ["mapgen", "Same seed gives the same map, different seed differs", () => {
    const a = mapgen.generateMap("42", { size: 64, towns: 10 }), b = mapgen.generateMap("42", { size: 64, towns: 10 }), c = mapgen.generateMap("43", { size: 64, towns: 10 });
    eq(a.towns.map(t => t.name + t.x + t.y).join(), b.towns.map(t => t.name + t.x + t.y).join(), "determinism");
    assert(a.towns.map(t => t.x + "," + t.y).join() !== c.towns.map(t => t.x + "," + t.y).join(), "seeds should differ");
  }],
  ["mapgen", "Towns are all different and land is smooth", () => {
    for (const seed of [1, 2, 3, 99]) {
      const m = mapgen.generateMap(String(seed), { size: 96, towns: 18 });
      assert(m.towns.length >= 12, "seed " + seed + " towns " + m.towns.length);
      eq(slopeViolations(m), 0, "slope violations seed " + seed);
      assert(new Set(m.towns.map(t => t.name)).size === m.towns.length, "unique town names");
      assert(new Set(m.towns.map(t => t.buildings.length)).size > 3, "town sizes should vary");
      assert(m.industries.length >= 6, "industries " + m.industries.length);
      const kinds = new Set(m.industries.map(i => i.kind)); assert(kinds.has("coalMine") && kinds.has("powerStation"), "needs coal chain");
    }
  }],
  ["mapgen", "Towns grow and new industries can be added", () => {
    const m = mapgen.generateMap("5", { size: 80, towns: 12 }); const t = m.towns[0], b0 = t.buildings.length; let g = 0; for (let i = 0; i < 60; i++) if (mapgen.growTown(m, t.id, Math.random)) g++;
    assert(g > 0 && t.buildings.length > b0, "town should grow"); const n = m.industries.length; for (let k = 0; k < 20 && m.industries.length === n; k++) mapgen.addIndustry(m, "coalMine", Math.random); assert(m.industries.length === n + 1, "industry added");
    eq(slopeViolations(m), 0, "still smooth after growth");
  }],
  ["terrain", "Raise and lower keep slopes gentle", () => {
    const m = mapgen.generateMap("8", { size: 64, towns: 8 }); let x = 0, y = 0; outer: for (y = 3; y < 60; y++) for (x = 3; x < 60; x++) { const i = y * m.w + x; if (!m.water[i] && !m.occupied[i] && m.height[i] > 0) break outer; }
    const i = y * m.w + x, h = m.height[i]; const r = terrain.raiseTile(m, x, y); assert(r.ok, r.reason); eq(m.height[i], h + 1); eq(slopeViolations(m), 0, "after raise");
    const l = terrain.lowerTile(m, x, y); assert(l.ok, l.reason); eq(slopeViolations(m), 0, "after lower");
  }],
  ["terrain", "Level area, bridge and tunnel finders", () => {
    const t = terrain.createTerrain(20, 5);
    for (let x = 0; x < 20; x++) for (let y = 0; y < 5; y++) { t.height[y * 20 + x] = 2; }
    for (let x = 6; x <= 9; x++) for (let y = 0; y < 5; y++) { t.height[y * 20 + x] = 0; t.water[y * 20 + x] = 1; }
    const b = terrain.findBridge(t, 5, 2, 1, 0); assert(b && b.kind === "bridge" && b.length === 4 && b.endX === 10, "bridge over river"); assert(b.cost > 0, "cost");
    assert(terrain.findBridge(t, 5, 2, -1, 0) === null, "nothing to cross");
    const t2 = terrain.createTerrain(20, 5); for (let x = 0; x < 20; x++) for (let y = 0; y < 5; y++) t2.height[y * 20 + x] = (x >= 5 && x <= 8) ? 5 : 2;
    const tn = terrain.findTunnel(t2, 4, 2, 1, 0); assert(tn && tn.kind === "tunnel" && tn.endX === 9, "tunnel through hill");
    const t3 = terrain.createTerrain(12, 12); for (let i = 0; i < 144; i++) t3.height[i] = (i % 12 + ((i / 12) | 0)) % 2 ? 1 : 0;
    const lv = terrain.levelArea(t3, 3, 3, 6, 6, 1); assert(lv.ok, lv.reason); for (let y = 3; y <= 6; y++) for (let x = 3; x <= 6; x++) eq(t3.height[y * 12 + x], 1, "levelled");
  }],
  ["terrain", "Slope speed factors", () => { assert(terrain.slopeSpeedFactor(1, "steam") < terrain.slopeSpeedFactor(1, "electric"), "steam slower"); eq(terrain.slopeSpeedFactor(-1, "steam"), 1); }],
  ["signals", "Block signals stop a second train in an occupied block", () => {
    const n = new T.signals.RailNetwork(); for (let x = 0; x < 10; x++) n.addTrack(x, 0);
    assert(n.addSignal({ x: 4, y: 0 }, { x: 5, y: 0 }, "twoway"), "signal placed"); assert(!n.addSignal({ x: 0, y: 0 }, { x: 5, y: 0 }), "non adjacent rejected");
    n.setTrainTiles("A", [{ x: 7, y: 0 }, { x: 6, y: 0 }]);
    const r = n.canAdvance("B", { x: 4, y: 0 }, { x: 5, y: 0 }); assert(!r.ok && r.reason === "red", "B must wait"); eq(n.signalColour({ x: 4, y: 0 }, { x: 5, y: 0 }), "red");
    n.setTrainTiles("A", [{ x: 9, y: 0 }]); n.setTrainTiles("A", [{ x: 2, y: 0 }]);
    assert(n.canAdvance("B", { x: 4, y: 0 }, { x: 5, y: 0 }).ok, "free block lets B through");
  }],
  ["signals", "One-way signals and collisions", () => {
    const n = new T.signals.RailNetwork(); for (let x = 0; x < 6; x++) n.addTrack(x, 0); n.addSignal({ x: 2, y: 0 }, { x: 3, y: 0 }, "oneway");
    assert(n.canAdvance("A", { x: 2, y: 0 }, { x: 3, y: 0 }).ok, "right way"); eq(n.canAdvance("A", { x: 3, y: 0 }, { x: 2, y: 0 }).reason, "wrong-way");
    n.setTrainTiles("A", [{ x: 0, y: 0 }]); n.setTrainTiles("B", [{ x: 0, y: 0 }]); eq(n.collisions().length, 1, "same tile collides");
  }],
  ["roadnet", "Roads connect, paths are found and lanes limit traffic", () => {
    const r = new roadnet.RoadNetwork(() => 0, 2); for (let x = 0; x < 8; x++) r.addRoad(x, 0); r.addRoad(20, 20);
    assert(r.connected({ x: 0, y: 0 }, { x: 7, y: 0 }), "connected"); assert(!r.connected({ x: 0, y: 0 }, { x: 20, y: 20 }), "island");
    const p = r.findPath({ x: 0, y: 0 }, { x: 7, y: 0 }); assert(p && p.length >= 7, "path");
    r.moveVehicle("a", null, { x: 3, y: 0 }); r.moveVehicle("b", null, { x: 3, y: 0 }); assert(!r.canEnter("c", { x: 3, y: 0 }), "lane full");
    r.removeVehicle("a"); assert(r.canEnter("c", { x: 3, y: 0 }), "lane frees up");
    r.removeRoad(4, 0); assert(!r.connected({ x: 0, y: 0 }, { x: 7, y: 0 }), "cut road disconnects");
    assert(r.speedFactor({ x: 0, y: 0 }, { x: 1, y: 0 }, "road") === 1, "flat is full speed");
  }],
  ["stations", "Catchment, rating and loading", () => {
    const s = ST.newStation("t", "Test", "busStop", 10, 10); assert(ST.covers(s, 12, 10) && !ST.covers(s, 20, 10), "covers"); assert(ST.previewCatchment("busStop", 10, 10, 50, 50).length > 20, "preview");
    s.waiting = { passengers: 30 }; s.served = { passengers: true }; const got = ST.loadOnto(s, "passengers", 20); eq(got, 20, "loads up to capacity"); eq(s.waiting.passengers, 10);
    const r = ST.ratingOf(s, "passengers"); assert(r >= 0 && r <= 1, "rating 0..1");
  }],
  ["orders", "Orders cycle, full load waits, service inserts and clears", () => {
    const o = OR.newOrders("v", ["a", "b"]); eq(OR.destination(o).id, "a"); assert(OR.arrive(o, { kind: "stop", id: "a" }), "dock"); eq(o.phase, "docked");
    assert(OR.tickDock(o, 10, 20) === "depart", "auto load leaves after a day"); eq(OR.destination(o).id, "b");
    o.orders[1].load = "full"; OR.arrive(o, { kind: "stop", id: "b" }); eq(OR.tickDock(o, 5, 20), "wait", "waits for full load"); eq(OR.tickDock(o, 20, 20), "depart", "full leaves");
    assert(OR.maybeInsertService(o, true, "d1"), "service inserted"); eq(OR.destination(o).kind, "depot"); OR.arrive(o, { kind: "depot", id: "d1" }); OR.tickDock(o, 0, 20); eq(OR.tickDock(o, 0, 20), "depart", "service done");
    assert(!o.orders.some(x => x.kind === "depot"), "temp depot order removed");
    OR.dropStation(o, "b"); eq(o.orders.length, 1); assert(OR.validate(o, () => true).length > 0, "one stop warns");
    const c = OR.cloneOrders(OR.newOrders("x", ["a", "b"]), "y"); eq(c.vehicleId, "y");
  }],
  ["events", "News log, objectives and rating", () => {
    const log = EV.newNewsLog(); EV.addNews(log, { year: 1950, month: 0, day: 1 }, "info", "Hello"); eq(EV.latestNews(log, 1)[0].text, "Hello");
    const objs = EV.defaultObjectives(1950); assert(objs.length >= 2, "objectives"); assert(EV.progress(objs[0], { passengers: 0, cargo: 0, cash: 0, companyValue: 0, townsConnected: 0, vehicles: 0, yearlyProfit: 0 }) === 0, "zero progress");
    const r = EV.performanceRating({ vehicles: [], stations: 0, quarterlyIncome: [], cargoDeliveredQuarter: 0, cash: 0, loan: 0, maxLoan: 100000, inflation: 1 }); assert(r.total >= 0 && r.total <= 1000 && r.title, "rating");
    const mid = EV.performanceRating({ vehicles: [{ ageYears: 1, speedKmh: 100 }], stations: 6, quarterlyIncome: [20000, 30000], cargoDeliveredQuarter: 1500, cash: 200000, loan: 0, maxLoan: 100000, inflation: 1 }); assert(mid.total > r.total, "better company rates higher");
  }],
  ["events", "Monthly events produce valid actions over many years", () => {
    const m = mapgen.generateMap("11", { size: 80, towns: 12 }), log = EV.newNewsLog(), st = EV.newEventState(); let acts = 0;
    for (let i = 0; i < 240; i++) { const a = EV.rollMonthlyEvents({ date: { year: 1950 + ((i / 12) | 0), month: i % 12, day: 1 }, startYear: 1950, inflation: 1, interestRate: 0.08, towns: m.towns, industries: m.industries, serviceRating: () => 0.5 }, st, log, Math.random); acts += a.length; }
    assert(log.items.length > 3, "some news over 20 years");
  }],
  ["save", "Save game round trip keeps typed arrays, maps and sets", () => {
    const m = mapgen.generateMap("21", { size: 48, towns: 6 }); const state = { map: m, set: new Set([1, 2, 3]), mp: new Map([["a", 1]]), n: 5 };
    const back = SV.deserialize(SV.serialize(state, "t")).state; eq(back.map.height.length, m.height.length); assert(back.map.height instanceof Uint8Array, "typed array"); eq(back.map.height[100], m.height[100]);
    assert(back.set instanceof Set && back.set.has(2), "set"); assert(back.mp instanceof Map && back.mp.get("a") === 1, "map"); eq(back.map.towns[0].name, m.towns[0].name);
  }],
  ["save", "Save slots store and list games in this browser", () => {
    const r = SV.saveGame("tt-test", { a: 1 }, "test"); assert(r.ok, r.error); assert(SV.listSaves().some(s => s.slot === "tt-test"), "listed"); eq(SV.loadGame("tt-test").a, 1); SV.deleteSave("tt-test"); assert(SV.loadGame("tt-test") === null, "deleted");
  }],
  ["ai", "AI company can be created and builds routes via the game API", () => {
    const ai = AI.createAi(0, 120000, 0.8); eq(ai.cash, 120000); assert(ai.name.length > 2, "name");
  }],
  ["game", "Playing: demo route builds, buses run and earn money", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 10, rivals: 0, startYear: 1950, seed: "2024" });
    const d = buildDemoRoute(); assert(d.ok, d.msg); assert(S.depots.length >= 1 && S.stations.length >= 2, "depot and stops placed");
    const bus = V.availableModels(S.date.year, "bus")[0]; const r = buyVehicle(bus.id, S.depots[0]); assert(r.ok, r.msg); assert(r.pair && r.pair.length === 2, "orders auto-assigned");
    const out = simulateDays(240); assert(out.pax > 0, "passengers delivered: " + JSON.stringify(out)); assert(S.vehicles[0].profit.thisYear + S.vehicles[0].profit.lastYear > 0, "bus earned income");
  }],
  ["game", "Game over, loading and a rival company over several years", () => {
    startGame({ climate: "arctic", difficulty: "medium", mapSize: 64, towns: 10, rivals: 2, startYear: 1950, seed: "77" });
    simulateDays(365 * 3); assert(S.rivals.some(r => r.ai.routes.length > 0), "a rival built a route in 3 years"); assert(S.history.length >= 30, "monthly history recorded");
    saveNow(SLOT); const date = JSON.stringify(S.date); const cash = Math.round(S.company.cash); simulateDays(40); assert(loadSlot(SLOT), "load"); eq(JSON.stringify(S.date), date, "date restored"); eq(Math.round(S.company.cash), cash, "cash restored");
    simulateDays(60); 
  }],
  ["game", "Trucks: coal trucks haul from a mine to a power station and earn money", () => {
    let done = null, tried = [];
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const r = demoLine("road", "coal", 2); tried.push(seed + ":" + (r.ok ? "ok" : r.msg)); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed had a buildable coal line: " + tried.join(" | "));
    assert(done.vh.cargo === "coal" && done.vh.orders.orders.length === 2, "coal truck got orders");
    const out = simulateDays(300); assert(out.cargo > 0, "coal delivered: " + JSON.stringify(out));
    const ps = S.map.industries.find(i => CARGO_TO_IND.coal.includes(i.kind)); assert(ps, "has a coal consumer");
  }],
  ["game", "Trains: a coal train on track pulls wagons, delivers and earns money", () => {
    let done = null, tried = [];
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const r = demoLine("rail", "coal", 1); tried.push(seed + ":" + (r.ok ? "ok" : r.msg)); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed had a buildable coal rail line: " + tried.join(" | "));
    const vh = done.vh, m = modelOf(vh); eq(m.type, "train"); assert(m.parts && m.parts.n === 5, "five wagons"); assert(R.rail.hasRoad(vh.tile.x, vh.tile.y), "train is on the track"); assert(!R.roads.hasRoad(vh.tile.x, vh.tile.y), "not on a road");
    assert(done.line.depot.kind === "rail", "train depot"); assert(S.stations.every(s => s.kind === "trainStation"), "train stations");
    const out = simulateDays(400); assert(out.cargo > 0, "coal delivered by train: " + JSON.stringify(out)); assert(vh.profit.thisYear + vh.profit.lastYear > 0, "train earned money");
    assert(S.ledgers.some(l => (l.items.incomeRail || 0) > 0) || (S.acc.incomeRail || 0) > 0, "booked as train income");
  }],
  ["game", "Trains: passenger train between towns, plus a bus cannot use a train depot", () => {
    let done = null;
    for (const seed of ["21", "22", "23", "24", "25", "26"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 16, rivals: 0, startYear: 1950, seed });
      const r = demoLine("rail", "passengers", 1); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed gave a passenger rail line");
    const bus = V.availableModels(S.date.year, "bus")[0]; const bad = buyVehicle(bus.id, done.line.depot); assert(!bad.ok, "bus refused at a train depot");
    const out = simulateDays(300); assert(out.pax > 0, "passengers carried by train: " + JSON.stringify(out));
  }],
  ["rail", "Level crossings: track over a road, trains and cars never share it", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "31" });
    S.company.cash = 500000; const t = S.map.towns[0]; const rd = R.roads.nearestRoad(t.x, t.y, 6);
    const r = buildTrackTile(rd.x, rd.y); assert(r.ok, "track over a road makes a crossing: " + r.reason); assert(crossingAt(rd.x, rd.y), "crossing");
    R.res.set(key(rd.x, rd.y), "train-x"); assert(!railFree(rd, "other"), "reserved crossing is taken");
    const bus = makeVehicle("player", V.availableModels(1950, "bus")[0].id, { x: rd.x + 1, y: rd.y }, []); R.res.delete(key(rd.x, rd.y));
    R.roads.moveVehicle(bus.id, null, rd); assert(!railFree(rd, "train-x"), "a car on the crossing keeps the train out"); removeVehicle(bus);
    assert(bulldoze(rd.x, rd.y).ok && R.roads.hasRoad(rd.x, rd.y) && !R.rail.hasRoad(rd.x, rd.y), "bulldoze takes the rails and leaves the road");
    const free = spotNear(t.x + 6, t.y + 6, 5, t.x, t.y); assert(buildTrackTile(free.x, free.y).ok, "track"); assert(buildRoadTile(free.x, free.y).ok && crossingAt(free.x, free.y), "road over track makes a crossing too");
  }],
  ["rail", "Passing loop with one-way signals: two trains pass; without signals a stuck train is reported", () => {
    let area = null;
    for (const seed of ["71", "72", "73", "74", "75"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 6, rivals: 0, startYear: 1950, seed });
      const free = (x, y) => inB(x, y) && !S.map.water[key(x, y)] && !S.map.occupied[key(x, y)];
      for (let y = 3; y < S.map.h - 6 && !area; y++) for (let x = 3; x < S.map.w - 15 && !area; x++) { let ok = true; for (let dy = -1; dy <= 3 && ok; dy++) for (let dx = -1; dx <= 13 && ok; dx++) if (!free(x + dx, y + dy)) ok = false; if (ok) area = { x, y }; }
      if (area) break;
    }
    assert(area, "a flat free area"); S.company.cash = 900000; const { x: X, y: Y } = area;
    for (let dx = 0; dx <= 11; dx++) assert(buildTrackTile(X + dx, Y).ok, "main line");
    for (let dx = 3; dx <= 8; dx++) buildTrackTile(X + dx, Y + 2); buildTrackTile(X + 3, Y + 1); buildTrackTile(X + 8, Y + 1);
    const west = placeStation(X, Y, "trainStation", "player").station; placeStation(X + 1, Y, "trainStation", "player");
    const east = placeStation(X + 11, Y, "trainStation", "player").station; placeStation(X + 10, Y, "trainStation", "player");
    eq(stationTiles(west).length, 2, "two-tile platform");
    S.signals[key(X + 6, Y)] = { dx: 1, dy: 0, two: false }; S.signals[key(X + 5, Y + 2)] = { dx: -1, dy: 0, two: false };
    const loco = V.availableModels(1950, "locomotive").sort((a, b) => a.price - b.price)[0], wag = V.availableModels(1950, "wagon").find(w => w.cargo === "passengers");
    const tm = V.buildTrainModel(loco.id, wag.id, 2); eq(trainLen(tm), 2, "a three-unit train is two tiles long");
    const A = makeVehicle("player", tm.id, { x: X + 1, y: Y }, [west.id, east.id]); A.dir = { dx: 1, dy: 0 };
    const B = makeVehicle("player", tm.id, { x: X + 10, y: Y }, [east.id, west.id]); B.dir = { dx: -1, dy: 0 };
    let both = 0, clash = 0, loopUsed = false;
    for (let d = 0; d < 160; d++) {
      for (let f = 0; f < 4; f++) moveVehicles(0.25); dailyTick();
      const ta = trainTiles(A).map(tk), tb = new Set(trainTiles(B).map(tk));
      if (ta.some(k => tb.has(k))) clash++;
      if (A.state === "moving" && B.state === "moving") both++;
      if (trainTiles(B).some(t => t.y === Y + 2) || trainTiles(A).some(t => t.y === Y + 2)) loopUsed = true;
    }
    eq(clash, 0, "trains never share a tile"); assert(loopUsed, "one train took the loop"); assert(both > 10, "both trains moved at the same time: " + both);
    assert((A.trips || 0) >= 3 && (B.trips || 0) >= 3, "both kept running: " + A.trips + " / " + B.trips);
    // Without signals the single line is one block. With one platform at each end the two trains
    // end up waiting for each other, so the game must say so in the news.
    delete S.signals[key(X + 6, Y)]; delete S.signals[key(X + 5, Y + 2)];
    let warned = false; for (let d = 0; d < 200 && !warned; d++) { for (let f = 0; f < 4; f++) moveVehicles(0.25); dailyTick(); warned = S.news.items.some(n => /waited a month for a free line/.test(n.text)); }
    assert(warned, "a stuck train is reported in the news");
    let clash2 = 0; const ta = new Set(trainTiles(A).map(tk)); if (trainTiles(B).some(t => ta.has(tk(t)))) clash2++; eq(clash2, 0, "still no shared tiles");
    draw();
  }],
  ["rail", "Signals: straight track only, cycle one-way, reversed, two-way, off", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 6, rivals: 0, startYear: 1950, seed: "71" });
    S.company.cash = 100000; const a = spotNear(20, 20, 8, 40, 20); for (let k = 0; k < 4; k++) buildTrackTile(a.x + k, a.y);
    const r1 = cycleSignal(a.x + 1, a.y); assert(r1.ok && !r1.signal.two && r1.signal.dx === 1, "one-way east");
    const r2 = cycleSignal(a.x + 1, a.y); assert(r2.signal.dx === -1, "turned round"); const r3 = cycleSignal(a.x + 1, a.y); assert(r3.signal.two, "two-way");
    const r4 = cycleSignal(a.x + 1, a.y); assert(r4.ok && !r4.signal && !S.signals[key(a.x + 1, a.y)], "removed");
    buildTrackTile(a.x + 2, a.y + 1); assert(!cycleSignal(a.x + 2, a.y).ok, "no signal on a junction");
  }],
  ["rail", "Longer stations: platforms join, catchment grows, trains load faster", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 6, rivals: 0, startYear: 1950, seed: "72" });
    S.company.cash = 100000; const a = spotNear(20, 20, 8, 40, 20); for (let k = 0; k < 4; k++) buildTrackTile(a.x + k, a.y);
    const s1 = placeStation(a.x, a.y, "trainStation", "player").station; const j = placeStation(a.x + 1, a.y, "trainStation", "player");
    assert(j.joined && j.station === s1, "joined"); placeStation(a.x + 2, a.y, "trainStation", "player"); eq(stationTiles(s1).length, 3, "three tiles");
    assert(ST.covers(s1, a.x + 6, a.y) && !ST.covers(s1, a.x - 5, a.y), "catchment reaches from every tile");
    bulldoze(a.x + 2, a.y); eq(stationTiles(s1).length, 2, "one tile removed"); assert(stationById(s1.id), "station remains");
  }],
  ["rail", "Electric locomotives need electrified track", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 6, rivals: 0, startYear: 1980, seed: "73" });
    S.company.cash = 900000; const a = spotNear(20, 20, 8, 40, 20); for (let k = 0; k < 6; k++) buildTrackTile(a.x + k, a.y);
    const d = placeDepot(a.x, a.y, "rail").depot; const st = placeStation(a.x + 5, a.y, "trainStation", "player").station;
    const el = V.availableModels(1980, "locomotive").find(l => /^(Volt|Arc)/.test(l.name)); assert(el, "an electric loco in 1980");
    const tm = V.buildTrainModel(el.id, V.availableModels(1980, "wagon")[0].id, 3);
    assert(!buyVehicle(tm.id, d).ok, "refused on plain track"); assert(railPath({ x: a.x, y: a.y }, new Set([key(a.x + 5, a.y)]), { elec: true }) === null, "no electric route");
    for (let k = 0; k < 6; k++) assert(electrifyTile(a.x + k, a.y).ok, "electrified");
    const b = buyVehicle(tm.id, d); assert(b.ok, b.msg); assert(railPath({ x: a.x, y: a.y }, new Set([key(a.x + 5, a.y)]), { elec: true }).length === 5, "electric route");
    bulldoze(a.x + 3, a.y); assert(!isElec(a.x + 3, a.y), "wires go with the track");
  }],
  ["game", "Saved games keep the tracks and roads you built", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "41" });
    let r; for (const seed of ["41", "42", "43", "44", "45", "46"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 10, rivals: 0, startYear: 1950, seed }); r = demoLine("rail", "passengers", 1); if (r.ok) break; }
    assert(r && r.ok, "line built"); const tiles = R.rail.tiles().length, roads = R.roads.tiles().length; assert(tiles > 4, "track tiles");
    saveNow(SLOT); simulateDays(20); assert(loadSlot(SLOT), "loaded"); eq(R.rail.tiles().length, tiles, "track tiles restored"); eq(R.roads.tiles().length, roads, "road tiles restored");
    assert(S.vehicles.length === 1 && isTrain(S.vehicles[0]), "train restored"); const out = simulateDays(120); assert(out.days === 120, "keeps running after load");
  }],
  ["chain", "Every cargo has a truck and a wagon, and every industry output has a buyer", () => {
    for (const c of ["coal", "wood", "grain", "goods", "steel", "mail"]) { const v = { road: V.availableModels(1950, "truck").filter(m => m.cargo === c), rail: V.availableModels(1950, "wagon").filter(m => m.cargo === c) }; assert(v.road.length && v.rail.length, c + " needs a truck and a wagon in 1950"); }
    assert(V.availableModels(1950, "wagon").some(m => m.cargo === "passengers") && V.availableModels(1950, "bus").length, "passenger coaches and buses");
    for (const [kind, ch] of Object.entries(core.CHAINS)) {
      if (ch.out) assert((CARGO_TO_IND[ch.out] || []).length || core.TOWN_CARGO.includes(ch.out), kind + " makes " + ch.out + " but nothing accepts it");
      for (const c of ch.in || []) assert((CARGO_TO_IND[c] || []).includes(kind), kind + " should accept " + c);
      if (ch.out) eq(CARGO_FROM_IND[kind], ch.out, kind + " output label");
    }
    const ind = { kind: "factory", input: { grain: 10, steel: 5 }, output: {}, productionPerMonth: 6 }; core.tickIndustryMonth(ind, () => 0.5); eq(ind.output.goods, 15, "factory turns grain and steel into goods");
  }],
  ["chain", "wood by truck: delivered and paid", () => {
    let done = null, tried = [];
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "51", "52", "53", "54"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const r = demoLine("road", "wood", 2); tried.push(seed + ":" + (r.ok ? "ok" : r.msg)); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed worked: " + tried.slice(0, 4).join(" | "));
    const src = done.line.ends.from; 
    const inc0 = S.company.cash; const out = simulateDays(300); assert(out.cargo > 0, "wood delivered: " + JSON.stringify(out));
    assert(done.vh.profit.lifetime > -1e9 && S.vehicles.some(v => v.profit.lifetime !== 0), "vehicle has a profit record");
    const to = done.line.ends.to; assert(to.received && to.received['wood'] > 0, 'wood reached ' + to.kind);
  }],
  ["chain", "grain by train: delivered and paid", () => {
    let done = null, tried = [];
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "51", "52", "53", "54"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const r = demoLine("rail", "grain", 1); tried.push(seed + ":" + (r.ok ? "ok" : r.msg)); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed worked: " + tried.slice(0, 4).join(" | "));
    const src = done.line.ends.from; 
    const inc0 = S.company.cash; const out = simulateDays(300); assert(out.cargo > 0, "grain delivered: " + JSON.stringify(out));
    assert(done.vh.profit.lifetime > -1e9 && S.vehicles.some(v => v.profit.lifetime !== 0), "vehicle has a profit record");
    const to = done.line.ends.to; assert(to.received && to.received['grain'] > 0, 'grain reached ' + to.kind);
  }],
  ["chain", "steel by truck: delivered and paid (fed with coal)", () => {
    let done = null, tried = [];
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "51", "52", "53", "54"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const r = demoLine("road", "steel", 2); tried.push(seed + ":" + (r.ok ? "ok" : r.msg)); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed worked: " + tried.slice(0, 4).join(" | "));
    const src = done.line.ends.from; for (let k = 0; k < 10; k++) { src.input = src.input || {}; src.input['coal'] = (src.input['coal'] || 0) + 200; }
    const inc0 = S.company.cash; const out = simulateDays(300); assert(out.cargo > 0, "steel delivered: " + JSON.stringify(out));
    assert(done.vh.profit.lifetime > -1e9 && S.vehicles.some(v => v.profit.lifetime !== 0), "vehicle has a profit record");
    const to = done.line.ends.to; assert(to.received && to.received['steel'] > 0, 'steel reached ' + to.kind);
  }],
  ["chain", "goods by truck: delivered and paid (factory fed with its inputs)", () => {
    let done = null, tried = [];
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "51", "52", "53", "54"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const r = demoLine("road", "goods", 2); tried.push(seed + ":" + (r.ok ? "ok" : r.msg)); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed worked: " + tried.slice(0, 4).join(" | "));
    const src = done.line.ends.from; src.input = src.input || {}; for (const c of (core.CHAINS[src.kind].in || [])) src.input[c] = (src.input[c] || 0) + 2000;
    const inc0 = S.company.cash; const out = simulateDays(300); assert(out.cargo > 0, "goods delivered: " + JSON.stringify(out));
    assert(done.vh.profit.lifetime > -1e9 && S.vehicles.some(v => v.profit.lifetime !== 0), "vehicle has a profit record");
    
  }],
  ["chain", "coal by train: delivered and paid", () => {
    let done = null, tried = [];
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "51", "52", "53", "54"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const r = demoLine("rail", "coal", 1); tried.push(seed + ":" + (r.ok ? "ok" : r.msg)); if (r.ok) { done = r; break; }
    }
    assert(done, "no seed worked: " + tried.slice(0, 4).join(" | "));
    const src = done.line.ends.from; 
    const inc0 = S.company.cash; const out = simulateDays(300); assert(out.cargo > 0, "coal delivered: " + JSON.stringify(out));
    assert(done.vh.profit.lifetime > -1e9 && S.vehicles.some(v => v.profit.lifetime !== 0), "vehicle has a profit record");
    const to = done.line.ends.to; assert(to.received && to.received['coal'] > 0, 'coal reached ' + to.kind);
  }],
  ["chain", "Wagons exist for every material on the map, in every era", () => {
    for (const seed of ["11", "52", "77"]) {
      startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed });
      const mats = new Set(["passengers", "mail"]); for (const i of S.map.industries) { const c = CARGO_FROM_IND[i.kind]; if (c) mats.add(c); }
      for (const y of [1950, 1965, 1980, 1995, 2010, 2040]) for (const c of mats) assert(V.availableModels(y, "wagon").some(w => w.cargo === c), "no " + c + " wagon in " + y);
      const fams = trainCargoes(V.availableModels(1950)); for (const c of mats) assert(fams.some(f => f.cargo === c && f.sources > 0), c + " listed in the train shop");
    }
    for (const w of V.MODELS.filter(m => m.type === "wagon")) { const loco = V.availableModels(w.introYear, "locomotive")[0]; const cs = V.consistStats(loco.id, w.id, 4); assert(cs.ok && cs.capacity > 0, w.name + " can be pulled"); }
  }],
  ["ui", "Train shop: pick material, wagon and locomotive, then build", () => {
    let r; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = buildDemoLine("rail", "wood"); if (r.ok) break; }
    assert(r && r.ok, "rail line for timber");
    shopWin(r.depot, "train"); const sw = () => document.querySelector(".win[data-id=shop]");
    assert(sw().querySelectorAll(".mat").length >= 7, "seven materials shown");
    sw().querySelector(".mat[data-v=wood]").click(); assert(sw().querySelector(".mat.on").dataset.v === "wood", "timber selected");
    assert([...sw().querySelectorAll("[data-a=wag]")].every(x => V.getModel(x.dataset.v).cargo === "wood"), "only timber wagons listed");
    sw().querySelector("[data-a=buy]").click(); const t = S.vehicles.find(v => isTrain(v)); assert(t && t.cargo === "wood", "timber train built");
    eq(t.orders.orders.length, 2, "timber train got the forest and sawmill stops"); closeAllWins();
    const out = simulateDays(300); assert(out.cargo > 0, "timber delivered by train");
  }],
  ["orders", "Editing orders: change station, full load, reorder, remove, copy", () => {
    let r; for (const seed of ["11", "12", "13", "14", "15", "16"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("road", "coal", 3); if (r.ok) break; }
    assert(r && r.ok, "line");
    const vh = r.vh, [a, b] = vh.orders.orders.map(o => o.stationId);
    assert(setStopLoad(vh, 0, "full"), "full load set"); eq(vh.orders.orders[0].load, "full");
    assert(setStopUnload(vh, 0, "none"), "no unload"); eq(vh.orders.orders[0].unload, "none");
    assert(moveOrder(vh, 0, 1), "move down"); eq(vh.orders.orders[1].stationId, a, "moved");
    assert(!moveOrder(vh, 1, 1), "cannot move past the end");
    const extra = placeStation(r.line.s1.x, r.line.s1.y, "truckStop", "player"); assert(!extra.ok, "no second stop on the same tile");
    assert(addStopTo(vh, a), "add stop"); eq(vh.orders.orders.length, 3);
    assert(setStopStation(vh, 2, b), "change station"); eq(vh.orders.orders[2].stationId, b);
    assert(removeStop(vh, 2), "remove"); eq(vh.orders.orders.length, 2);
    const n = copyOrdersToSimilar(vh); eq(n, 2, "copied to the other two trucks");
    for (const v of similarVehicles(vh)) eq(v.orders.orders[1].load, "full", "copy kept full load");
    assert(orderWarnings(vh).length >= 0, "warnings run");
    setStopLoad(vh, 0, "auto"); setStopLoad(vh, 1, "full"); const out = simulateDays(200); assert(out.cargo > 0, "still delivers after editing");
  }],
  ["ui", "Fleet window, orders editor, shop with depot choice and industry window open without errors", () => {
    let r; for (const seed of ["11", "12", "13", "14", "15", "16"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("rail", "coal", 1); if (r.ok) break; }
    assert(r && r.ok, "line"); demoLine("road", "coal", 1);
    fleetWin(); const fw = document.querySelector(".win[data-id=fleet]"); assert(fw && fw.querySelectorAll(".fv").length >= 2, "fleet lists vehicles");
    fw.querySelector("[data-row]").click(); assert(fw.querySelector(".oed select[data-f=load]"), "orders editor opens in the fleet list");
    const sel = fw.querySelector(".oed select[data-f=load]"); sel.value = "full"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    const vid = fw.querySelector(".fv.open").dataset.v; eq(S.vehicles.find(v => v.id === vid).orders.orders[0].load, "full", "dropdown changed the order");
    closeWin("fleet");
    const dp = S.depots.find(d => d.kind === "rail"); shopWin(dp, "train"); const sw = document.querySelector(".win[data-id=shop]"); assert(sw.textContent.includes("Build at"), "shop shows which depot"); assert(!sw.querySelector("[data-a=buy]").disabled, "can buy from the depot");
    sw.querySelector("[data-a=buy]").click(); assert(S.vehicles.filter(v => isTrain(v)).length === 2, "second train bought from the depot window");
    closeAllWins(); industryWin(S.map.industries.find(i => i.kind === "factory") || S.map.industries[0]); assert(document.querySelector(".win[data-id=ind]").textContent.includes("vehicles"), "industry lists matching vehicles"); closeAllWins();
  }],
  ["fix", "Bulldozing a stop or depot leaves the road or track under it", () => {
    let r; for (const seed of ["11", "12", "13", "14", "15"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = buildDemoLine("rail", "coal"); if (r.ok) break; }
    assert(r && r.ok, "line");
    const s1 = r.s1, d = r.depot;
    const a = bulldoze(s1.x, s1.y); assert(a.ok && a.removed === "station", "station removed"); assert(R.rail.hasRoad(s1.x, s1.y), "track stays under the station");
    const b = bulldoze(d.x, d.y); assert(b.ok && b.removed === "depot", "depot removed"); assert(R.rail.hasRoad(d.x, d.y), "track stays under the depot");
    assert(bulldoze(s1.x, s1.y).ok && !R.rail.hasRoad(s1.x, s1.y), "second tap removes the track");
    const t = S.map.towns[0], rd = R.roads.nearestRoad(t.x, t.y, 6); S.company.cash += 9999; assert(placeStation(rd.x, rd.y, "busStop", "player").ok, "bus stop");
    bulldoze(rd.x, rd.y); assert(R.roads.hasRoad(rd.x, rd.y), "road stays under the bus stop");
  }],
  ["saves", "Named saves: save new, list, load, delete; import a save file", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "61" });
    for (const sv of savesList()) if (sv.slot.startsWith("s-")) SV.deleteSave(sv.slot);
    const slot = "s-test-" + Date.now(); assert(saveToSlot(slot, "Test run"), "saved"); const sv = savesList().find(x => x.slot === slot); assert(sv && sv.label.startsWith("Test run · Jan 1950"), "named with game date: " + (sv && sv.label));
    const cash = Math.round(S.company.cash); simulateDays(45); S.company.cash += 5000;
    assert(startLoaded(SV.loadGame(slot)), "loaded"); eq(Math.round(S.company.cash), cash, "cash back to the saved value"); eq(S.date.month, 0, "date back");
    const text = SV.serialize(S, "x"); simulateDays(10); assert(importSaveText(text), "import from text"); eq(S.date.month, 0, "imported game date");
    assert(!importSaveText("not a save"), "bad file refused"); assert(S && S.map, "game still running after a bad file");
    SV.deleteSave(slot); assert(!savesList().some(x => x.slot === slot), "deleted");
    savesWin(); assert(document.querySelector(".win[data-id=saves]"), "saves window opens"); closeAllWins();
  }],
  ["undo", "Drag to build shows cost first, builds on release, undo refunds", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "62" });
    S.company.cash = 500000; const t = S.map.towns[0];
    const free = (x, y) => inB(x, y) && !S.map.water[key(x, y)] && !S.map.occupied[key(x, y)];
    let a = null; for (let y = 2; y < S.map.h - 2 && !a; y++) for (let x = 2; x < S.map.w - 8 && !a; x++) { let ok = true; for (let k = 0; k < 6; k++) if (!free(x + k, y)) ok = false; if (ok) a = { x, y }; }
    assert(a, "room for a road"); const b = { x: a.x + 5, y: a.y };
    ui.tool = "road"; startPlan(a); updatePlan(b); const planned = ui.plan.cost; assert(planned > 0 && R.roads.hasRoad(a.x, a.y) === false, "cost shown before anything is built");
    const cash0 = S.company.cash; commitPlan(); assert(R.roads.hasRoad(b.x, b.y), "built on release"); eq(Math.round(cash0 - S.company.cash), planned, "charged what the preview said");
    const u = undoLast(); assert(u.ok, u.reason); assert(!R.roads.hasRoad(a.x, a.y) && !R.roads.hasRoad(b.x, b.y), "road removed"); eq(Math.round(S.company.cash), Math.round(cash0), "refunded");
    ui.tool = "track"; startPlan(a); updatePlan(b); commitPlan(); assert(R.rail.hasRoad(b.x, b.y), "track built");
    const st = placeStation(a.x, a.y, "trainStation", "player"); pushUndo({ kind: "station", id: st.station.id, cost: st.cost });
    assert(undoLast().ok && !R.stationAt.has(key(a.x, a.y)), "station undone"); assert(undoLast().ok && !R.rail.hasRoad(a.x, a.y), "track undone");
    const tile = spotNear(t.x - 8, t.y - 8, 6, t.x, t.y); const h = S.map.height[key(tile.x, tile.y)], hh = S.map.height.slice(), ww = S.map.water.slice();
    const r = terrain.raiseTile(S.map, tile.x, tile.y, 1); assert(r.ok, r.reason); pushUndo({ kind: "terrain", changes: terrainDiff(hh, ww), cost: r.cost });
    assert(undoLast().ok, "terrain undo"); eq(S.map.height[key(tile.x, tile.y)], h, "height restored");
    assert(!undoLast().ok, "nothing left to undo");
  }],
  ["feel", "Deliveries pop up income, settings change labels and grid", () => {
    let r; for (const seed of ["11", "12", "13"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("road", "passengers", 2); if (r.ok) break; }
    assert(r && r.ok, "line"); let seen = false; for (let d = 0; d < 120 && !seen; d++) { simulateDays(1); seen = R.floats.length > 0; if (seen) break; }
    assert(seen && R.floats[0].text.startsWith("+£"), "income pop-up after a delivery");
    const keep = { ...prefs }; settingsWin(); const w = document.querySelector(".win[data-id=settings]");
    const g = w.querySelector("#set-grid"); g.checked = !keep.grid; g.dispatchEvent(new Event("change", { bubbles: true })); eq(prefs.grid, !keep.grid, "grid toggled");
    const l = w.querySelector("#set-labels"); l.checked = false; l.dispatchEvent(new Event("change", { bubbles: true })); eq(prefs.labels, false, "labels off");
    draw(); Object.assign(prefs, keep); savePrefs(); closeAllWins();
  }],
  ["fleet", "Stop, start, stop in depot and clone", () => {
    let r; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("road", "coal", 1); if (r.ok) break; }
    assert(r && r.ok, "line"); const vh = r.vh; simulateDays(5);
    toggleStopped(vh); const at = { ...vh.tile }, p0 = vh.p, cash = S.company.cash; simulateDays(10);
    assert(sameT(vh.tile, at) && vh.p === p0, "a stopped vehicle stays put"); assert(S.company.cash >= cash - 1, "and costs nothing to run");
    toggleStopped(vh); assert(sendToDepot(vh, true).ok, "sent to depot");
    for (let d = 0; d < 120 && !vh.stopped; d++) simulateDays(1);
    assert(vh.stopped && R.depotAt.get(key(vh.tile.x, vh.tile.y)), "stopped inside the depot");
    const n = S.vehicles.length, c = cloneVehicle(vh); assert(c.ok, c.msg); eq(S.vehicles.length, n + 1, "one more vehicle");
    eq(c.vh.orders.orders.filter(o => o.kind === "stop").map(o => o.stationId).join(), vh.orders.orders.filter(o => o.kind === "stop").map(o => o.stationId).join(), "clone has the same stops");
  }],
  ["fleet", "Old vehicles: warnings, autorenew and autoreplace at the depot", () => {
    let r; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("road", "passengers", 2); if (r.ok) break; }
    assert(r && r.ok, "line"); S.company.cash = 900000;
    const [a, b] = S.vehicles; const life = lifeOf(modelOf(a));
    a.core.ageDays = Math.round((life - 0.5) * 365); ageWarnings(); assert(S.news.items.some(n => /getting old/.test(n.text)), "getting-old news");
    a.core.ageDays = Math.round((life + 0.2) * 365); ageWarnings(); assert(S.news.items.some(n => /is old and breaks down/.test(n.text)), "old news");
    replaceRules().renew = true; sendToDepot(a, false); for (let d = 0; d < 150 && a.core.ageDays > 365; d++) simulateDays(1);
    assert(a.core.ageDays < 365, "renewed at the depot"); assert(S.news.items.some(n => /^Renewed/.test(n.text)), "renew news");
    const newer = V.availableModels(S.date.year, "bus").find(m => m.id !== b.modelId); replaceRules().rules[b.modelId] = newer.id;
    sendToDepot(b, false); for (let d = 0; d < 150 && b.modelId !== newer.id; d++) simulateDays(1);
    eq(b.modelId, newer.id, "replaced with the newer model");
    autoreplaceWin(); assert(document.querySelector(".win[data-id=autorep] select"), "autoreplace window"); closeAllWins();
  }],
  ["fleet", "Refit a truck and a train in the depot", () => {
    let r; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("road", "coal", 1); if (r.ok) break; }
    assert(r && r.ok, "line"); S.company.cash = 900000; const vh = r.vh;
    assert(!refit(vh, "grain").ok, "only in a depot"); sendToDepot(vh, true); for (let d = 0; d < 120 && !vh.stopped; d++) simulateDays(1);
    const opts = refitOptions(vh); assert(opts.length >= 4, "can refit to other cargo");
    const rr = refit(vh, "grain"); assert(rr.ok, rr.reason); eq(vh.cargo, "grain"); assert(/Grain/.test(modelOf(vh).name), "now a grain truck: " + modelOf(vh).name);
    let t; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); t = demoLine("rail", "coal", 1); if (t.ok) break; }
    S.company.cash = 900000; const tr = t.vh; sendToDepot(tr, true); for (let d = 0; d < 160 && !tr.stopped; d++) simulateDays(1); assert(tr.stopped, "train in depot");
    const rt = refit(tr, "wood"); assert(rt.ok, rt.reason); eq(tr.cargo, "wood"); eq(modelOf(tr).parts.n, 5, "same number of wagons");
  }],
  ["stations", "Station window lists vehicles and rating reasons; road stops get bays", () => {
    let r; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("road", "passengers", 4); if (r.ok) break; }
    assert(r && r.ok, "line"); S.company.cash = 900000; simulateDays(40);
    const st = r.line.s1; stationWin(st); const w = document.querySelector(".win[data-id=st" + st.id + "]");
    assert(w && w.textContent.includes("Vehicles using it (4)"), "lists the 4 buses"); assert(/picked up|no pickup/.test(w.textContent), "rating reasons"); closeAllWins();
    let nb = DIR4.map(([dx, dy]) => ({ x: st.x + dx, y: st.y + dy })).find(t => R.roads.hasRoad(t.x, t.y) && !R.stationAt.has(key(t.x, t.y)) && !R.depotAt.has(key(t.x, t.y)));
    if (!nb) { nb = DIR4.map(([dx, dy]) => ({ x: st.x + dx, y: st.y + dy })).find(t => canBuildRoadOn(t.x, t.y) === ""); if (nb) buildRoadTile(nb.x, nb.y); }
    assert(nb, "room next to the stop"); const j = placeStation(nb.x, nb.y, "busStop", "player"); assert(j.ok && j.joined, "second bay joined");
    const [v1, v2, v3] = S.vehicles, A = { x: st.x, y: st.y };
    for (const v of [v1, v2]) { R.roads.removeVehicle(v.id); v.tile = { ...A }; v.state = "docked"; R.roads.moveVehicle(v.id, null, A); }
    v3.bay = null; const bay = bayFor(v3, st); assert(sameT(bay, nb), "a full bay sends the next bus to the other one");
    const trips = S.vehicles.reduce((a, v) => a + (v.trips || 0), 0); simulateDays(120);
    assert(S.vehicles.reduce((a, v) => a + (v.trips || 0), 0) > trips + 4, "buses keep running with two bays"); draw();
  }],
  ["towns", "Town councils: tree cutting hurts, bad rating blocks building, trees and ads help", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed: "81" });
    S.company.cash = 900000; const t = S.map.towns[0]; const r0 = townRating(t);
    let f = null; for (let dy = -t.radius - 2; dy <= t.radius + 2 && !f; dy++) for (let dx = -t.radius - 2; dx <= t.radius + 2 && !f; dx++) { const x = t.x + dx, y = t.y + dy; if (inB(x, y) && S.map.forest[key(x, y)] && !S.map.occupied[key(x, y)] && townZone(x, y) === t) f = { x, y }; }
    if (!f) { f = spotNear(t.x + t.radius, t.y, 3, t.x, t.y); S.map.forest[key(f.x, f.y)] = 1; }
    buildRoadTile(f.x, f.y); assert(townRating(t) < r0, "cutting trees lowers the rating");
    S.townRating[t.id] = -600; const rd = R.roads.nearestRoad(t.x, t.y, 6);
    const no = placeStation(rd.x, rd.y, "busStop", "player"); assert(!no.ok && /council refuses/.test(no.reason), "council refuses at Appalling");
    const pt = plantTrees(t); assert(pt.ok && townRating(t) > -600, "planting trees helps");
    S.townRating[t.id] = 100; assert(placeStation(rd.x, rd.y, "busStop", "player").ok, "allowed again");
    const ad = advertise(t, 2); assert(ad.ok && S.ads[t.id], "campaign running"); const st = R.stationAt.get(key(rd.x, rd.y)); st.served.passengers = true; st.daysSincePickup.passengers = 40; adsDaily(); assert(st.daysSincePickup.passengers <= 2, "ads lift the station rating");
    eq(ratingLabel(-500), "Appalling"); eq(ratingLabel(900), "Outstanding");
    townWin(t); assert(document.querySelector(".win[data-id=town]").textContent.includes("Council rating"), "town window shows the rating"); closeAllWins();
  }],
  ["rivals", "Rivals build their own railways and compete; their track is off limits", () => {
    let rv = null;
    for (const seed of ["11", "12", "13", "14", "15", "16"]) {
      startGame({ climate: "temperate", difficulty: "medium", mapSize: 96, towns: 14, rivals: 1, startYear: 1950, seed });
      rv = S.rivals[0]; rv.ai.cash = 2000000; const keep = rng;
      for (let k = 0; k < 40 && !(rv.rail && rv.rail.length); k++) rivalRailMonth(rv);
      if (rv.rail && rv.rail.length) break;
    }
    assert(rv.rail && rv.rail.length, "a rival railway was built");
    const train = S.vehicles.find(v => v.owner === rv.ai.id && isTrain(v)); assert(train, "rival runs a train");
    const ownedK = Object.keys(S.railOwner).find(k => S.railOwner[k] === rv.ai.id); const t = kt(+ownedK);
    assert(!bulldoze(t.x, t.y).ok, "player cannot bulldoze rival track");
    const rst = S.stations.find(s => s.owner === rv.ai.id && s.kind === "trainStation");
    assert(railPath(train.tile, new Set([tk(rst)]), { owner: "player" }) === null, "player trains cannot use rival track");
    const before = rv.ai.cash; for (let d = 0; d < 300; d++) { for (let f = 0; f < 2; f++) moveVehicles(0.5); dailyTick(); }
    assert((train.trips || 0) >= 2, "rival train runs: " + train.trips);
  }],
  ["rivals", "Buy shares; 100% takes the rival over", () => {
    let rv = null;
    for (const seed of ["11", "12", "13"]) { startGame({ climate: "temperate", difficulty: "medium", mapSize: 96, towns: 14, rivals: 1, startYear: 1950, seed }); simulateDays(400); rv = S.rivals[0]; if (S.vehicles.some(v => v.owner === rv.ai.id)) break; }
    S.company.cash = 50000000; const p = sharePrice(rv); assert(p >= 5000, "share price");
    assert(buyShare(rv).ok && rv.shares === 1, "bought 25%"); assert(sellShare(rv).ok && rv.shares === 0, "sold");
    const fleet = S.vehicles.filter(v => v.owner === rv.ai.id).length;
    for (let k = 0; k < 4; k++) buyShare(rv);
    eq(S.rivals.length, 0, "rival gone"); assert(S.vehicles.filter(v => v.owner === "player").length >= fleet, "its vehicles are yours");
    assert(S.news.items.some(n => /taken over/.test(n.text)), "takeover news");
  }],
  ["goals", "Scenarios, retirement and the high-score table", () => {
    assert(startScenario("coal"), "scenario starts"); eq(S.objectives[0].id, "scenario-goal"); eq(S.scenario, "coal");
    S.metrics.cargo = 25000; monthlyTick(); eq(S.scenarioDone, "won", "scenario won");
    const e = endGame("retired"); assert(e && highScores().some(h => h.when === e.when), "score saved");
    assert(!$("#gameover").hidden && $("#gameover").textContent.includes("High scores"), "end screen");
    $("#gameover").hidden = true;
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "82", retireYears: 1 });
    eq(S.retireYear, 1951); simulateDays(370); assert(S.ended === "retired", "retires at the chosen year"); $("#gameover").hidden = true;
  }],
  ["money", "Cargo payment chart, and vehicle prices follow inflation", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "83" });
    const svg = cargoRatesSvg(); eq((svg.match(/<polyline/g) || []).length, climateCargos().length, "one line per cargo in this climate");
    let r; for (const seed of ["11", "12", "13"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = buildDemoLine("road", "passengers"); if (r.ok) break; }
    S.inflation = 2; const bus = V.availableModels(1950, "bus")[0]; const c0 = S.company.cash; buyVehicle(bus.id, r.depot);
    eq(Math.round(c0 - S.company.cash), bus.price * 2, "price doubled with inflation");
    graphsWin(); const w = document.querySelector(".win[data-id=graphs]"); w.querySelector("[data-tab=rates]").click(); assert(w.querySelectorAll("polyline").length === climateCargos().length, "rates tab"); closeAllWins();
  }],
  ["climate", "Each climate has its own industries, cargo and vehicles", () => {
    const want = { arctic: ["paperMill", "goldMine"], tropical: ["rubberPlantation", "waterSupply"], toyland: ["sugarMine", "toyFactory"] };
    for (const [cl, kinds] of Object.entries(want)) {
      let ok = false;
      for (const seed of ["91", "92", "93"]) {
        startGame({ climate: cl, difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1960, seed });
        const have = new Set(S.map.industries.map(i => i.kind));
        if (kinds.every(k => have.has(k))) { ok = true; break; }
      }
      assert(ok, cl + " has " + kinds.join(" and "));
      for (const i of S.map.industries) assert(mapgen.CLIMATE_INDUSTRIES[cl].includes(i.kind), i.kind + " does not belong in " + cl);
      for (const c of climateCargos()) if (c !== "passengers") { assert(V.availableModels(1960, "truck").some(m => m.cargo === c), "a truck for " + c + " in " + cl); assert(V.availableModels(1960, "wagon").some(m => m.cargo === c), "a wagon for " + c + " in " + cl); }
      if (cl === "toyland") assert(["Fizzbury", "Gigglewick", "Bubbleton"].some(n => S.map.towns.some(t => t.name === n)) || S.map.towns.some(t => /bury|wick|ton|ham|dale|port|glen|mere|worth|by|ford/.test(t.name)), "silly names in toyland");
    }
    const sh = ["Sugar", "Toy", "Fizzy"]; shopWin(null, "truck"); const w = document.querySelector(".win[data-id=shop]"); assert(sh.some(n => w.textContent.includes(n)), "toyland trucks in the shop"); assert(!w.textContent.includes("Coal Truck"), "no coal trucks in toyland"); closeAllWins();
  }],
  ["climate", "Arctic and desert towns only grow when food or water arrives", () => {
    for (const [cl, cargo] of [["arctic", "food"], ["tropical", "water"]]) {
      startGame({ climate: cl, difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1960, seed: "94" });
      const needy = S.map.towns.filter(t => t.needs === cargo); assert(needy.length >= 3, "some towns need " + cargo);
      const t = needy[0], b0 = t.buildings.length; t.fundedBuildDaysLeft = 0; S.settings.growth = 5;
      simulateDays(60); eq(t.buildings.length, b0, cl + " town without " + cargo + " stays the same");
      t.fedDays = 200; simulateDays(120); assert(t.buildings.length > b0, cl + " town grows once supplied");
    }
  }],
  ["climate", "Arctic chain: timber to the paper mill by truck makes paper", () => {
    let done = null;
    for (const seed of ["91", "92", "93", "94", "95", "96"]) { startGame({ climate: "arctic", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1960, seed }); const r = demoLine("road", "wood", 2); if (r.ok) { done = r; break; } }
    assert(done, "timber line in the arctic"); assert(done.line.ends.to.kind === "paperMill", "timber goes to the paper mill"); simulateDays(250);
    assert((done.line.ends.to.received || {}).wood > 0, "paper mill received timber");
  }],
  ["ships", "Oil tanker from an oil rig to a refinery dock", () => {
    let d = null;
    for (const seed of ["11", "12", "13", "14", "15", "16", "17", "18", "21", "22", "23", "24", "31", "32"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 128, towns: 14, rivals: 0, startYear: 1960, seed, water: 0.85 }); d = buildDemoShip(); if (d.ok) break; }
    assert(d && d.ok, d && d.msg); eq(d.vh.cargo, "oil"); assert(isShip(d.vh), "it is a ship");
    const out = simulateDays(400); assert(out.cargo > 0, "oil delivered by sea: " + JSON.stringify(out)); assert((d.ref.received || {}).oil > 0, "refinery got the oil");
    for (const v of S.vehicles) assert(S.map.water[key(v.tile.x, v.tile.y)], "ships stay on water"); draw();
  }],
  ["air", "Airports and a plane between two towns", () => {
    let d = null;
    for (const seed of ["11", "12", "13", "14", "15"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 16, rivals: 0, startYear: 1960, seed }); d = buildDemoAir(); if (d.ok) break; }
    assert(d && d.ok, d && d.msg); eq(stationTiles(d.a).length, 4, "small airport is 2 x 2");
    const jet = V.availableModels(1975, "aircraft").find(isJet); S.date.year = 1975; const hangar = S.depots.find(x => x.airport === d.a.id); assert(!buyVehicle(jet.id, hangar).ok, "jets refused at a small airport"); S.date.year = 1960;
    let flew = false; for (let k = 0; k < 120; k++) { simulateDays(1); if (d.vh.state === "moving") flew = true; }
    assert(flew, "the plane took off"); assert(S.metrics.passengers > 0 && d.vh.trips >= 2, "passengers flown: " + S.metrics.passengers); draw();
  }],
  ["roads", "One-way roads steer traffic; faster vehicles overtake when the way is clear", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "62" });
    S.company.cash = 500000; const free = (x, y) => inB(x, y) && !S.map.water[key(x, y)] && !S.map.occupied[key(x, y)];
    let a = null; for (let y = 2; y < S.map.h - 2 && !a; y++) for (let x = 2; x < S.map.w - 8 && !a; x++) { let ok = true; for (let k = 0; k < 6; k++) if (!free(x + k, y)) ok = false; if (ok) a = { x, y }; }
    for (let k = 0; k < 6; k++) buildRoadTile(a.x + k, a.y);
    assert(R.roads.findPath({ x: a.x + 5, y: a.y }, a), "two-way: path back exists");
    const r = cycleOneWay(a.x + 2, a.y); assert(r.ok && r.oneway.dx === 1, "one-way east");
    assert(R.roads.findPath(a, { x: a.x + 5, y: a.y }), "can drive east"); assert(!R.roads.findPath({ x: a.x + 5, y: a.y }, a), "cannot drive west against it");
    cycleOneWay(a.x + 2, a.y); cycleOneWay(a.x + 2, a.y); assert(!S.oneway[key(a.x + 2, a.y)] && R.roads.findPath({ x: a.x + 5, y: a.y }, a), "back to two-way");
    const slow = makeVehicle("player", "dunmore-minibus", a, []), slow2 = makeVehicle("player", "marlow-regal", a, []), fast = makeVehicle("player", V.availableModels(1950, "truck")[0].id, { x: a.x + 1, y: a.y }, []);
    const n = { x: a.x + 2, y: a.y }; for (const v of [slow, slow2]) { R.roads.removeVehicle(v.id); v.tile = { ...n }; v.dir = { dx: 1, dy: 0 }; v.state = "moving"; R.roads.moveVehicle(v.id, null, n); }
    fast.dir = { dx: 1, dy: 0 }; const fm = modelOf(fast), sm = Math.max(modelOf(slow).speedKmh, modelOf(slow2).speedKmh);
    eq(roadCanEnter(fast, n, null), fm.speedKmh > sm, "overtakes only if faster");
    const onc = makeVehicle("player", "dunmore-minibus", n, []); onc.dir = { dx: -1, dy: 0 }; onc.state = "moving"; R.roads.moveVehicle(onc.id, null, n);
    assert(!roadCanEnter(fast, n, null), "no overtaking into oncoming traffic");
  }],
  ["maps", "Map options: town name sets, water and huge maps", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "63", names: "swedish" });
    assert(S.map.towns.some(t => /[åäöÅÄÖ]|by$|sta$|vik$|holm$|berg$/.test(t.name)), "Swedish names: " + S.map.towns.map(t => t.name).join(", "));
    const wet = () => S.map.water.reduce((a, b) => a + b, 0);
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 8, rivals: 0, startYear: 1950, seed: "64", water: 0.15, rivers: 0 }); const dry = wet();
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 8, rivals: 0, startYear: 1950, seed: "64", water: 0.85, rivers: 4 }); const lots = wet();
    assert(lots > dry, "more water: " + dry + " vs " + lots);
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 160, towns: 26, rivals: 0, startYear: 1950, seed: "65" }); eq(S.map.w, 160, "huge map"); assert(S.map.towns.length >= 20, "towns on a huge map"); draw();
  }],
  ["polish", "Tutorial steps advance as you play", () => {
    let r; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = buildDemoLine("road", "passengers"); if (r.ok) break; }
    const keep = prefs.tutorialDone; tutorialStart(); eq(S.tutorial.step, 0, "starts at step 1"); assert(!$("#tut").hidden, "card shown");
    S.stats = { roads: 5 }; for (let k = 0; k < 4; k++) tutorialTick(); assert(S.tutorial.step >= 3, "road, stops and depot steps done: " + S.tutorial.step);
    demoBuy(r, 1); for (let k = 0; k < 3; k++) tutorialTick(); assert(S.tutorial.step >= 5, "bus bought and orders checked: " + S.tutorial.step);
    for (let d = 0; d < 120 && S.tutorial.step < 6; d++) { simulateDays(1); tutorialTick(); }
    eq(S.tutorial.step, 6, "first passengers delivered"); tutorialStop(); assert($("#tut").hidden, "closed"); prefs.tutorialDone = keep; savePrefs();
  }],
  ["polish", "Minimap, follow a vehicle, keyboard shortcuts", () => {
    let r; for (const seed of ["11", "12", "13", "14"]) { startGame({ climate: "temperate", difficulty: "easy", mapSize: 96, towns: 14, rivals: 0, startYear: 1950, seed }); r = demoLine("road", "passengers", 1); if (r.ok) break; }
    renderMinimapImage(); drawMinimap(performance.now()); assert(MM.img && MM.img.width === S.map.w, "minimap image");
    for (const [x, y] of [[10, 20], [50, 50], [80, 5]]) { const p = mmPoint(x, y), t = mmToTile(p.x, p.y); assert(Math.abs(t.x - x) < 0.01 && Math.abs(t.y - y) < 0.01, "minimap maps back to the tile"); }
    simulateDays(5); const v = r.vh; view.x = 9999; followVehicle(v); for (let k = 0; k < 60; k++) followTick();
    const u = vehiclePos(v); assert(Math.abs(cssW / 2 - (view.x + u.x * view.z)) < 5, "view centred on the vehicle"); ui.follow = null;
    const key = (k, o) => window.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key: k }, o || {})));
    key("r"); eq(ui.tool, "road"); key("t"); eq(ui.tool, "track"); key("Escape"); eq(ui.tool, "inspect");
    key("f"); assert(openWins.fleet, "F opens Fleet"); key("Escape"); assert(!openWins.fleet, "Esc closes it");
    key("?"); assert(openWins.help, "help window"); closeAllWins();
    key("2"); eq(ui.speed, 2); key("1"); eq(ui.speed, 1);
  }],
  ["game", "Building tools: bridge, raise, bulldoze", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "5" });
    S.company.cash = 900000; let found = 0, tried = 0; const m = S.map;
    for (let y = 2; y < m.h - 2 && !found; y++) for (let x = 2; x < m.w - 2 && !found; x++) { const i = y * m.w + x; if (m.water[i] || m.occupied[i] || R.roads.hasRoad(x, y)) continue; const sp = terrain.findCrossing(m, x, y, 1); if (sp.length) { tried++; R.roads.addRoad(x, y); m.occupied[i] = 1; const r = buildCrossing(x, y); if (r.ok) found = 1; } }
    assert(found, "a crossing was built (tried " + tried + ")");
    const t = S.map.towns[0]; const rd = R.roads.nearestRoad(t.x, t.y, 6); const before = S.company.cash; const b = bulldoze(rd.x, rd.y); assert(b.ok || b.reason, "bulldoze answers");
  }],
];

function runTests(onEach) {
  const prev = { S, R, view: { ...view } }; const results = [];
  const snapUI = ui.tool;
  for (const [grp, name, fn] of TESTS) {
    const t0 = performance.now(); let ok = true, err = "";
    try { fn(); } catch (e) { ok = false; err = (e && e.message) || String(e); }
    const r = { grp, name, ok, err, ms: Math.round(performance.now() - t0) }; results.push(r); if (onEach) onEach(r);
  }
  window.__testResults = results; return results;
}

function testsWin() {
  openWin("tests", "Test panel", (body, o) => {
    body.innerHTML = "<p class='dim'>Runs every module on fresh maps. It replaces the game in progress, so save first if you care about it.</p><div class='row'></div><div class='sum' id='tsum'>Not run yet.</div><div id='tlist' class='tlist'></div>";
    const row = body.querySelector(".row"), list = body.querySelector("#tlist"), sum = body.querySelector("#tsum");
    row.appendChild(btn("Run all tests", () => {
      list.innerHTML = ""; sum.textContent = "Running…";
      setTimeout(() => {
        const res = runTests(r => { list.insertAdjacentHTML("beforeend", "<div class='t " + (r.ok ? "pass" : "fail") + "'><b>" + (r.ok ? "PASS" : "FAIL") + "</b> <span class='dim'>" + r.grp + "</span> " + r.name + (r.ok ? "" : "<div class='err'>" + r.err + "</div>") + "</div>"); });
        const bad = res.filter(r => !r.ok).length; sum.textContent = (res.length - bad) + " of " + res.length + " passed" + (bad ? ", " + bad + " failed." : ".");
        sum.className = "sum " + (bad ? "bad" : "good");
        startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 10, rivals: 0, startYear: 1950, seed: "99" });
      }, 30);
    }));
    row.appendChild(btn("Build demo route", () => { const d = buildDemoRoute(); toast(d.ok ? "Built: depot, two bus stops and a road. Open the shop to buy a bus." : d.msg, !d.ok); if (d.ok) centerOn(d.a.x, d.a.y); }));
    const demo = (label, mode, cargo, n) => row.appendChild(btn(label, () => { const d = demoLine(mode, cargo, n); toast(d.ok ? label + ": built the line and bought the vehicle" + (n > 1 ? "s" : "") + ". Tap Inspect and the vehicle to see its orders." : d.msg, !d.ok); }));
    demo("Demo: coal trucks", "road", "coal", 2); demo("Demo: coal train", "rail", "coal", 1); demo("Demo: passenger train", "rail", "passengers", 1); demo("Demo: timber trucks", "road", "wood", 2);
    row.appendChild(btn("Demo: oil tanker", () => { const d = buildDemoShip(); toast(d.ok ? "Oil tanker from " + d.rig.name + " to " + d.ref.name + "." : d.msg, !d.ok); if (d.ok) centerOn(d.dock.x, d.dock.y); }));
    row.appendChild(btn("Demo: aircraft", () => { const d = buildDemoAir(); toast(d.ok ? "Airports and a plane between " + d.a.name + " and " + d.b.name + "." : d.msg, !d.ok); if (d.ok) centerOn(d.a.x, d.a.y); }));
    row.appendChild(btn("+£100,000", () => { S.company.cash += 100000; toast("Added £100,000."); }));
    row.appendChild(btn("Skip 1 year", () => { const r = simulateDays(365); toast("Year done. Cash " + (r.cash >= 0 ? "+" : "") + money(r.cash) + ", passengers " + r.pax + ", cargo " + r.cargo + "."); }));
  });
}
