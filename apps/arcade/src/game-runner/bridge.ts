/**
 * HOST side of the Gnarcadia bridge (packages/protocol/src/bridge.ts).
 * The game runs in a sandboxed iframe on the API origin; we only ever talk through postMessage.
 * The realtime ticket is sent ONLY in response to `request_realtime_ticket`, never inside `init`.
 */
import { BRIDGE_NS, isBridgeMessage, type GameToHost, type HostToGame, type BridgeMatchInfo, type BridgePlayerInfo } from "@gnarcadia/protocol";

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type HostMessage = DistributiveOmit<HostToGame, "ns" | "v">;
export type GameMessage = GameToHost;

export interface BridgeHandlers {
  onHello?: (sdkVersion: string) => void;
  onReady?: () => void;
  onLoading?: (progress: number) => void;
  onRequestTicket?: () => void;
  onSubmitScore?: (m: Extract<GameToHost, { type: "submit_score" }>) => void;
  onGameOver?: (summary?: Record<string, unknown>) => void;
  onRequestExit?: () => void;
  onAnalytics?: (event: string, props?: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  onPing?: (t: number) => void;
}

export class HostBridge {
  private listener: ((ev: MessageEvent) => void) | null = null;
  constructor(private iframe: HTMLIFrameElement, private targetOrigin: string, private handlers: BridgeHandlers) {}

  attach() {
    this.listener = (ev: MessageEvent) => {
      if (ev.source !== this.iframe.contentWindow) return;           // only our iframe
      if (this.targetOrigin !== "*" && ev.origin !== this.targetOrigin) return; // only the game origin
      const m = ev.data;
      if (!isBridgeMessage(m)) return;
      const g = m as GameToHost;
      const h = this.handlers;
      switch (g.type) {
        case "hello": h.onHello?.(g.sdkVersion); break;
        case "ready": h.onReady?.(); break;
        case "loading": h.onLoading?.(Math.max(0, Math.min(1, Number(g.progress) || 0))); break;
        case "request_realtime_ticket": h.onRequestTicket?.(); break;
        case "submit_score": h.onSubmitScore?.(g); break;
        case "game_over": h.onGameOver?.(g.summary); break;
        case "request_exit": h.onRequestExit?.(); break;
        case "analytics": h.onAnalytics?.(g.event, g.props); break;
        case "error": h.onError?.(String(g.message ?? "Unknown game error")); break;
        case "ping": this.post({ type: "pong", t: g.t }); h.onPing?.(g.t); break;
        default: break;
      }
    };
    window.addEventListener("message", this.listener);
  }
  detach() { if (this.listener) window.removeEventListener("message", this.listener); this.listener = null; }

  post(m: HostMessage) {
    const full = { ns: BRIDGE_NS, v: 1 as const, ...m } as HostToGame;
    try { this.iframe.contentWindow?.postMessage(full, this.targetOrigin); } catch { /* iframe gone */ }
  }

  init(player: BridgePlayerInfo, match: BridgeMatchInfo, locale: string, reducedMotion: boolean) { this.post({ type: "init", player, match, locale, reducedMotion }); }
  pause() { this.post({ type: "pause" }); }
  resume() { this.post({ type: "resume" }); }
  terminate(reason: string) { this.post({ type: "terminate", reason }); }
  ticket(ticket: string) { this.post({ type: "realtime_ticket", ticket }); }
}
