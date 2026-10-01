import type { RtClientMessage, RtServerMessage, RtPlayerPublic, RoomPhase, MatchResult, SettlementSummary } from "@gnarcadia/protocol/realtime";

type Handlers = {
  welcome: (m: Extract<RtServerMessage, { t: "welcome" }>) => void;
  state: (state: any, tick: number) => void;
  event: (name: string, data: any) => void;
  private: (name: string, data: any) => void;
  phase: (phase: RoomPhase, countdownEndsAt?: number) => void;
  player_joined: (p: RtPlayerPublic) => void;
  player_left: (playerId: string, reason: string) => void;
  results: (results: MatchResult[], settlement?: SettlementSummary) => void;
  bounty: (playerId: string, bountyCents: number, bankCents: number) => void;
  error: (code: string, message: string) => void;
  disconnected: (code: number, reason: string) => void;
};

/**
 * Thin, dependency-free realtime client. Reconnects with the same ticket while the match is live.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers: { [K in keyof Handlers]?: Set<Handlers[K]> } = {};
  private seq = 0;
  private closedByUser = false;
  private reconnectAttempts = 0;
  public playerId = "";
  public roomId = "";
  public matchId = "";
  public phase: RoomPhase = "waiting";
  public players = new Map<string, RtPlayerPublic>();
  public latencyMs = 0;
  public tickRate = 20;
  private pingTimer: any = null;

  constructor(private url: string, private ticket: string) {}

  connect(): Promise<this> {
    this.closedByUser = false;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let welcomed = false;
      ws.onopen = () => this.raw({ t: "join", ticket: this.ticket });
      ws.onmessage = (ev) => {
        let msg: RtServerMessage;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (msg.t === "welcome") {
          welcomed = true; this.reconnectAttempts = 0;
          this.playerId = msg.playerId; this.roomId = msg.roomId; this.matchId = msg.matchId; this.phase = msg.phase; this.tickRate = msg.tickRate;
          this.players.clear(); for (const p of msg.players) this.players.set(p.playerId, p);
          this.startPing();
          this.emit("welcome", msg);
          resolve(this);
        } else if (msg.t === "error") {
          this.emit("error", msg.code, msg.message);
          if (!welcomed) reject(new Error(`${msg.code}: ${msg.message}`));
        } else this.dispatch(msg);
      };
      ws.onclose = (ev) => {
        this.stopPing();
        this.emit("disconnected", ev.code, ev.reason);
        if (!welcomed) reject(new Error(`socket closed before welcome (${ev.code})`));
        // Auto-reconnect while the match may still be live (server rejects if it ended).
        if (!this.closedByUser && this.phase !== "ended" && this.reconnectAttempts < 5) {
          const delay = 500 * Math.pow(2, this.reconnectAttempts++);
          setTimeout(() => this.connect().catch(() => {}), delay);
        }
      };
      ws.onerror = () => { /* onclose follows */ };
    });
  }

  private dispatch(msg: RtServerMessage) {
    switch (msg.t) {
      case "state": this.emit("state", msg.state, msg.tick); break;
      case "event": this.emit("event", msg.name, msg.data); break;
      case "private": this.emit("private", msg.name, msg.data); break;
      case "phase": this.phase = msg.phase; this.emit("phase", msg.phase, msg.countdownEndsAt); break;
      case "player_joined": this.players.set(msg.player.playerId, msg.player); this.emit("player_joined", msg.player); break;
      case "player_left": this.players.delete(msg.playerId); this.emit("player_left", msg.playerId, msg.reason); break;
      case "results": this.phase = "ended"; this.emit("results", msg.results, msg.settlement); break;
      case "bounty": this.emit("bounty", msg.playerId, msg.bountyCents, msg.bankCents); break;
      case "pong": this.latencyMs = Date.now() - msg.c; break;
    }
  }

  /** Send a game input. Inputs are sequenced so the server can detect loss/replay. */
  send(data: unknown) { this.raw({ t: "input", seq: ++this.seq, data }); }
  /** Perpetual lobbies: cash out and leave. Other formats: forfeit. */
  leave() { this.raw({ t: "leave" }); this.close(); }
  close() { this.closedByUser = true; this.stopPing(); this.ws?.close(1000, "client"); }

  on<K extends keyof Handlers>(ev: K, fn: Handlers[K]): () => void {
    (this.handlers[ev] ??= new Set<any>()).add(fn as any);
    return () => this.handlers[ev]?.delete(fn as any);
  }
  private emit<K extends keyof Handlers>(ev: K, ...args: Parameters<Handlers[K]>) {
    this.handlers[ev]?.forEach((fn: any) => { try { fn(...args); } catch (e) { console.error("[gnarcadia] handler error", e); } });
  }
  private raw(m: RtClientMessage) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  private startPing() { this.stopPing(); this.pingTimer = setInterval(() => this.raw({ t: "ping", c: Date.now() }), 2000); }
  private stopPing() { if (this.pingTimer) clearInterval(this.pingTimer); this.pingTimer = null; }
}
