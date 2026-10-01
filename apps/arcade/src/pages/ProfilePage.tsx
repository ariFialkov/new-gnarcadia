import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { JURISDICTIONS } from "@gnarcadia/protocol";
import { api, errorMessage, type MatchHistoryItem, type Me } from "../lib/api.ts";
import { useAsync, useDocumentTitle } from "../lib/hooks.ts";
import { useAuth } from "../lib/auth.tsx";
import { useToast } from "../components/Toast.tsx";
import { useModals } from "../modals/ModalManager.tsx";
import { AuthModal } from "../modals/AuthModal.tsx";
import { WalletModal } from "../modals/WalletModal.tsx";
import { KycModal } from "../modals/KycModal.tsx";
import { GeoGateModal } from "../modals/GeoGateModal.tsx";
import { ConfirmModal } from "../modals/ConfirmModal.tsx";
import { money, relativeTime, dateTime, formatLabel, ordinal } from "../lib/format.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Badge, EmptyState, ErrorState, Skeleton } from "../components/Primitives.tsx";
import { LEGAL_LINKS } from "../legal/index.ts";
import { Confetti } from "../components/Confetti.tsx";

function statsOf(history: MatchHistoryItem[] | null) {
  const settled = (history ?? []).filter((h) => h.status === "settled" && !h.practice);
  return { played: settled.length, wins: settled.filter((h) => h.rank === 1).length, net: settled.reduce((a, h) => a + (h.payoutCents ?? 0) - h.entryCents, 0), practice: (history ?? []).filter((h) => h.practice).length };
}

export function ProfilePage() {
  useDocumentTitle("Profile");
  const auth = useAuth();
  const toast = useToast();
  const modals = useModals();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const u = auth.user;
  const history = useAsync(() => api.myMatches(), [u?.id], { enabled: !!u });
  const stats = useMemo(() => statsOf(history.data), [history.data]);
  const [celebrate, setCelebrate] = useState(false);

  // Returning from a KYC provider redirect (?kyc=done).
  useEffect(() => {
    if (params.get("kyc") === "done") { void auth.refresh().then((me) => { if (me?.kycStatus === "approved") { setCelebrate(true); toast.success("Identity verified. You're all set!", "Verified"); } }); const p = new URLSearchParams(params); p.delete("kyc"); setParams(p, { replace: true }); }
  }, [params, setParams, auth, toast]);

  if (auth.ready && !u) {
    return (
      <div className="container page">
        <EmptyState emoji="👋" title="Your profile lives here" body="Sign in to see your stats, wallet and settings." action={<div className="row row--center"><button type="button" className="btn btn--primary" onClick={() => void modals.open<Me>((h) => <AuthModal {...h} initialTab="login" />)}>Log in</button><button type="button" className="btn btn--ghost" onClick={() => void modals.open<Me>((h) => <AuthModal {...h} initialTab="signup" />)}>Sign up</button></div>} />
      </div>
    );
  }
  if (!u) return <div className="container page"><Skeleton h={120} r={24} /><div style={{ height: 16 }} /><Skeleton h={300} r={24} /></div>;

  const j = JURISDICTIONS[u.geo.region ?? u.region ?? ""];
  const kycTone = u.kycStatus === "approved" ? "live" : u.kycStatus === "pending" || u.kycStatus === "review" ? "paused" : u.kycStatus === "rejected" ? "blocked" : "neutral";
  const kycLabel = { none: "Not verified", pending: "In progress", approved: `Verified · Tier ${u.kycTier}`, rejected: "Rejected", review: "Under review" }[u.kycStatus] ?? u.kycStatus;

  async function verifyIdentity() {
    try {
      const r = await api.kycStart({ tier: 1 });
      if (r.status === "approved" && !r.url) { await auth.refresh(); setCelebrate(true); toast.success("You're verified!", "Identity"); return; }
      if (r.url) { window.open(r.url, "_blank", "noopener"); }
      await modals.open<boolean>((h) => <KycModal {...h} tier={1} />);
    } catch (e) { toast.error(errorMessage(e)); }
  }
  async function logout() { await auth.logout(); toast("Logged out. See you soon!"); nav("/games"); }

  return (
    <div className="container page page--profile">
      {celebrate && <Confetti />}
      <header className="profile-head card card--pad">
        <Avatar name={u.username} url={u.avatarUrl} size={72} />
        <div className="profile-head__body">
          <h1 className="page-title">{u.username}</h1>
          <p className="muted">{u.email} · Joined {relativeTime(u.createdAt)} · {u.country === "US" ? "🇺🇸" : "🇨🇦"} {j?.name ?? u.region ?? "Region not verified"}</p>
          <div className="row row--wrap"><Badge tone={kycTone}>🪪 {kycLabel}</Badge><Badge tone={u.geo.ok ? "live" : "neutral"}>📍 {u.geo.ok ? "Location verified" : "Location not verified"}</Badge>{u.eligibility.ok ? <Badge tone="live">✅ Cash-ready</Badge> : <Badge tone="paused">⏳ {u.eligibility.code?.replace(/_/g, " ")}</Badge>}</div>
        </div>
        <Link to={`/profile/${u.username}`} className="btn btn--ghost btn--sm">Public view</Link>
      </header>

      <div className="profile-grid">
        <section className="card card--pad stats-card">
          <h2 className="section-title">Stats</h2>
          <div className="stats">
            <div className="stat"><span className="stat__v">{stats.played}</span><span className="stat__l">Cash matches</span></div>
            <div className="stat"><span className="stat__v">{stats.wins}</span><span className="stat__l">Wins</span></div>
            <div className="stat"><span className="stat__v">{stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%</span><span className="stat__l">Win rate</span></div>
            <div className="stat"><span className={`stat__v ${stats.net >= 0 ? "pos" : "neg"}`}>{money(stats.net, u.currency, { sign: true, compact: true })}</span><span className="stat__l">Net result</span></div>
          </div>
        </section>

        <section className="card card--pad wallet-card">
          <div className="row row--between"><h2 className="section-title">Wallet</h2><Badge>{u.currency}</Badge></div>
          <div className="wallet-card__amt">{money(u.balanceCents, u.currency)}</div>
          {u.bonusCents > 0 && <div className="muted">+ {money(u.bonusCents, u.currency)} bonus credit</div>}
          <div className="row row--wrap">
            <button type="button" className="btn btn--cta" onClick={() => void modals.open((h) => <WalletModal {...h} initialTab="deposit" />)}>Deposit</button>
            <button type="button" className="btn btn--ghost" onClick={() => void modals.open((h) => <WalletModal {...h} initialTab="withdraw" />)}>Withdraw</button>
            <button type="button" className="link" onClick={() => void modals.open((h) => <WalletModal {...h} initialTab="history" />)}>History</button>
          </div>
        </section>

        <section className="card card--pad">
          <h2 className="section-title">Identity (KYC)</h2>
          <p className="muted">Status: <strong>{kycLabel}</strong>. Required once before deposits, cash play and withdrawals.</p>
          {u.kycStatus !== "approved" && <button type="button" className="btn btn--primary" onClick={verifyIdentity}>{u.kycStatus === "pending" ? "Continue verification" : "Verify identity"}</button>}
          {u.kycStatus === "approved" && u.kycTier < 2 && <p className="fineprint">Tier 2 (enhanced) verification is requested automatically for withdrawals over $500.</p>}
        </section>

        <section className="card card--pad">
          <h2 className="section-title">Location</h2>
          <p className="muted">{u.geo.ok ? <>Verified in <strong>{j?.name ?? u.geo.region}</strong></> : u.geo.region ? <>Last check: {j?.name ?? u.geo.region} — {u.geo.reason ?? "expired"}</> : "Not checked yet"} · {u.geo.checkedAt ? relativeTime(u.geo.checkedAt) : "never"}</p>
          <button type="button" className="btn btn--ghost" onClick={() => void modals.open<boolean>((h) => <GeoGateModal {...h} />)}>Re-check location</button>
        </section>

        <section className="card card--pad span-2">
          <div className="row row--between"><h2 className="section-title">Recent matches</h2>{history.data && history.data.length > 0 && <span className="muted">{history.data.length} shown</span>}</div>
          {history.error && <ErrorState message={history.error} onRetry={history.reload} />}
          {history.loading && !history.data && <Skeleton h={160} />}
          {history.data && history.data.length === 0 && <EmptyState emoji="🎮" title="No matches yet" body="Your results will show up here." action={<Link to="/games" className="btn btn--primary">Find a game</Link>} />}
          {history.data && history.data.length > 0 && (
            <ul className="match-list">
              {history.data.map((m) => {
                const net = (m.payoutCents ?? 0) - m.entryCents;
                return (
                  <li key={m.matchId} className="match">
                    <div className="match__body"><Link to={`/games/${m.gameId}`} className="match__game">{m.gameName}</Link><small className="muted">{formatLabel(m.format)}{m.practice ? " · practice" : ` · ${money(m.entryCents, m.currency, { compact: true })} entry`} · {relativeTime(m.joinedAt)}</small></div>
                    <div className="match__result">
                      {m.status === "settled" ? <><strong>{m.rank ? ordinal(m.rank) : "—"}</strong>{!m.practice && <span className={net >= 0 ? "pos" : "neg"}>{money(net, m.currency, { sign: true, compact: true })}</span>}</> : <Badge tone={m.status === "cancelled" ? "neutral" : "paused"}>{m.status}</Badge>}
                      {m.score != null && <small className="muted">{Number(m.score).toLocaleString()} pts</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="fineprint">Per-game leaderboards: open any game and tap “Full board”.</p>
        </section>

        <ResponsiblePlaySettings />

        <section className="card card--pad">
          <h2 className="section-title">Legal &amp; support</h2>
          <ul className="link-list">{LEGAL_LINKS.map((l) => <li key={l.label}>{"to" in l ? <Link to={l.to}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}</li>)}</ul>
        </section>

        <section className="card card--pad">
          <h2 className="section-title">Account</h2>
          <p className="muted">Signed in as {u.email}.</p>
          <button type="button" className="btn btn--danger-ghost" onClick={logout}>Log out</button>
        </section>
      </div>
    </div>
  );
}

function ResponsiblePlaySettings() {
  const auth = useAuth();
  const toast = useToast();
  const modals = useModals();
  const u = auth.user!;
  const j = JURISDICTIONS[u.geo.region ?? u.region ?? ""];
  const maxCap = j?.defaultDailyDepositCapCents ?? 50_000;
  const [cap, setCap] = useState(String(u.limits.dailyDepositCapCents / 100));
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setCap(String(u.limits.dailyDepositCapCents / 100)), [u.limits.dailyDepositCapCents]);

  async function saveCap() {
    const cents = Math.round(parseFloat(cap || "0") * 100);
    if (!Number.isFinite(cents) || cents < 0) { toast.error("Enter a valid amount."); return; }
    setBusy("cap");
    try { const r = await api.setDepositLimit(cents); await auth.refresh(); toast.success(r.applied ? `Daily deposit limit is now ${money(cents, u.currency)}.` : `Increase scheduled — applies in 24 hours.`); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  async function cooldown(hours: number) {
    const ok = await modals.open<boolean>((h) => <ConfirmModal {...h} title="Take a break?" message={`Cash play will be locked for ${hours >= 24 ? `${hours / 24} day${hours > 24 ? "s" : ""}` : `${hours} hours`}. Practice play stays available. This can't be shortened once set.`} confirmLabel="Start my break" />);
    if (!ok) return;
    setBusy("cool");
    try { await api.cooldown(hours); await auth.refresh(); toast({ kind: "info", title: "Break started", message: "We'll see you when it's over. Take care of yourself." }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  async function selfExclude(days: number) {
    const ok = await modals.open<boolean>((h) => <ConfirmModal {...h} danger title="Self-exclude from cash play" typeToConfirm="EXCLUDE" confirmLabel="Self-exclude" message={<><p>This will block all cash play and deposits for <strong>{days} days</strong>. It <strong>cannot be undone early</strong> — not by you, not by support. Your balance stays withdrawable.</p><p>If gambling-style play is affecting you, free confidential help is available 24/7 — see our Responsible Play page.</p></>} />);
    if (!ok) return;
    setBusy("excl");
    try { await api.selfExclude(days); await auth.refresh(); toast({ kind: "info", title: "Self-exclusion active", message: `You're excluded from cash play for ${days} days.`, durationMs: 8000 }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  const excluded = u.limits.selfExcludedUntil && new Date(u.limits.selfExcludedUntil).getTime() > Date.now();
  const cooling = u.limits.cooldownUntil && new Date(u.limits.cooldownUntil).getTime() > Date.now();

  return (
    <section className="card card--pad span-2 rp-card">
      <h2 className="section-title">🌱 Responsible play</h2>
      {excluded && <div className="alert alert--warn">Self-excluded until {dateTime(u.limits.selfExcludedUntil)}.</div>}
      {cooling && !excluded && <div className="alert alert--info">Cooling-off until {dateTime(u.limits.cooldownUntil)}.</div>}
      <div className="rp-grid">
        <div>
          <h3>Daily deposit limit</h3>
          <p className="muted">Currently {money(u.limits.dailyDepositCapCents, u.currency)}. Max for {j?.name ?? "your region"}: {money(maxCap, u.currency)}. Lowering applies instantly; raising takes 24h.</p>
          <div className="row">
            <div className="input-wrap input-wrap--money"><span className="input-prefix" aria-hidden="true">$</span><input className="input" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Daily deposit limit in dollars" /></div>
            <button type="button" className="btn btn--primary" disabled={busy === "cap"} onClick={saveCap}>Save</button>
          </div>
        </div>
        <div>
          <h3>Cooling-off break</h3>
          <p className="muted">Pause cash play for a while. Practice stays open.</p>
          <div className="row row--wrap">{[24, 72, 168, 720].map((h) => <button key={h} type="button" className="chip" disabled={busy === "cool" || !!cooling || !!excluded} onClick={() => cooldown(h)}>{h === 24 ? "24 hours" : `${h / 24} days`}</button>)}</div>
        </div>
        <div>
          <h3>Self-exclusion</h3>
          <p className="muted">A serious, irreversible block on cash play and deposits.</p>
          <div className="row row--wrap">{[180, 365, 1825].map((d) => <button key={d} type="button" className="chip chip--danger" disabled={busy === "excl" || !!excluded} onClick={() => selfExclude(d)}>{d === 180 ? "6 months" : d === 365 ? "1 year" : "5 years"}</button>)}</div>
        </div>
      </div>
      <p className="fineprint">Need to talk? <Link to="/legal/responsible-play">Free, confidential support lines</Link> are listed on our Responsible Play page.</p>
    </section>
  );
}

export function PublicProfilePage() {
  const { username = "" } = useParams();
  const auth = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.publicProfile(username), [username]);
  useDocumentTitle(data?.username ?? username);
  const cur = auth.user?.currency ?? "CAD";
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>;
  if (loading || !data) return <div className="container page"><Skeleton h={160} r={24} /></div>;
  if (data.error) return <div className="container page"><EmptyState emoji="🫥" title="Player not found" body={`No one goes by “${username}” around here.`} action={<Link to="/games" className="btn btn--primary">Back to games</Link>} /></div>;
  const rate = data.stats.played ? Math.round((data.stats.wins / data.stats.played) * 100) : 0;
  return (
    <div className="container page">
      <header className="profile-head card card--pad">
        <Avatar name={data.username} url={data.avatarUrl} size={72} />
        <div className="profile-head__body"><h1 className="page-title">{data.username}</h1><p className="muted">Playing since {new Date(data.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p></div>
        {auth.user?.username === data.username && <Link to="/profile" className="btn btn--ghost btn--sm">Edit profile</Link>}
      </header>
      <section className="card card--pad">
        <div className="stats">
          <div className="stat"><span className="stat__v">{data.stats.played}</span><span className="stat__l">Cash matches</span></div>
          <div className="stat"><span className="stat__v">{data.stats.wins}</span><span className="stat__l">Wins</span></div>
          <div className="stat"><span className="stat__v">{rate}%</span><span className="stat__l">Win rate</span></div>
          <div className="stat"><span className={`stat__v ${data.stats.netCents >= 0 ? "pos" : "neg"}`}>{money(data.stats.netCents, cur, { sign: true, compact: true })}</span><span className="stat__l">Net result</span></div>
        </div>
      </section>
    </div>
  );
}
