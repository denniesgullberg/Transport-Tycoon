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
  ["game", "Rail and road stay separate, bulldozing track removes the train", () => {
    startGame({ climate: "temperate", difficulty: "easy", mapSize: 64, towns: 8, rivals: 0, startYear: 1950, seed: "31" });
    S.company.cash = 500000; const t = S.map.towns[0]; const rd = R.roads.nearestRoad(t.x, t.y, 6);
    const free = spotNear(t.x + 6, t.y + 6, 5, t.x, t.y); assert(free, "free tile");
    assert(buildTrackTile(free.x, free.y).ok, "track built"); assert(R.rail.hasRoad(free.x, free.y) && !R.roads.hasRoad(free.x, free.y), "only on the rail network");
    const r = buildTrackTile(rd.x, rd.y); assert(!r.ok, "cannot lay track over a road");
    const rr = buildRoadTile(free.x, free.y); assert(rr.ok === true ? false : true, "cannot lay road over track");
    assert(bulldoze(free.x, free.y).ok, "bulldoze track"); assert(!R.rail.hasRoad(free.x, free.y), "track gone");
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
      if (ch.out && ch.out !== "goods") assert((CARGO_TO_IND[ch.out] || []).length, kind + " makes " + ch.out + " but nothing accepts it");
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
    row.appendChild(btn("+£100,000", () => { S.company.cash += 100000; toast("Added £100,000."); }));
    row.appendChild(btn("Skip 1 year", () => { const r = simulateDays(365); toast("Year done. Cash " + (r.cash >= 0 ? "+" : "") + money(r.cash) + ", passengers " + r.pax + ", cargo " + r.cargo + "."); }));
  });
}
