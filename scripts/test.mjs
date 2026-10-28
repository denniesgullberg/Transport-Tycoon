// Opens the built game in headless Chromium, runs the in-game test suite and fails on any page error or failed test.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The artifact host adds the document skeleton when publishing, so add one for local runs.
const page = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + readFileSync(join(root, "dist/transport-co.html"), "utf8") + "</body></html>";
const file = join(mkdtempSync(join(tmpdir(), "tt-")), "index.html");
writeFileSync(file, page);

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 400, height: 780 } });
const errors = [];
tab.on("pageerror", (e) => errors.push(e.message));
await tab.goto("file://" + file);
await tab.waitForTimeout(500);
const results = await tab.evaluate(async () => {
  const out = window.__TT_DEBUG.runTests().map((r) => ({ ...r }));
  // tests that start async work register a promise; a rejection fails that test
  const pend = window.__asyncTests || [];
  const settled = await Promise.allSettled(pend);
  settled.forEach((s, i) => out.push({ grp: "async", name: "async check " + (i + 1), ok: s.status === "fulfilled", err: s.status === "rejected" ? String(s.reason && s.reason.message || s.reason) : "", ms: 0 }));
  window.__asyncTests = [];
  return out;
});
await browser.close();

for (const r of results) console.log((r.ok ? "PASS " : "FAIL ") + r.grp.padEnd(9) + r.name + (r.ok ? "" : "\n     " + r.err));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} passed` + (errors.length ? `, ${errors.length} page error(s):\n` + errors.join("\n") : ""));
process.exit(failed || errors.length ? 1 : 0);
