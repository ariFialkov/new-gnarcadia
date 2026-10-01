// Gnarcadia Unity WebGL bridge (minimal). Implements the same host<->game postMessage protocol as @gnarcadia/sdk
// (packages/protocol/src/bridge.ts). Drop this file in Assets/Plugins/WebGL/ next to GnarcadiaSDK.cs.
// Status: reference implementation for Unity WebGL builds; JS games are the primary target. Verify against bridge.ts when upgrading.
mergeInto(LibraryManager.library, {
  Gnarcadia_Init: function (gameObjectNamePtr) {
    var go = UTF8ToString(gameObjectNamePtr);
    var NS = "gnarcadia";
    var post = function (m) { m.ns = NS; m.v = 1; if (window.parent && window.parent !== window) window.parent.postMessage(m, "*"); else console.info("[gnarcadia:standalone]", m); };
    window.__gnarcadiaPost = post;
    window.addEventListener("message", function (ev) {
      var m = ev.data; if (!m || m.ns !== NS) return;
      if (m.type === "init") { window.__gnarcadiaInit = m; SendMessage(go, "OnGnarcadiaInit", JSON.stringify(m)); }
      else if (m.type === "pause") SendMessage(go, "OnGnarcadiaPause", "");
      else if (m.type === "resume") SendMessage(go, "OnGnarcadiaResume", "");
      else if (m.type === "terminate") SendMessage(go, "OnGnarcadiaTerminate", m.reason || "");
      else if (m.type === "realtime_ticket") SendMessage(go, "OnGnarcadiaTicket", m.ticket || "");
    });
    post({ type: "hello", sdkVersion: "unity-0.1.0" });
    // Standalone fallback after 4s (no arcade host): fake init so the game can run in the editor/local WebGL.
    setTimeout(function () { if (!window.__gnarcadiaInit) { var q = new URLSearchParams(location.search); var init = { ns: NS, v: 1, type: "init", player: { playerId: "dev", displayName: q.get("name") || "Dev", cosmetics: {} }, match: { matchId: "dev", gameId: q.get("game") || "dev-game", gameVersion: "dev", format: q.get("format") || "async_score", seed: q.get("seed") || "dev-seed", entryCents: 0, currency: "CAD", rakeBps: 1000, maxPlayers: 2, practice: true, timeLimitSec: 300, startedAt: Date.now() }, locale: navigator.language, reducedMotion: false }; window.__gnarcadiaInit = init; SendMessage(go, "OnGnarcadiaInit", JSON.stringify(init)); } }, 4000);
  },
  Gnarcadia_Post: function (jsonPtr) { var m = JSON.parse(UTF8ToString(jsonPtr)); if (window.__gnarcadiaPost) window.__gnarcadiaPost(m); },
});
