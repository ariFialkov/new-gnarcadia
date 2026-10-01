import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { BridgeMatchInfo, BridgePlayerInfo } from "@gnarcadia/protocol";
import { api, API_URL, API_ORIGIN, errorMessage, type MatchView } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { AuthModal } from "../modals/AuthModal.tsx";
import { useToast } from "../components/Toast.tsx";
import { useModals } from "../modals/ModalManager.tsx";
import { ConfirmModal } from "../modals/ConfirmModal.tsx";
import { track } from "../lib/analytics.ts";
import { locale as getLocale, prefersReducedMotion } from "../lib/device.ts";
import { useDocumentTitle, useInterval } from "../lib/hooks.ts";
import { HostBridge } from "./bridge.ts";
import { Hud } from "./Hud.tsx";
import { LoadingOverlay, ResultsOverlay, WaitingOverlay } from "./Overlays.tsx";
import { clearJoinContext, loadJoinContext } from "./session.ts";

const REALTIME = new Set(["duel", "ffa", "teams", "perpetual"]);
type Phase = "loading" | "playing" | "over";

export function PlayPage() {
  const { matchId = "" } = useParams();
  const nav = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const modals = useModals();
  const ctx = useMemo(() => loadJoinContext(matchId), [matchId]);
  useDocumentTitle(ctx ? `Playing ${ctx.gameName}` : "Play");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<HostBridge | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const cosmeticsRef = useRef<Record<string, string>>({});
  const scoreSentRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0.05);
  const [gameReady, setGameReady] = useState(false);
  const [helloSeen, setHelloSeen] = useState(false);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [matchErr, setMatchErr] = useState<string | null>(null);
  const [authPrompted, setAuthPrompted] = useState(false);
  useEffect(() => {
    if (auth.user || !auth.ready || authPrompted) return;
    setAuthPrompted(true);
    void modals.open<unknown>((h) => <AuthModal {...h} reason="Sign in to play." initialTab="login" />).then((u) => { if (!u) nav("/", { replace: true }); });
  }, [auth.user, auth.ready, authPrompted, modals, nav]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [summary, setSummary] = useState<Record<string, unknown> | undefined>();
  const [settleTimedOut, setSettleTimedOut] = useState(false);
  const [gameId, setGameId] = useState(ctx?.gameId ?? "");
  const [gameName, setGameName] = useState(ctx?.gameName ?? "Game");

  const join = ctx?.join;
  const isRealtime = !!join && REALTIME.has(join.format);
  const gameOrigin = useMemo(() => { try { return new URL(join?.gameUrl ?? "/", API_URL).origin; } catch { return API_ORIGIN; } }, [join]);
  const gameSrc = useMemo(() => { try { return new URL(join?.gameUrl ?? "", API_URL).toString(); } catch { return ""; } }, [join]);

  // ---- match polling (roster while open; settlement after game over) ----
  const refreshMatch = useCallback(async () => {
    if (!matchId) return;
    try { const m = await api.match(matchId); setMatch(m); setMatchErr(null); if (!ctx) { setGameId(m.gameId); } return m; }
    catch (e) { setMatchErr(errorMessage(e)); return null; }
  }, [matchId, ctx]);
  useEffect(() => { void refreshMatch(); }, [refreshMatch]);
  const waitingForPlayers = isRealtime && (match ? match.status === "open" : !matchErr);
  const settling = phase === "over" && match?.status !== "settled" && match?.status !== "cancelled";
  useInterval(() => void refreshMatch(), waitingForPlayers || settling ? 2000 : phase === "playing" && isRealtime ? 10_000 : null);
  useEffect(() => {
    if (!settling) { setSettleTimedOut(false); return; }
    const t = setTimeout(() => setSettleTimedOut(true), 90_000);
    return () => clearTimeout(t);
  }, [settling]);
  useEffect(() => { if (!ctx && match?.gameId) api.game(match.gameId).then((g) => setGameName(g.name)).catch(() => { /* keep placeholder */ }); }, [ctx, match?.gameId]);

  // ---- equipped cosmetics (global + this game) ----
  useEffect(() => {
    if (!auth.user) return;
    api.inventory().then((items) => {
      const out: Record<string, string> = {};
      for (const it of items) if (it.equipped && it.slot && (!it.gameId || it.gameId === gameId)) out[it.slot] = it.sku;
      cosmeticsRef.current = out;
    }).catch(() => { /* cosmetics are optional */ });
  }, [auth.user, gameId]);

  // ---- countdown ----
  useEffect(() => {
    if (!join) return;
    const tick = () => {
      const start = match?.startedAt && isRealtime ? new Date(match.startedAt).getTime() : startedAtRef.current;
      setRemaining(Math.max(0, Math.ceil((start + join.timeLimitSec * 1000 - Date.now()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [join, match?.startedAt, isRealtime]);

  // ---- bridge ----
  const sendInit = useCallback(() => {
    const b = bridgeRef.current; if (!b || !join) return;
    const player: BridgePlayerInfo = { playerId: join.playerId, displayName: auth.user?.username ?? "Player", avatarUrl: auth.user?.avatarUrl ?? undefined, cosmetics: cosmeticsRef.current };
    const m: BridgeMatchInfo = {
      matchId: join.matchId, gameId, gameVersion: ctx?.gameVersion ?? "0.0.0", format: join.format, seed: join.seed, entryCents: join.entryCents, currency: join.currency, rakeBps: join.rakeBps,
      maxPlayers: join.maxPlayers, practice: join.practice, timeLimitSec: join.timeLimitSec, startedAt: startedAtRef.current,
      ...(join.realtime ? { realtime: { url: join.realtime.url, roomId: join.realtime.roomId } } : {}),
    };
    b.init(player, m, getLocale(), prefersReducedMotion());
  }, [join, auth.user, gameId, ctx]);

  // Latest callbacks/state behind a ref: the bridge must be created once per match, never re-created on re-render
  // (re-creating it would post `terminate` to a live game).
  const latest = useRef({ sendInit, nav, gameId, gameName, toast, refreshAuth: auth.refresh, refreshMatch });
  latest.current = { sendInit, nav, gameId, gameName, toast, refreshAuth: auth.refresh, refreshMatch };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !join) return;
    startedAtRef.current = Date.now();
    const L = () => latest.current;
    const bridge = new HostBridge(iframe, gameOrigin, {
      onHello: () => { setHelloSeen(true); L().sendInit(); },
      onReady: () => { setGameReady(true); setProgress(1); setPhase((p) => (p === "loading" ? "playing" : p)); },
      onLoading: (p) => setProgress(Math.max(0.05, p)),
      onRequestTicket: () => { if (join.realtime?.ticket) bridge.ticket(join.realtime.ticket); else L().toast.error("This match has no realtime ticket. Try rejoining from the game page."); },
      onSubmitScore: async (m) => {
        if (scoreSentRef.current) return; scoreSentRef.current = true;
        try { await api.submitScore(join.matchId, { score: m.score, durationMs: m.durationMs, inputLogHash: m.inputLogHash, inputLog: m.inputLog }); track("score_submitted", { matchId: join.matchId, score: m.score }); void L().refreshAuth(); }
        catch (e) { scoreSentRef.current = false; L().toast.error(errorMessage(e), "Score not saved"); }
      },
      onGameOver: (s) => { setSummary(s); setPhase("over"); void L().refreshMatch(); track("game_over", { matchId: join.matchId }); },
      onRequestExit: () => { const { nav, gameId } = L(); nav(gameId ? `/games/${gameId}` : "/games"); },
      onAnalytics: (event, props) => track(`game.${event}`.slice(0, 60), { ...props, matchId: join.matchId, gameId: L().gameId }),
      onError: (msg) => L().toast.error(msg, L().gameName),
    });
    bridge.attach();
    bridgeRef.current = bridge;
    // If the game never says hello (older SDK / slow load) nudge the progress bar so it doesn't look frozen.
    const nudge = setInterval(() => setProgress((p) => (p < 0.9 ? p + 0.03 : p)), 800);
    return () => { clearInterval(nudge); bridge.terminate("host_unmounted"); bridge.detach(); bridgeRef.current = null; };
  }, [join, gameOrigin]);

  // Pause/resume with tab visibility.
  useEffect(() => {
    const onVis = () => { const hidden = document.visibilityState === "hidden"; setPaused(hidden); if (hidden) bridgeRef.current?.pause(); else bridgeRef.current?.resume(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Clean up the stored join once the match is finished.
  useEffect(() => { if (match && (match.status === "settled" || match.status === "cancelled")) clearJoinContext(matchId); }, [match, matchId]);

  const leave = useCallback(async (skipConfirm = false) => {
    if (!join) { nav("/games"); return; }
    const canRefund = isRealtime && match?.status === "open";
    const inProgress = phase === "playing" && !canRefund && !join.practice;
    if (!skipConfirm) {
      const ok = await modals.open<boolean>((h) => <ConfirmModal {...h} title="Leave the match?" danger={inProgress} confirmLabel="Leave" message={canRefund ? "You'll leave the lobby and your entry fee will be refunded." : inProgress ? "The match is in progress. Leaving now counts as a forfeit and your entry fee is not refunded." : "You can come back to the arcade any time."} />);
      if (!ok) return;
    }
    setLeaving(true);
    try { if (canRefund) { await api.leaveMatch(join.matchId); void auth.refresh(); } }
    catch (e) { toast.error(errorMessage(e), "Couldn't leave cleanly"); }
    finally { bridgeRef.current?.terminate("player_left"); clearJoinContext(matchId); setLeaving(false); nav(gameId ? `/games/${gameId}` : "/games"); }
  }, [join, isRealtime, match?.status, phase, modals, auth, toast, matchId, nav, gameId]);

  if (!join) {
    return (
      <div className="runner runner--empty">
        <div className="runner-overlay__card">
          <div className="big-emoji" aria-hidden="true">🕹️</div>
          <h2>This match session has expired</h2>
          <p className="muted">We keep match sessions in this tab only. {match ? `The match is ${match.status}.` : matchErr ?? ""} Head back to the game to join a fresh one.</p>
          <div className="row row--center"><Link to={match?.gameId ? `/games/${match.gameId}` : "/games"} className="btn btn--primary">Back to the game</Link><Link to="/profile" className="btn btn--ghost">Match history</Link></div>
        </div>
      </div>
    );
  }

  const joinedCount = (match?.roster ?? []).filter((r) => r.status === "joined" || r.status === "finished").length;
  const gross = join.entryCents * join.maxPlayers;
  const prize = join.practice ? null : gross - Math.floor((gross * join.rakeBps) / 10_000);
  const orientationClass = ctx?.orientation && ctx.orientation !== "any" ? `runner--${ctx.orientation}` : "";

  return (
    <div className={`runner ${orientationClass}`}>
      <Hud gameName={gameName} format={join.format} remainingSec={phase === "playing" ? remaining : null} entryCents={join.entryCents} prizeCents={prize} currency={join.currency} practice={join.practice} rosterCount={isRealtime ? { n: joinedCount, max: join.maxPlayers } : null} paused={paused} onLeave={() => void leave()} />
      <div className="runner__stage" style={ctx?.aspect ? ({ "--aspect": ctx.aspect.replace(":", " / ") } as React.CSSProperties) : undefined}>
        <iframe
          ref={iframeRef}
          key={matchId}
          className="runner__frame"
          src={gameSrc}
          title={`${gameName} game`}
          sandbox="allow-scripts allow-pointer-lock allow-same-origin"
          allow="fullscreen; gamepad; autoplay; accelerometer; gyroscope"
          referrerPolicy="origin"
          allowFullScreen
        />
        {phase === "loading" && !waitingForPlayers && <LoadingOverlay progress={progress} gameName={gameName} hint={!helloSeen && progress > 0.6 ? "Still loading… if this hangs, the game bundle may be unreachable." : undefined} />}
        {waitingForPlayers && phase !== "over" && <WaitingOverlay match={match} maxPlayers={join.maxPlayers} gameName={gameName} currency={join.currency} entryCents={join.entryCents} practice={join.practice} onLeave={() => void leave(true)} leaving={leaving} gameReady={gameReady} />}
        {phase === "over" && <ResultsOverlay match={match} playerId={join.playerId} currency={join.currency} practice={join.practice} gameId={gameId} summary={summary} settling={!!settling} timedOut={settleTimedOut} onRefresh={() => void refreshMatch()} onExit={() => { clearJoinContext(matchId); nav(gameId ? `/games/${gameId}` : "/games"); }} />}
        {paused && phase === "playing" && <div className="runner-paused" aria-hidden="true">Paused</div>}
      </div>
    </div>
  );
}

