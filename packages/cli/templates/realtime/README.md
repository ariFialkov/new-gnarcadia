# __GAME_NAME__

Scaffolded with `gnarcadia init`. Files:

- `gnarcadia.json` — the manifest (id, version, formats, entry fees, rake, skill statement). Bump `version` on every publish.
- `index.html` — your game client. Loads the SDK from `/sdk/gnarcadia.iife.js` (served by the platform and by `gnarcadia dev`).
- `server.js` — (realtime/perpetual only) authoritative server logic: `export default { create, onJoin, onInput, onTick, rank, serialize }`.
- `cover.svg` — 16:9 cover shown in the arcade.

Run locally (needs the platform running: `pnpm dev` at the repo root):

    gnarcadia dev            # http://localhost:5180 — hot reload; the SDK runs in standalone mode and talks to the local API
    gnarcadia validate
    gnarcadia publish --promote

Docs: docs/sdk.md in the platform repo.
