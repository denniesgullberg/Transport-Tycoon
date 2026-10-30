// -------------------------------------------------------- industries grow and shrink
// Every industry has a size from 1 to 5. A well served industry expands now and then, which
// raises its output and adds buildings on the map. One left alone for a long time shrinks.
// On top of that, mines, farms and wells have the odd boom or bust.
const IND_MAX_LEVEL = 5, IND_MAX_OUTPUT = 900;
const BOOM_TEXT = {
  coalMine: ["A rich new coal seam has been found at {n}.", "The coal seam at {n} is running thin."],
  goldMine: ["A new gold vein has been struck at {n}.", "The gold at {n} is running out."],
  diamondMine: ["Large diamonds found at {n}.", "{n} is finding fewer diamonds."],
  forest: ["New planting at {n} is ready to cut.", "Storms have flattened trees at {n}."],
  farm: ["A bumper harvest at {n}.", "A poor harvest at {n}."],
  oilWell: ["A new oil field is flowing at {n}.", "The oil field at {n} is drying up."],
  oilRig: ["A new well has come on stream at {n}.", "The field under {n} is running dry."],
};
function indName(i) { return i.kind.replace(/([A-Z])/g, " $1").toLowerCase(); }
function isPrimaryInd(i) { const ch = core.CHAINS[i.kind] || {}; return !!ch.out && !ch.in; }
function setOutput(i, v) { i.productionPerMonth = clamp(Math.round(v), 4, IND_MAX_OUTPUT); }

// What this industry handled last month: output for mines and farms, deliveries for factories.
function industryThroughput(i) {
  if (isPrimaryInd(i)) return i.productionPerMonth;
  const got = Object.values(i.received || {}).reduce((a, b) => a + b, 0), was = i._recLast || 0;
  i._recLast = got; return got - was;
}
function expandIndustry(i, news) {
  if ((i.level || 1) >= IND_MAX_LEVEL) return false;
  i.level = (i.level || 1) + 1;
  if (isPrimaryInd(i)) setOutput(i, i.productionPerMonth * 1.35);
  if (news) EV.addNews(S.news, S.date, "good", i.name + " is expanding. It is now size " + i.level + " of " + IND_MAX_LEVEL + ".", { x: i.x, y: i.y });
  return true;
}
function shrinkIndustry(i, news) {
  if ((i.level || 1) <= 1) return false;
  i.level--;
  if (isPrimaryInd(i)) setOutput(i, i.productionPerMonth * 0.75);
  if (news) EV.addNews(S.news, S.date, "bad", i.name + " has cut back to size " + i.level + ".", { x: i.x, y: i.y });
  return true;
}
function industryMonth() {
  for (const i of S.map.industries) {
    if (!i.level) i.level = 1;
    const prim = isPrimaryInd(i), done = industryThroughput(i);
    i.hist = (i.hist || []).concat([done]).slice(-24);
    if (prim) {
      // the station rating swings a lot from month to month, so use a running average
      const r0 = serviceRatingOf(i.id); i.rAvg = i.rAvg == null ? r0 : i.rAvg * 0.75 + r0 * 0.25; const r = i.rAvg;
      i.goodMonths = r >= 0.4 ? (i.goodMonths || 0) + 1 : 0;
      i.idleMonths = r0 < 0.05 ? (i.idleMonths || 0) + 1 : 0;
      // expands after a stretch of good service; very rarely on its own
      const p = i.goodMonths >= 6 ? 0.06 : r > 0.3 ? 0.012 : 0.003;
      if (rng() < p) { if (expandIndustry(i, true)) i.goodMonths = 0; }
      else if (i.idleMonths >= 24 && rng() < 0.04) { if (shrinkIndustry(i, true)) i.idleMonths = 0; }
      // booms and busts
      if (rng() < 0.008) {
        const up = rng() < (r > 0.5 ? 0.65 : 0.45), t = BOOM_TEXT[i.kind];
        setOutput(i, i.productionPerMonth * (up ? 1.5 + rng() * 0.5 : 0.5 + rng() * 0.2));
        const txt = t ? t[up ? 0 : 1].replace("{n}", i.name) : (up ? "Output at " + i.name + " has jumped." : "Output at " + i.name + " has dropped sharply.");
        EV.addNews(S.news, S.date, up ? "good" : "bad", txt + (up ? " Production is up by half or more." : " Production is down by a third or more."), { x: i.x, y: i.y });
      }
    } else {
      // factories and plants grow with the cargo you bring them
      const recent = i.hist.slice(-3), avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
      if (avg > 50 * i.level && rng() < 0.08) expandIndustry(i, true);
      else if (i.hist.length >= 18 && i.hist.slice(-18).every(v => v === 0) && rng() < 0.03) shrinkIndustry(i, true);
      // a bigger factory turns more of what it gets into goods
      i.bonus = 1 + (i.level - 1) * 0.1;
    }
  }
}
// Extra output from a bigger factory, added to what it made this month.
function industryBonusOutput(i) {
  const ch = core.CHAINS[i.kind] || {};
  if (!ch.in || !ch.out || !i.bonus || i.bonus <= 1) return;
  const made = i.output[ch.out] || 0; if (made) i.output[ch.out] = Math.round(made * i.bonus);
}

// Extra buildings drawn around an industry as it grows: sheds, stores and tanks.
function drawIndustryGrowth(px, py, ind, c) {
  const lv = ind.level || 1; if (lv < 2) return;
  // drawn back to front: the ones further up the screen first
  const spots = [[10, -8, 0.55, 14], [-26, 4, 0.55, 11], [24, 6, 0.6, 12], [-4, 14, 0.62, 10]].slice(0, Math.min(lv - 1, 4)).sort((a, b) => a[1] - b[1]);
  for (const [dx, dy, w, h] of spots) {
    const x = px + dx, y = py + dy, a = w * TW / 2, b = w * TH / 2;
    box(x, y, w, h, shadeC(c, 1.3), shadeC(c, 1.05), shadeC(c, 0.78));
    // a pitched metal roof
    poly([x - a, y - h, x, y - h - b, x, y - h - b - 5, x - a, y - h - 5], "#aab0b8");
    poly([x, y - h + b, x - a, y - h, x - a, y - h - 5, x, y - h + b - 5], "#c4c9cf");
    poly([x + a, y - h, x, y - h + b, x, y - h + b - 5, x + a, y - h - 5], "#8e949c");
    poly([x - a, y - h - 5, x, y - h - b - 5, x + a, y - h - 5, x, y - h + b - 5], "#b7bcc3");
  }
}

// Size, output history and what makes it grow, for the industry window.
function industryGrowthHtml(i) {
  const lv = i.level || 1, hist = (i.hist || []).slice(-12), prim = isPrimaryInd(i);
  let h = "<div class='kv'><span>Size</span><b>" + "●".repeat(lv) + "<span class='dim'>" + "●".repeat(IND_MAX_LEVEL - lv) + "</span> " + lv + " of " + IND_MAX_LEVEL + "</b></div>";
  if (hist.length >= 2) {
    const a = hist.slice(0, Math.floor(hist.length / 2)), b = hist.slice(Math.floor(hist.length / 2));
    const avg = (x) => x.reduce((p, q) => p + q, 0) / Math.max(1, x.length), d = avg(b) - avg(a);
    const trend = Math.abs(d) < Math.max(2, avg(a) * 0.05) ? "Steady" : d > 0 ? "Growing" : "Falling";
    h += "<div class='kv'><span>" + (prim ? "Output" : "Delivered") + ", last " + hist.length + " months</span><b>" + trend + "</b></div><div class='card' style='margin:6px 0'>" + spark(hist, trend === "Falling" ? "var(--bad)" : "var(--good)") + "</div>";
  }
  h += "<p class='dim small'>" + (prim ? "Keep the station rating at 40% or more for half a year and it may expand. Left unserved for two years, it shrinks." : "Deliver a steady supply and it expands. Each size makes 10% more from what it gets.") + "</p>";
  return h;
}
