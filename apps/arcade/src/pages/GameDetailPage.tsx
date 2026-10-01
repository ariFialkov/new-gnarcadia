import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { FORMAT_DESCRIPTIONS, computeRake, defaultPayoutTable, splitPrizePool, type MatchFormat } from "@gnarcadia/protocol";
import { api, errorMessage, isApiError, type GameDetail } from "../lib/api.ts";
import { useAsync, useDocumentTitle } from "../lib/hooks.ts";
import { useAuth } from "../lib/auth.tsx";
import { useGate } from "../lib/gate.tsx";
import { useToast } from "../components/Toast.tsx";
import { useModals } from "../modals/ModalManager.tsx";
import { WalletModal } from "../modals/WalletModal.tsx";
import { money, pct, formatLabel, categoryLabel, compactNumber, ordinal, gradientFor } from "../lib/format.ts";
import { track } from "../lib/analytics.ts";
import { GameCover } from "../components/GameCard.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { BackLink, ErrorState, Skeleton, Badge } from "../components/Primitives.tsx";
import { saveJoinContext } from "../game-runner/session.ts";

export function GameDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { practice?: boolean } };
  const auth = useAuth();
  const gate = useGate();
  const toast = useToast();
  const modals = useModals();
  const { data: game, error, loading, reload } = useAsync(() => api.game(id), [id]);
  useDocumentTitle(game?.name ?? "Game");
  const cur = auth.user?.currency ?? "CAD";

  const [formatIdx, setFormatIdx] = useState(0);
  const [tier, setTier] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (game) track("game_view", { gameId: game.id }); }, [game]);
  useEffect(() => {
    if (!game) return;
    const f = game.formats[formatIdx];
    const first = f?.entryTiersCents.find((c) => c > 0) ?? null;
    setTier(first);
  }, [game, formatIdx]);
  useEffect(() => { if (tier != null && game) track("lobby_open", { gameId: game.id, format: game.formats[formatIdx]?.format, entryCents: tier }); }, [tier, game, formatIdx]);

  const fmt = game?.formats[formatIdx];
  const manifestFmt = useMemo(() => game?.manifest?.formats.find((f) => f.format === fmt?.format), [game, fmt]);
  const econ = useMemo(() => {
    if (!fmt || tier == null) return null;
    const players = fmt.maxPlayers;
    const gross = tier * players;
    const rake = computeRake(gross, fmt.rakeBps);
    const net = gross - rake;
    const table = manifestFmt?.payoutBps ?? (fmt.format === "duel" ? [10_000] : defaultPayoutTable(players));
    const payouts = ["ffa", "async_score", "duel"].includes(fmt.format) ? splitPrizePool(net, table) : [];
    return { players, gross, rake, net, payouts };
  }, [fmt, tier, manifestFmt]);

  async function play(format: string, entryCents: number, practice: boolean) {
    if (!game) return;
    const key = `${format}:${practice ? "p" : entryCents}`;
    setBusy(key);
    try {
      if (practice) { if (!(await gate.requireAuth("Create a free account to play."))) return; }
      else if (!(await gate.ensureEligible("Sign up to play for real prizes."))) return;
      const body = { gameId: game.id, format, entryCents: practice ? 0 : entryCents, practice };
      let r;
      try { r = await api.joinMatch(body); }
      catch (e) {
        if (isApiError(e) && e.status === 403 && (await gate.handleGateError(e))) r = await api.joinMatch(body);
        else if (isApiError(e) && e.code === "insufficient_funds") {
          const short = entryCents - (auth.user?.balanceCents ?? 0);
          toast({ kind: "warn", title: "Not enough funds", message: `You need ${money(short > 0 ? short : entryCents, cur)} more to enter.`, action: { label: "Deposit", onClick: () => void modals.open((h) => <WalletModal {...h} suggestedCents={short} reason={`Add funds to play ${game.name}`} />) } });
          void modals.open((h) => <WalletModal {...h} suggestedCents={short} reason={`Add funds to play ${game.name} for ${money(entryCents, cur, { compact: true })}`} />);
          return;
        } else throw e;
      }
      saveJoinContext(r, { gameId: game.id, gameName: game.name, gameVersion: game.liveVersion ?? "0.0.0", aspect: game.manifest?.aspect, orientation: game.manifest?.orientation });
      track("match_start", { gameId: game.id, format, entryCents: r.entryCents, practice: r.practice, matchId: r.matchId });
      void auth.refresh();
      nav(`/play/${r.matchId}`);
    } catch (e) {
      toast.error(isApiError(e) && e.code === "entry_above_cap" ? e.message : isApiError(e) && e.code === "game_not_live" ? "This game isn't live right now." : errorMessage(e), "Couldn't start the match");
    } finally { setBusy(null); }
  }

  if (error && !game) return <div className="container page"><BackLink /><ErrorState message={error} onRetry={reload} /></div>;
  if (loading || !game) return <div className="container page"><BackLink /><Skeleton h={320} r={28} /><div style={{ height: 16 }} /><Skeleton h={28} w="40%" /><div style={{ height: 8 }} /><Skeleton h={18} w="70%" /></div>;

  const practiceFirst = !!loc.state?.practice;
  const minTier = Math.min(...game.formats.flatMap((f) => f.entryTiersCents).filter((c) => c > 0), Infinity);

  return (
    <div className="page page--detail">
      <div className="detail-hero" style={{ background: gradientFor(game.id) }}>
        <GameCover game={game} className="detail-hero__cover" />
        <div className="detail-hero__shade" />
        <div className="container detail-hero__content">
          <BackLink>All games</BackLink>
          <div className="detail-hero__row">
            <div className="detail-hero__thumb" style={{ background: gradientFor(game.id) }}><GameCover game={game} /></div>
            <div>
              <div className="row row--wrap"><Badge tone="light">{categoryLabel(game.category)}</Badge>{game.isNew && <Badge tone="new">NEW</Badge>}{game.stats.playersOnline > 0 && <Badge tone="live"><span className="dot dot--live" /> {compactNumber(game.stats.playersOnline)} online</Badge>}</div>
              <h1 className="detail-hero__title">{game.name}</h1>
              <p className="detail-hero__tag">{game.tagline ?? ""}</p>
              <p className="detail-hero__dev">by <strong>{game.developer}</strong>{game.liveVersion && <span className="muted"> · v{game.liveVersion}</span>}{game.stats.rating > 0 && <span> · ★ {game.stats.rating.toFixed(1)}</span>}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container detail-grid">
        <div className="detail-main">
          <section className="card card--pad">
            <h2 className="section-title">Play</h2>
            {game.formats.length === 0 && <p className="muted">This game has no live formats yet.</p>}
            {game.formats.length > 1 && (
              <div className="chips" role="tablist" aria-label="Match format">
                {game.formats.map((f, i) => <button key={f.format} role="tab" type="button" aria-selected={i === formatIdx} className={`chip ${i === formatIdx ? "is-active" : ""}`} onClick={() => setFormatIdx(i)}>{formatLabel(f.format)}</button>)}
              </div>
            )}
            {fmt && (
              <div className="format-box">
                <p className="muted format-desc">{FORMAT_DESCRIPTIONS[fmt.format as MatchFormat] ?? ""} {fmt.minPlayers === fmt.maxPlayers ? `${fmt.maxPlayers} players.` : `${fmt.minPlayers}–${fmt.maxPlayers} players.`}</p>
                <div className="tiers" role="radiogroup" aria-label="Entry amount">
                  {fmt.entryTiersCents.filter((c) => c > 0).map((c) => <button key={c} type="button" role="radio" aria-checked={tier === c} className={`tier ${tier === c ? "is-active" : ""}`} onClick={() => setTier(c)}><span className="tier__amt">{money(c, cur, { compact: true })}</span><span className="tier__pool">pool {money(c * fmt.maxPlayers - computeRake(c * fmt.maxPlayers, fmt.rakeBps), cur, { compact: true })}</span></button>)}
                </div>
                {econ && tier != null && (
                  <div className="econ" aria-live="polite">
                    <div className="econ__row"><span>Entry</span><strong>{money(tier, cur)}</strong></div>
                    <div className="econ__row"><span>{pct(fmt.rakeBps)} platform fee</span><strong>−{money(econ.rake, cur)}</strong></div>
                    <div className="econ__row econ__row--total"><span>Prize pool ({econ.players} players)</span><strong>{money(econ.net, cur)}</strong></div>
                    {econ.payouts.length > 0 && <div className="econ__payouts">{econ.payouts.map((p, i) => <span key={i} className="payout"><em>{ordinal(i + 1)}</em> {money(p, cur, { compact: true })}</span>)}</div>}
                    {fmt.format === "teams" && <p className="fineprint">Winning team splits the prize pool.</p>}
                    {fmt.format === "perpetual" && <p className="fineprint">Your entry becomes your bounty. Eliminate players to claim theirs; leave any time to cash out.</p>}
                    <p className="fineprint">Fee disclosed before entry. Full refund if the match is cancelled.</p>
                  </div>
                )}
                <div className={`row row--wrap play-actions ${practiceFirst ? "is-practice-first" : ""}`}>
                  {tier != null && <button type="button" className="btn btn--cta btn--xl" disabled={busy !== null} onClick={() => play(fmt.format, tier, false)}>{busy === `${fmt.format}:${tier}` ? "Joining…" : `Play for ${money(tier, cur, { compact: true })}`}</button>}
                  <button type="button" className="btn btn--ghost btn--xl" disabled={busy !== null} onClick={() => play(fmt.format, 0, true)}>{busy === `${fmt.format}:p` ? "Loading…" : "Practice (free)"}</button>
                </div>
              </div>
            )}
          </section>

          <section className="card card--pad">
            <h2 className="section-title">About</h2>
            <p className="about">{game.description || "No description yet."}</p>
            {game.tags.length > 0 && <div className="row row--wrap">{game.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
            {game.manifest?.skillStatement && <details className="details"><summary>Why this is a game of skill</summary><p className="muted">{game.manifest.skillStatement}</p>{game.manifest.randomness === "seeded_shared" && <p className="fineprint">This game uses randomness, seeded identically for every entrant of a match.</p>}</details>}
          </section>
        </div>

        <aside className="detail-side">
          <section className="card card--pad">
            <h2 className="section-title">Open lobbies</h2>
            {game.openLobbies.length === 0 ? <p className="muted">No one's waiting right now — start one and others will join you. {Number.isFinite(minTier) && <>Entry from {money(minTier, cur, { compact: true })}.</>}</p> : (
              <ul className="lobby-list">
                {game.openLobbies.map((l, i) => (
                  <li key={i} className="lobby">
                    <div><strong>{formatLabel(l.format)}</strong><small className="muted"> · {l.n}/{l.max} players</small><div className="muted">{l.entryCents > 0 ? money(l.entryCents, cur) + " entry" : "Practice"}</div></div>
                    <button type="button" className="btn btn--primary btn--sm" disabled={busy !== null} onClick={() => play(l.format, l.entryCents, l.entryCents === 0)}>Join</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card card--pad">
            <div className="row row--between"><h2 className="section-title">Leaderboard</h2><Link to={`/games/${game.id}/leaderboard`} className="link">Full board</Link></div>
            <Leaderboard rows={game.leaderboard} cur={cur} />
          </section>
        </aside>
      </div>
    </div>
  );
}

export function Leaderboard({ rows, cur }: { rows: GameDetail["leaderboard"]; cur: "CAD" | "USD" }) {
  if (!rows.length) return <p className="muted">No ranked results yet. Be the first on the board!</p>;
  return (
    <ol className="lb">
      {rows.map((r, i) => (
        <li key={r.userId} className={`lb__row ${i < 3 ? `lb__row--top${i + 1}` : ""}`}>
          <span className="lb__rank">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
          <Avatar name={r.username} url={r.avatarUrl} size={32} />
          <Link to={`/profile/${r.username}`} className="lb__name">{r.username}</Link>
          <span className="lb__stat">{Number(r.wins)}W <small className="muted">/ {Number(r.played)}</small></span>
          <span className={`lb__net ${Number(r.netCents) >= 0 ? "pos" : "neg"}`}>{money(Number(r.netCents), cur, { sign: true, compact: true })}</span>
        </li>
      ))}
    </ol>
  );
}

export function LeaderboardPage() {
  const { id = "" } = useParams();
  const auth = useAuth();
  const game = useAsync(() => api.game(id), [id]);
  const rows = useAsync(() => api.leaderboard(id), [id]);
  useDocumentTitle(`${game.data?.name ?? "Game"} leaderboard`);
  return (
    <div className="container page">
      <BackLink to={`/games/${id}`}>{game.data?.name ?? "Game"}</BackLink>
      <h1 className="page-title">🏆 Leaderboard {game.data && <span className="muted">· {game.data.name}</span>}</h1>
      <div className="card card--pad">
        {rows.error && <ErrorState message={rows.error} onRetry={rows.reload} />}
        {rows.loading && !rows.data && <Skeleton h={200} />}
        {rows.data && <Leaderboard rows={rows.data} cur={auth.user?.currency ?? "CAD"} />}
      </div>
    </div>
  );
}
