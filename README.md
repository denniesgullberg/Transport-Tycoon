# Transport & Co.

A Transport Tycoon Deluxe style transport game that runs in the browser as one HTML file. Build roads and railways, run buses, trucks and trains between towns and industries, and grow a company against rival firms.

Play it: open `dist/transport-co.html` in a browser, or the published Claude artifact.

## What's in the game

- Random maps from a seed in four climates, each with its own industries and cargo (22 cargo types). Water, rivers, size up to 160 x 160, and English, Swedish, German, French or silly town names
- Roads, one-way roads, bus and truck stops with several bays, depots, railway track, level crossings, signals, electrification, multi-tile stations, docks, shipyards, small and city airports, bridges, tunnels, raising and lowering land, undo
- Buses, trucks for every cargo, locomotives with wagons for every cargo, ships (ferries, freighters, bulk carriers, oil tankers) and aircraft (propeller, mail, jets)
- Trains several tiles long that reserve track and wait at red signals; passing loops; stuck trains are reported
- Industry chains per climate; snow towns need food and desert towns need water to grow; oil rigs at sea
- Fleet window with orders per stop (load what's available, full load, no loading), start, stop, clone, refit, autorenew and autoreplace
- Town councils that rate your company, advertising and tree planting; rival companies that build roads and railways; buying shares and taking rivals over
- Finances, loans, inflation, graphs, cargo payment chart, news, objectives, scenarios, retirement with a score and high-score table
- Save slots, autosave, export and import, settings with music, a first-game tutorial, a minimap, follow a vehicle, keyboard shortcuts, and a desktop layout

## Layout

```
src/engine/   TypeScript game rules, no DOM: economy, vehicles, map generation, terrain,
              roads, rail signals, stations, orders, events, saves, AI rivals, sound
src/game/     The playable game in plain JS, joined in the order listed in scripts/build.mjs:
              a-state (state, vehicles, ticks), a2-rail (track reservation, signals),
              a3-content (climates, ships, aircraft, one-way roads), b-render (drawing),
              c-ui (input, tools, windows), c2-fleet (orders, fleet), c3-tools (settings,
              saves, undo), c4-vehicles (start/stop, renew, refit, stations), c5-world
              (towns, rivals, shares, scenarios), c6-polish (tutorial, minimap, keys),
              d-main (menus, main loop, demos), e-tests (the test suite)
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

The test suite also runs inside the game: Menu, then Test panel, then Run all tests. The test panel also has demo buttons that build a working line for each kind of transport.

`npm run typecheck` checks the engine modules with TypeScript.
