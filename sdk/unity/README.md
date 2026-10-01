# Unity WebGL bridge (reference)

JavaScript games are Gnarcadia's primary target, but Unity WebGL builds can run in the arcade through the same
iframe protocol. Copy `GnarcadiaBridge.jslib` to `Assets/Plugins/WebGL/` and `GnarcadiaSDK.cs` onto a GameObject
named `Gnarcadia`. Build for WebGL, put `gnarcadia.json` (manifest) at the root of the build folder next to
`index.html`, then `gnarcadia publish`.

- Use `GnarcadiaSDK.Instance.Random` for every random decision (seeded identically for all entrants).
- `async_score`: call `SubmitScore(score)` once, then `GameOver()`.
- Realtime formats: `RequestRealtimeTicket()` → connect a WebSocket to `match.realtime.url` and speak the protocol in
  `packages/protocol/src/realtime.ts` (`{t:"join",ticket}`, `{t:"input",seq,data}`, …). Server logic is still JavaScript
  (`server.js`); Unity is only the client.
- Keep WebGL builds under ~30 MB compressed for mobile load times; set `Compression Format: Brotli`.
