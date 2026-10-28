# Transport & Co.

A Transport Tycoon Deluxe style transport game that runs in the browser as one HTML file. Build roads and railways, run buses, trucks and trains between towns and industries, and grow a company against rival firms.

Play it: open `dist/transport-co.html` in a browser, or the published Claude artifact.

## What's in the game

- Random maps from a seed: 4 climates, towns with their own layouts, lakes, rivers, hills, forests and industries
- Roads, bus and truck stops, depots, railway track, train stations, train depots, bridges, tunnels, raising and lowering land
- 9 buses, 18 trucks (one for every cargo), 12 locomotives and 21 wagons across three eras
- Industry chains: coal to power stations and steel mills, timber to sawmills, grain and steel to factories, goods to towns
- Fleet window with orders per stop: load what's available, wait for a full load, or skip loading
- Finances, loans, inflation, graphs, news, objectives, performance rating, breakdowns and servicing
- Up to 3 rival companies, save and load with autosave, and a built-in test panel

## Layout

```
src/engine/   TypeScript game rules, no DOM: economy, vehicles, map generation, terrain,
              roads, rail signals, stations, orders, events, saves, AI rivals, sound
src/game/     The playable game: state and ticks, rendering, windows, fleet and orders,
              menus and main loop, and the test suite (plain JS, joined in this order)
scripts/      build.mjs makes dist/transport-co.html, test.mjs runs the tests headless
dist/         The built game, ready to open or publish
docs/         roadmap.html: what works and the update list
```

## Build and test

```
npm install
npx playwright install chromium   # first time only
npm run build
npm test
```

The test suite also runs inside the game: Menu, then Test panel, then Run all tests.
