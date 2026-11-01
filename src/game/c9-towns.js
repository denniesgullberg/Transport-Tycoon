// -------------------------------------------------------------- towns modernise
// Old buildings are pulled down and rebuilt as the years go by. Houses near the middle of a busy
// town become flats, flats become towers, and from 1975 the biggest towns get skyscrapers. Each
// building remembers the year it was built, and is drawn in the style of that time.
const ERA = (y) => y < 1965 ? 0 : y < 1990 ? 1 : 2;   // 0 old, 1 post-war, 2 modern
function bldCapacity(b) { return (b.floors || 1) * ({ house: 3, shop: 5, apartments: 6, tower: 7, church: 2, skyscraper: 8 }[b.kind] || 3) * 3; }

// What a building on this spot can become in this year, or null to leave it.
function nextBuilding(t, b, year) {
  const d = Math.hypot(b.x - t.x, b.y - t.y) / Math.max(4, t.radius), pop = t.population;
  if (b.kind === "church") return null;
  if (b.kind === "house" && year >= 1958 && pop > 500 && d < 0.55) return { kind: "apartments", floors: 3 + Math.floor(rng() * 3) };
  if (b.kind === "shop" && year >= 1960 && pop > 700 && d < 0.4) return { kind: "apartments", floors: 4 + Math.floor(rng() * 3) };
  if (b.kind === "apartments" && year >= 1968 && pop > 1400 && d < 0.4) return { kind: "tower", floors: 5 + Math.floor(rng() * 5) };
  if (b.kind === "tower" && year >= 1975 && pop > 2600 && d < 0.3) return { kind: "skyscraper", floors: Math.min(40, 10 + Math.floor((year - 1975) / 3) + Math.floor(rng() * 8)) };
  if (b.kind === "skyscraper" && year - (b.built || 0) > 25) return { kind: "skyscraper", floors: Math.min(40, b.floors + 4 + Math.floor(rng() * 6)) };
  // anything old enough is rebuilt in the current style, same use, maybe a floor taller
  if (ERA(b.built || 1900) < ERA(year) && year - (b.built || 1900) > 20) return { kind: b.kind, floors: b.kind === "house" ? Math.min(2, b.floors + (rng() < 0.4 ? 1 : 0)) : b.floors + (rng() < 0.5 ? 1 : 0) };
  return null;
}
function rebuild(t, b, nb, year, news) {
  const before = bldCapacity(b), wasTall = t.buildings.some(x => x.kind === "skyscraper");
  b.kind = nb.kind; b.floors = nb.floors; b.built = year;
  t.population = Math.max(60, t.population + Math.round((bldCapacity(b) - before) * 1.5));
  if (news && b.kind === "skyscraper" && !wasTall) EV.addNews(S.news, S.date, "good", t.name + " has its first skyscraper, " + b.floors + " floors high.", { x: b.x, y: b.y });
}
// A few rebuilds a month in each town; bigger, faster growing towns change faster.
function redevelopTown(t, year, tries, news) {
  if (!t.buildings.length) return 0;
  let n = 0;
  for (let k = 0; k < tries; k++) {
    const b = t.buildings[Math.floor(rng() * t.buildings.length)];
    const nb = nextBuilding(t, b, year); if (!nb) continue;
    rebuild(t, b, nb, year, news); n++;
  }
  return n;
}
function redevelopMonth() {
  const year = S.date.year;
  for (const t of S.map.towns) if (rng() < Math.min(0.9, 0.15 + t.population / 6000)) redevelopTown(t, year, 1 + Math.floor(t.population / 1500), true);
}
// A game that starts late gets towns that have already been rebuilt over the years before it.
function townsCatchUp() {
  const y0 = S.startYear;
  for (const t of S.map.towns) for (const b of t.buildings) b.built = y0 - 5 - Math.floor(rng() * 40);
  for (let y = 1950; y < y0; y += 2) for (const t of S.map.towns) redevelopTown(t, y, 2 + Math.floor(t.population / 800), false);
}

// ------------------------------------------------------------ drawing
const MODERN_WALL = [["#f4f5f2", "#d9dcd8"], ["#e7e2d8", "#c9c3b6"], ["#dfe6ea", "#bcc6cc"], ["#3b4048", "#2c3036"]];
const GLASS = [["#7fb2d6", "#5689ad", "#2f5876"], ["#8fc7c2", "#5f9c97", "#356b67"], ["#9aa7b8", "#6b7a8e", "#3e4a5a"], ["#c9b38f", "#a08a68", "#5e4f38"]];
function drawSkyscraper(px, py, b, x, y, night) {
  const g = GLASS[Math.floor(hash(x + 3, y + 9) * GLASS.length)], h = 14 + b.floors * 5.2, wt = 0.66;
  const a = wt * TW / 2, bb = wt * TH / 2, setback = b.floors >= 20;
  const lower = setback ? h * 0.7 : h;
  box(px, py, wt, lower, g[0], g[0], g[1]);
  if (setback) box(px, py - lower, wt * 0.72, h - lower, g[0], g[0], g[1]);
  // floor bands of glass, lit at night
  const step = 5.2;
  for (let f = 1; f < Math.floor(lower / step); f++) {
    const z = f * step, lit = night > 0.25 && hash(x * 13 + f, y * 7) > 0.4;
    ctx.strokeStyle = lit ? "rgba(255,214,130,.9)" : "rgba(255,255,255,.22)"; ctx.lineWidth = lit ? 1.6 : 0.8;
    ctx.beginPath(); ctx.moveTo(px - a, py - z); ctx.lineTo(px, py + bb - z); ctx.lineTo(px + a, py - z); ctx.stroke();
  }
  // a sky reflection down the lit face
  ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.beginPath(); ctx.moveTo(px - a * 0.7, py + bb * 0.3 - 2); ctx.lineTo(px - a * 0.45, py + bb * 0.55 - 2); ctx.lineTo(px - a * 0.45, py + bb * 0.55 - lower + 4); ctx.lineTo(px - a * 0.7, py + bb * 0.3 - lower + 4); ctx.fill();
  ctx.fillStyle = "#444a52"; ctx.fillRect(px - 0.8, py - h - 14, 1.6, 14);
  R.lights.push([px, py - h - 14, 6, 0.95, "#ff4a3a"]);
  if (night > 0.25) R.lights.push([px - a / 2, py - lower / 2, 14, 0.35]);
}
// Houses and flats built after 1965 have flat roofs and bigger windows; after 1990 they are white or dark
// with long glass bands.
function drawModern(px, py, b, x, y, night) {
  const era = ERA(b.built || 1900); if (era === 0) return false;
  const wt = b.kind === "tower" ? 0.68 : 0.74, a = wt * TW / 2, bb = wt * TH / 2;
  const hh = b.kind === "tower" ? 12 + b.floors * 6 : b.kind === "apartments" ? 6 + b.floors * 5 : b.kind === "church" ? 11 : 5 + b.floors * 4.5;
  if (b.kind === "church") return false;
  const wall = era === 2 ? MODERN_WALL[Math.floor(hash(x, y + 5) * MODERN_WALL.length)] : [["#d8d2c4", "#b9b2a3"], ["#cfc6b4", "#aea591"], ["#c8cdd0", "#a6adb2"]][Math.floor(hash(x, y + 5) * 3)];
  box(px, py, wt, hh, shadeC(wall[0], 0.94), wall[0], wall[1]);
  const lit = night > 0.25, dark = wall[0] === "#3b4048";
  const glassL = dark ? "rgba(140,190,225,.8)" : "rgba(42,64,86,.6)", glassR = dark ? "rgba(110,160,200,.75)" : "rgba(30,48,66,.68)";
  const floors = b.kind === "house" ? Math.max(1, b.floors) : b.kind === "tower" ? b.floors + 2 : b.floors, step = (hh - 2) / floors;
  for (let f = 0; f < floors; f++) {
    const z0 = 1.5 + f * step, z1 = z0 + step * (era === 2 ? 0.62 : 0.5);
    const on = lit && hash(x * 5 + f, y * 3) > 0.35;
    if (era === 2) {   // long ribbon windows
      const m1 = winQuad(px, py, a, bb, "l", 0.08, 0.92, z0, z1, on ? "#ffd27a" : glassL); winQuad(px, py, a, bb, "r", 0.08, 0.92, z0, z1, on && hash(y, x + f) > 0.5 ? "#ffd27a" : glassR);
      if (on && LOD === 2 && R.lights.length < 500) R.lights.push([m1[0], m1[1], 8, 0.45]);
    } else {            // post-war: rows of square windows and a concrete band under each floor
      for (const [u0, u1] of [[0.12, 0.32], [0.42, 0.6], [0.7, 0.88]]) { winQuad(px, py, a, bb, "l", u0, u1, z0, z1, on ? "#ffd27a" : glassL); winQuad(px, py, a, bb, "r", u0, u1, z0, z1, glassR); }
      if (b.kind !== "house") winQuad(px, py, a, bb, "l", 0, 1, z0 - 0.8, z0 - 0.2, "rgba(0,0,0,.12)");
    }
  }
  // flat roof with a parapet, and a roof box on the bigger ones
  diamond(px, py - hh, shadeC(wall[0], era === 2 ? 0.86 : 0.8), wt * 0.86);
  if (b.kind !== "house") box(px + 3, py - hh, 0.18, 3, "#9aa0a6", "#8a9096", "#6e747a");
  if (era === 2 && b.kind === "house") { ctx.fillStyle = "rgba(40,60,90,.55)"; poly([px - a * 0.5, py - hh - bb * 0.2, px, py - hh + bb * 0.2, px, py - hh + bb * 0.2 - 0.1, px - a * 0.5, py - hh - bb * 0.2], "rgba(40,60,90,.55)"); }
  return true;
}
