# Working on Transport & Co.

All game code lives in this repo. Lovable is no longer used.

## Build, test, publish

- `npm run build` writes `dist/transport-co.html`. `npm test` builds and runs every in-game test headless; it must end with all tests passing and no page errors before anything is pushed or published.
- The game is published as the Claude artifact https://claude.ai/artifact/KtWDwLpuGxPbdiwBWdCWTV. Republish `dist/transport-co.html` to that URL after each update.
- The roadmap is https://claude.ai/artifact/BBMX6Yf6k9Cq5pLrZYuT6w (source `docs/roadmap.html`). Tick items off there when they land.
- Commit and push to `main` after each finished update, so the source is never only in a workspace.

## Code rules

- `src/engine/*.ts` are pure modules with no DOM. They are bundled to `window.TT` (see `entry.ts`).
- `src/game/*.js` share one scope inside an IIFE and are joined in the order listed in `scripts/build.mjs`.
- Add a test to `src/game/e-tests.js` for every new feature or fixed bug. Tests that need a working map try several seeds.
- Phone first: windows must fit 400 px wide, and tap targets stay at least 34 px tall.
- Raise windows with z-index, never by moving their DOM node on pointerdown (that swallows the click).
- Player-facing text is plain and short, without AI-style phrasing.
