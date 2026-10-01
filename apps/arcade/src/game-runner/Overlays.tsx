import { Link } from "react-router-dom";
import type { Currency } from "@gnarcadia/protocol";
import type { MatchView, RosterEntry } from "../lib/api.ts";
import { money, ordinal, pct } from "../lib/format.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Confetti } from "../components/Confetti.tsx";

export function LoadingOverlay({ progress, gameName, hint }: { progress: number; gameName: string; hint?: string }) {
  return (
    <div className="runner-overlay" role="status" aria-live="polite">
      <div className="runner-overlay__card">
        <div className="runner-logo" aria-hidden="true">G</div>
        <h2>Loading {gameName}…</h2>
        <div className="progress" aria-label={`Loading ${Math.round(progress * 100)}%`}><div className="progress__fill" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} /></div>
        {hint && <p className="muted">{hint}</p>}
      </div>
    </div>
  );
}

export function WaitingOverlay({ match, maxPlayers, gameName, currency, entryCents, practice, onLeave, leaving, gameReady }: { match: MatchView | null; maxPlayers: number; gameName: string; currency: Currency; entryCents: number; practice: boolean; onLeave: () => void; leaving: boolean; gameReady: boolean }) {
  const roster = (match?.roster ?? []).filter((r) => r.status === "joined" || r.status === "finished");
  const n = roster.length;
  const slots = Array.from({ length: maxPlayers }, (_, i) => roster[i] ?? null);
  const gross = entryCents * maxPlayers;
  return (
    <div className="runner-overlay" role="status" aria-live="polite">
      <div className="runner-overlay__card runner-overlay__card--wide">
        <span className="eyebrow">Lobby · {gameName}</span>
        <h2>{n >= maxPlayers ? "Everyone's here — starting!" : `Waiting for players ${n}/${maxPlayers}`}</h2>
        <p className="muted">{!gameReady ? "Game is loading in the background." : n < maxPlayers ? "The match starts automatically once the lobby fills (or after a short wait with enough players)." : "Get ready…"}</p>
        <ul className="roster">
          {slots.map((r, i) => r ? (
            <li key={r.playerId} className={`roster__slot ${r.isMe ? "is-me" : ""}`}><Avatar name={r.username} size={44} /><span>{r.username}{r.isMe ? " (you)" : ""}</span></li>
          ) : (
            <li key={`empty-${i}`} className="roster__slot roster__slot--empty"><span className="roster__pulse" aria-hidden="true" /><span>Searching…</span></li>
          ))}
        </ul>
        {!practice && <p className="fineprint">Entry {money(entryCents, currency)} · pool up to {money(gross - Math.floor(gross * (match?.rakeBps ?? 1000) / 10_000), currency)} after {pct(match?.rakeBps ?? 1000)} fee · full refund if you leave before the start.</p>}
        <button type="button" className="btn btn--ghost" onClick={onLeave} disabled={leaving}>{leaving ? "Leaving…" : "Leave lobby"}</button>
      </div>
    </div>
  );
}

export function ResultsOverlay({ match, playerId, currency, practice, gameId, summary, settling, timedOut, onRefresh, onExit }: { match: MatchView | null; playerId: string; currency: Currency; practice: boolean; gameId: string; summary?: Record<string, unknown>; settling: boolean; timedOut: boolean; onRefresh: () => void; onExit: () => void }) {
  const me: RosterEntry | undefined = match?.roster.find((r) => r.playerId === playerId) ?? match?.roster.find((r) => r.isMe);
  const settled = match?.status === "settled";
  const cancelled = match?.status === "cancelled";
  const won = settled && me?.rank === 1;
  const payout = me?.payoutCents ?? 0;
  const ranked = [...(match?.roster ?? [])].filter((r) => r.rank != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const scoreFromGame = typeof summary?.score === "number" ? (summary.score as number) : null;
  return (
    <div className="runner-overlay runner-overlay--results" role="dialog" aria-modal="true" aria-label="Match results">
      {won && !practice && <Confetti burst={180} />}
      <div className="runner-overlay__card runner-overlay__card--wide">
        {settling && !settled && !cancelled ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <h2>{practice ? "Round complete" : "Settling results…"}</h2>
            <p className="muted">{timedOut ? "This is taking longer than usual. Results will appear in your match history; your funds are safe in escrow." : practice ? "Nice run! Practice rounds aren't ranked." : "Waiting for the other players' results. For score-attack brackets this can take until the bracket fills or times out — you can leave and we'll settle it in the background."}</p>
            {scoreFromGame != null && <div className="result-score">Score <strong>{scoreFromGame.toLocaleString()}</strong></div>}
            <div className="row row--center">
              {timedOut && <button type="button" className="btn btn--ghost" onClick={onRefresh}>Refresh</button>}
              <button type="button" className="btn btn--primary" onClick={onExit}>Back to arcade</button>
            </div>
          </>
        ) : cancelled ? (
          <>
            <div className="big-emoji" aria-hidden="true">🫠</div>
            <h2>Match cancelled</h2>
            <p className="muted">Not enough players showed up. {practice ? "" : "Your entry fee has been refunded in full."}</p>
            <div className="row row--center"><Link to={`/games/${gameId}`} className="btn btn--primary">Try again</Link><button type="button" className="btn btn--ghost" onClick={onExit}>Back to arcade</button></div>
          </>
        ) : (
          <>
            <div className="big-emoji" aria-hidden="true">{practice ? "🎯" : won ? "🏆" : (me?.rank ?? 99) <= 3 ? "🥈" : "💪"}</div>
            <span className="eyebrow">{practice ? "Practice round" : "Final result"}</span>
            <h2>{practice ? "Round complete" : won ? `You won ${money(payout, currency)}!` : me?.rank ? `You finished ${ordinal(me.rank)}` : "Match over"}</h2>
            {me?.score != null && <div className="result-score">Score <strong>{Number(me.score).toLocaleString()}</strong></div>}
            {!practice && match?.settlement && (
              <div className="econ econ--results">
                <div className="econ__row"><span>Prize pool</span><strong>{money(match.settlement.grossPoolCents, currency)}</strong></div>
                <div className="econ__row"><span>Platform fee ({pct(match.rakeBps)})</span><strong>−{money(match.settlement.rakeCents, currency)}</strong></div>
                <div className="econ__row econ__row--total"><span>Your payout</span><strong className={payout > 0 ? "pos" : ""}>{money(payout, currency)}</strong></div>
              </div>
            )}
            {ranked.length > 0 && (
              <ol className="result-rank">
                {ranked.map((r) => <li key={r.playerId} className={r.isMe ? "is-me" : ""}><span>{ordinal(r.rank!)}</span><Avatar name={r.username} size={28} /><span className="result-rank__name">{r.username}{r.isMe ? " (you)" : ""}</span><span className="muted">{r.score != null ? Number(r.score).toLocaleString() : ""}</span>{!practice && <strong>{money(r.payoutCents ?? 0, currency, { compact: true })}</strong>}</li>)}
              </ol>
            )}
            <div className="row row--center">
              <Link to={`/games/${gameId}`} className="btn btn--cta">Play again</Link>
              <button type="button" className="btn btn--ghost" onClick={onExit}>Back to arcade</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
