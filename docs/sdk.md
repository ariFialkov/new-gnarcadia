# Game SDK & developer pipeline

The platform supports two kinds of games with the same SDK and upload pipeline:

- **Async score attack** (`async_score`): every entrant plays the same seeded round solo; the bracket settles when it fills or
  its window closes. No server code needed. Best starting point.
- **Realtime** (`duel`, `ffa`, `teams`, `perpetual`): an authoritative `server.js` runs on the room server; clients send inputs
  and render snapshots.

## Quick start

```bash
pnpm gnarcadia init my-game --template async      # or realtime | perpetual
cd my-game
pnpm gnarcadia dev                                # http://localhost:5180 (platform must be running: pnpm dev at repo root)
pnpm gnarcadia validate
pnpm gnarcadia publish --promote                  # company devs go live immediately; indie devs land in the review queue
```

`gnarcadia dev` serves your folder with hot reload, serves the SDK at `/sdk/gnarcadia.iife.js`, bundles `server.js` on the fly
for the realtime server, and the SDK runs in **standalone mode**: it asks the local API for a dev ticket and joins a practice
room, so you can open two browser windows (`&name=Rival`) and play yourself.

## Manifest — `gnarcadia.json`

```jsonc
{
  "id": "pong-duel",                 // slug, unique, immutable
  "name": "Pong Duel",
  "version": "1.0.0",                // bump every publish
  "developer": "Your studio",
  "category": "sports", "tags": ["1v1"],
  "entry": "index.html",             // client
  "server": "server.js",             // required for realtime formats
  "cover": "cover.svg",              // 16:9
  "orientation": "landscape", "aspect": "16:9",
  "randomness": "seeded_shared",     // or "none" — if you use randomness it MUST come from the shared seed
  "skillStatement": "Why outcomes are determined by skill (goes in the legal file).",
  "cosmeticSlots": ["skin"],
  "formats": [{
    "format": "duel", "minPlayers": 2, "maxPlayers": 2,
    "entryTiersCents": [100, 500, 1000], "rakeBps": 1000,   // 10% fee, disclosed pre-entry
    "payoutBps": [10000], "maxDurationSec": 180, "fillWaitSec": 0
  }]
}
```

Full schema: `packages/protocol/src/manifest.ts` (`GameManifestSchema`, `validateManifestInvariants`). Payout tables must sum to
10000 bps; `teams` needs `teams`; `perpetual` needs `bountyBps`; `async_score` needs `roundTimeLimitSec`.

## Client SDK (`@gnarcadia/sdk`)

```html
<script src="/sdk/gnarcadia.iife.js"></script>   <!-- served by the platform and by gnarcadia dev -->
<script>
const g = await Gnarcadia.init();      // handshake with the arcade host (falls back to standalone dev mode)
g.player   // { playerId, displayName, team?, cosmetics: { skin: "sku", ... } }
g.match    // { matchId, gameId, format, seed, entryCents, currency, rakeBps, maxPlayers, practice, timeLimitSec, startedAt, realtime? }
g.random   // SeededRandom from match.seed — use for ALL randomness (same for every entrant)
g.ready(); g.loading(0.5); g.track("level_up"); g.onPause(fn); g.onTerminate(fn); g.timeRemainingMs
// async_score
g.logInput({ x, y });           // optional, feeds the anti-cheat replay fingerprint
await g.submitScore(1234);      // once per round
g.gameOver(); g.exit();
// realtime
const rt = await g.realtime();  // RealtimeClient (auto-reconnects while the match is live)
rt.on("state", (state, tick) => render(state));
rt.on("phase", (phase, countdownEndsAt) => ...);        // waiting | countdown | playing | ended
rt.on("event", (name, data) => ...); rt.on("private", (name, data) => ...);
rt.on("results", (results, settlement) => ...); rt.on("bounty", (pid, bounty, bank) => ...);
rt.send({ y: 42 }); rt.leave(); rt.players; rt.latencyMs; rt.playerId
</script>
```

ESM: `import { Gnarcadia } from "@gnarcadia/sdk"`. Types ship with the package.

## Server module (`server.js`) — realtime formats

Plain ESM, default-exporting a game definition. `defineGame()` from `@gnarcadia/sdk-server` is an optional typed identity; the
CLI bundles any imports with esbuild on `pack`/`publish`.

```js
export default {
  tickRate: 20, snapshotRate: 10,
  create(ctx) { return { /* your state */ }; },
  onJoin(state, player, ctx) {},                 // player: { playerId, displayName, team?, cosmetics, bountyCents, bankCents }
  onLeave(state, player, reason, ctx) {},
  onInput(state, player, input, ctx) { if (!valid(input)) throw new Error("bad"); /* apply */ },
  onTick(state, dtMs, ctx) { /* simulate; ctx.eliminate(victimId, killerId); ctx.end(results) */ },
  rank(state, ctx) { return [{ playerId, rank: 1, score }]; },   // used at time-up / last-standing / ctx.end()
  serialize(state, forPlayerId, ctx) { return state; },         // per-player snapshots (omit secrets)
};
```

`ctx`: `roomId, matchId, format, config, seed, random, players, phase, now(), broadcast(name, data), sendTo(pid, name, data),
eliminate(victim, by?), end(results?), log()`. The runtime handles phases, fill timers, countdown, reconnection, bounty/bank
accounting for perpetual lobbies, forfeits, and hard stops. See `packages/sdk-server/src/runtime.ts` and the examples.

Format semantics:

| format | starts when | ends when | payout |
|---|---|---|---|
| duel / ffa | full, or `minPlayers` + `fillWaitSec` | `ctx.end()`, one player left, or `maxDurationSec` | `payoutBps` by rank, ties split |
| teams | same | same | winning team splits the net pool |
| perpetual | first player | never (idle close) | per-player cash-outs; eliminations transfer `bountyBps` of the victim's bounty |
| async_score | first entrant | bracket full & all submitted, or window closed | `payoutBps` by score rank; non-submitters forfeit |

## Rules every game must follow (legal + fairness)

1. No randomness outside `g.random` / `ctx.random` (shared seed). Declare `randomness` honestly.
2. No pay-to-win: cosmetics change looks only. Read `player.cosmetics[slot]` and render; never alter mechanics.
3. Server decides outcomes for realtime formats; async games must call `logInput` for meaningful actions.
4. Disclose nothing about other players beyond what the host gives you; never ask for personal data in-game.
5. Keep bundles small (< 10 MB ideal, 150 MB hard cap), no external network calls except assets on your own CDN.
6. Respect `pause`/`terminate`, `reducedMotion`, and portrait/landscape per your manifest.

## Pipeline & review

`publish` = register (`POST /dev/games`) → upload zip (`POST /dev/games/:id/versions`, manifest validated, zip-slip and file-type
checks, 150 MB cap) → `promote`. Company developers (header `X-Dev-Key`) self-promote; accounts with the `developer` role go to
`status: review` and an admin approves in the analytics hub (Games → review queue) or `POST /admin/games/:id/review`.
Versions are immutable; roll back by promoting an older version. Bundles are served at `/g/:id/:version/`.

## Unity

See `sdk/unity/README.md` — a reference WebGL bridge implementing the same postMessage protocol.
