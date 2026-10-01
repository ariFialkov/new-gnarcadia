/**
 * @gnarcadia/sdk — the only thing a game needs to run inside the Gnarcadia arcade.
 *
 *   import { Gnarcadia } from "@gnarcadia/sdk";            // bundlers
 *   <script src="https://gnarcadia.com/sdk/gnarcadia.iife.js"></script>  // plain JS -> window.Gnarcadia
 *
 *   const g = await Gnarcadia.init();
 *   g.match.seed, g.player.displayName, g.random.int(1, 6) ...
 *   await g.submitScore(1234);                 // async_score format
 *   const rt = await g.realtime();             // realtime formats
 *   rt.on("state", (s) => render(s)); rt.send({ dir: "left" });
 */
// Subpath imports keep zod (manifest schemas) out of the browser bundle.
import { BRIDGE_NS, isBridgeMessage, type HostToGame, type GameToHost, type BridgePlayerInfo, type BridgeMatchInfo } from "@gnarcadia/protocol/bridge";
import { SeededRandom, hashInputLog } from "@gnarcadia/protocol/rng";
import { RealtimeClient } from "./realtime.js";

export { SeededRandom, hashInputLog, RealtimeClient };
export type { BridgePlayerInfo, BridgeMatchInfo };

export const SDK_VERSION = "0.1.0";

export interface InitOptions {
  /** Max ms to wait for the host handshake before falling back to standalone dev mode. */
  handshakeTimeoutMs?: number;
  /** Force standalone mode (local testing without the arcade). */
  standalone?: boolean | Partial<StandaloneConfig>;
}

export interface StandaloneConfig {
  apiUrl: string;          // local API for dev tickets (default http://localhost:4000)
  gameId: string;
  format: string;
  displayName: string;
  seed: string;
  players: number;
}

type Listener<T> = (payload: T) => void;

export class GnarcadiaSession {
  readonly player: BridgePlayerInfo;
  readonly match: BridgeMatchInfo;
  readonly locale: string;
  readonly reducedMotion: boolean;
  /** Deterministic RNG seeded by the match seed. Use this for ALL randomness. */
  readonly random: SeededRandom;
  /** True when running outside the arcade (local dev). */
  readonly standalone: boolean;
  private paused = false;
  private pauseListeners = new Set<Listener<boolean>>();
  private terminateListeners = new Set<Listener<string>>();
  private rt: RealtimeClient | null = null;
  private inputLog: unknown[] = [];
  private scoreSubmitted = false;
  private standaloneCfg: StandaloneConfig | null;

  constructor(init: Extract<HostToGame, { type: "init" }>, standaloneCfg: StandaloneConfig | null) {
    this.player = init.player; this.match = init.match; this.locale = init.locale; this.reducedMotion = init.reducedMotion;
    this.random = new SeededRandom(init.match.seed);
    this.standalone = !!standaloneCfg; this.standaloneCfg = standaloneCfg;
    window.addEventListener("message", (ev) => {
      const m = ev.data; if (!isBridgeMessage(m)) return;
      if (m.type === "pause") { this.paused = true; this.pauseListeners.forEach((f) => f(true)); }
      if (m.type === "resume") { this.paused = false; this.pauseListeners.forEach((f) => f(false)); }
      if (m.type === "terminate") this.terminateListeners.forEach((f) => f((m as any).reason));
    });
  }

  get isPaused() { return this.paused; }
  /** Milliseconds remaining in the round/match according to the host clock. */
  get timeRemainingMs() { return Math.max(0, this.match.startedAt + this.match.timeLimitSec * 1000 - Date.now()); }

  onPause(fn: Listener<boolean>) { this.pauseListeners.add(fn); return () => this.pauseListeners.delete(fn); }
  onTerminate(fn: Listener<string>) { this.terminateListeners.add(fn); return () => this.terminateListeners.delete(fn); }

  /** Tell the host the game has loaded and is ready to show. Call once your first frame can render. */
  ready() { post({ type: "ready" }); }
  loading(progress: number) { post({ type: "loading", progress: Math.max(0, Math.min(1, progress)) }); }

  /** Record a player input for the replay/anti-cheat log (async_score games). Keep entries small. */
  logInput(entry: unknown) { if (this.inputLog.length < 50_000) this.inputLog.push([Date.now() - this.match.startedAt, entry]); }

  /**
   * async_score: submit the final score. Can only be called once per round. The host forwards it to the
   * API with the input-log fingerprint for anti-cheat verification.
   */
  async submitScore(score: number, opts: { includeInputLog?: boolean } = {}) {
    if (this.scoreSubmitted) throw new Error("score already submitted for this round");
    if (!Number.isFinite(score)) throw new Error("score must be a finite number");
    this.scoreSubmitted = true;
    const durationMs = Date.now() - this.match.startedAt;
    post({ type: "submit_score", score, durationMs, inputLogHash: hashInputLog(this.inputLog), inputLog: opts.includeInputLog === false ? undefined : this.inputLog.slice(0, 5000) });
  }

  /** Signal the end of the game to the host (shows the results overlay). */
  gameOver(summary?: Record<string, unknown>) { post({ type: "game_over", summary }); }
  /** Ask the host to close the game (back to the arcade). */
  exit() { post({ type: "request_exit" }); }
  /** Lightweight analytics event, attributed to the match. */
  track(event: string, props?: Record<string, unknown>) { post({ type: "analytics", event, props }); }

  /**
   * Realtime formats (duel/ffa/teams/perpetual): connect to the authoritative room server.
   * The ticket is obtained from the host so game code never handles user credentials.
   */
  async realtime(): Promise<RealtimeClient> {
    if (this.rt) return this.rt;
    if (!this.match.realtime) throw new Error(`format '${this.match.format}' is not a realtime format`);
    const ticket = await this.obtainTicket();
    this.rt = new RealtimeClient(this.match.realtime.url, ticket);
    await this.rt.connect();
    return this.rt;
  }

  private async obtainTicket(): Promise<string> {
    if (this.standaloneCfg) {
      const r = await fetch(`${this.standaloneCfg.apiUrl}/dev/tickets`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: this.standaloneCfg.gameId, format: this.standaloneCfg.format, displayName: this.standaloneCfg.displayName, matchId: this.match.matchId }),
      });
      if (!r.ok) throw new Error(`dev ticket failed: ${r.status} ${await r.text()}`);
      const j = await r.json(); return j.ticket;
    }
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("host did not provide realtime ticket")), 10_000);
      const onMsg = (ev: MessageEvent) => {
        const m = ev.data; if (!isBridgeMessage(m) || m.type !== "realtime_ticket") return;
        clearTimeout(timer); window.removeEventListener("message", onMsg); resolve((m as any).ticket);
      };
      window.addEventListener("message", onMsg);
      post({ type: "request_realtime_ticket" });
    });
  }
}

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
function post(m: DistributiveOmit<GameToHost, "ns" | "v">) {
  const full = { ns: BRIDGE_NS, v: 1 as const, ...m } as GameToHost;
  if (window.parent && window.parent !== window) window.parent.postMessage(full, "*");
  else if ((window as any).__gnarcadiaStandaloneSink) (window as any).__gnarcadiaStandaloneSink(full);
}

let sessionPromise: Promise<GnarcadiaSession> | null = null;

async function init(opts: InitOptions = {}): Promise<GnarcadiaSession> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const inIframe = window.parent && window.parent !== window;
    const forceStandalone = !!opts.standalone;
    if (inIframe && !forceStandalone) {
      const initMsg = await handshake(opts.handshakeTimeoutMs ?? 4000).catch(() => null);
      if (initMsg) return new GnarcadiaSession(initMsg, null);
      console.warn("[gnarcadia] no host handshake — falling back to standalone dev mode");
    }
    const cfg = standaloneConfig(typeof opts.standalone === "object" ? opts.standalone : {});
    const fake: Extract<HostToGame, { type: "init" }> = {
      ns: BRIDGE_NS, v: 1, type: "init",
      player: { playerId: "dev-" + Math.random().toString(36).slice(2, 8), displayName: cfg.displayName, cosmetics: {} },
      match: {
        matchId: new URLSearchParams(location.search).get("match") ?? "dev-match-" + cfg.seed,
        gameId: cfg.gameId, gameVersion: "dev", format: cfg.format, seed: cfg.seed, entryCents: 0, currency: "CAD", rakeBps: 1000,
        maxPlayers: cfg.players, practice: true, timeLimitSec: 300, startedAt: Date.now(),
        realtime: ["duel", "ffa", "teams", "perpetual"].includes(cfg.format) ? { url: cfg.apiUrl.replace(/^http/, "ws").replace(/:\d+$/, ":4100"), roomId: "dev" } : undefined,
      },
      locale: navigator.language, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    (window as any).__gnarcadiaStandaloneSink = (m: GameToHost) => console.info("[gnarcadia:standalone] ->host", m);
    const s = new GnarcadiaSession(fake, cfg);
    console.info("%c[gnarcadia] standalone dev session", "color:#ff4fa3;font-weight:bold", { player: s.player, match: s.match });
    return s;
  })();
  return sessionPromise;
}

function handshake(timeoutMs: number): Promise<Extract<HostToGame, { type: "init" }>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener("message", onMsg); reject(new Error("handshake timeout")); }, timeoutMs);
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data; if (!isBridgeMessage(m) || m.type !== "init") return;
      clearTimeout(timer); window.removeEventListener("message", onMsg); resolve(m as any);
    };
    window.addEventListener("message", onMsg);
    post({ type: "hello", sdkVersion: SDK_VERSION });
  });
}

function standaloneConfig(over: Partial<StandaloneConfig>): StandaloneConfig {
  const q = new URLSearchParams(location.search);
  return {
    apiUrl: over.apiUrl ?? q.get("api") ?? "http://localhost:4000",
    gameId: over.gameId ?? q.get("game") ?? "dev-game",
    format: over.format ?? q.get("format") ?? "async_score",
    displayName: over.displayName ?? q.get("name") ?? "Dev Player",
    seed: over.seed ?? q.get("seed") ?? "dev-seed",
    players: over.players ?? Number(q.get("players") ?? 2),
  };
}

export const Gnarcadia = { init, SDK_VERSION, SeededRandom, hashInputLog, RealtimeClient };
export default Gnarcadia;
