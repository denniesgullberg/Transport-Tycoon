// Builds dist/transport-co.html: the engine (TypeScript, bundled to window.TT) plus the game parts, in one file.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const game = (f) => readFileSync(join(root, "src/game", f), "utf8");

// Order matters: later parts use functions from earlier ones.
const PARTS = ["a-state.js", "a2-rail.js", "a3-content.js", "b-render.js", "c-ui.js", "c2-fleet.js", "c3-tools.js", "c4-vehicles.js", "c5-world.js", "c6-polish.js", "c7-online.js", "d-main.js", "e-tests.js"];

const res = await build({ entryPoints: [join(root, "src/engine/entry.ts")], bundle: true, format: "iife", write: false, logLevel: "warning" });
const engine = res.outputFiles[0].text;
const parts = PARTS.map(game).join("\n");

const html = `<title>Transport &amp; Co.</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${game("style.css")}</style>
${game("body.html")}
<script>${engine}</script>
<script>
(function(){
${parts}
window.__TT_DEBUG = { get S(){return S}, get R(){return R}, runTests, buildDemoRoute, demoLine, buildDemoShip, buildDemoAir, simulateDays, startGame, buyVehicle, TESTS, centerOn, view, ui, run: (src) => eval(src) };
boot();
})();
</script>
`;
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/transport-co.html"), html);
console.log("dist/transport-co.html", (html.length / 1024).toFixed(0) + " KB");
