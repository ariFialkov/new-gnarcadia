import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useApp, type Days } from "../lib/store";
import { API_BASE, adminLogin, ApiError } from "../lib/api";
import { relTime } from "../lib/format";

const I = {
  map: <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm6-3v15m6-12v15" />,
  overview: <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />,
  users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  money: <path d="M12 2v20M17 6.5a4 4 0 0 0-4-2.5h-2a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-2a4 4 0 0 1-4-2.5" />,
  games: <path d="M6 12h4m-2-2v4m8-1h.01M18 11h.01M7 20h10a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v7a4 4 0 0 0 4 4z" />,
  kyc: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zm-3-10l2 2 4-4" />,
  ops: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L14.8 3h-4l-.4 2.7a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.3 11a7.4 7.4 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.6c.1-.3.1-.7.1-1z" />,
};

const Icon = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const NAV = [
  { to: "/", label: "Map", icon: I.map, end: true },
  { to: "/overview", label: "Overview", icon: I.overview },
  { to: "/users", label: "Users & Retention", icon: I.users },
  { to: "/money", label: "Money", icon: I.money },
  { to: "/games", label: "Games", icon: I.games },
  { to: "/kyc", label: "KYC & Geo", icon: I.kyc },
  { to: "/ops", label: "Ops", icon: I.ops },
];

const TITLES: Record<string, [string, string]> = {
  "/": ["North America", "Jurisdiction status and live activity"],
  "/overview": ["Overview", "Platform KPIs and trends"],
  "/users": ["Users & Retention", "Acquisition funnel and regional cohorts"],
  "/money": ["Money", "Deposits, rake, float and ledger integrity"],
  "/games": ["Games", "Catalogue, versions and review queue"],
  "/kyc": ["KYC & Geo", "Verification funnel and geo-check outcomes"],
  "/ops": ["Ops", "User controls and audit trail"],
};

export function Layout({ children }: { children: ReactNode }) {
  const { days, setDays, live, setLive, adminKey, session, signOut, theme, setTheme, overview } = useApp();
  const loc = useLocation();
  const [title, sub] = TITLES[loc.pathname] ?? ["Analytics", ""];
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Sections">
        <div className="brand">
          <div className="brand-mark">G</div>
          <div>
            <div className="brand-name">Gnarcadia</div>
            <div className="brand-sub">Analytics Hub</div>
          </div>
        </div>
        {NAV.slice(0, 1).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Icon d={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div className="nav-section">Dashboards</div>
        {NAV.slice(1, 6).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Icon d={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div className="nav-section">Operations</div>
        {NAV.slice(6).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Icon d={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div>API {API_BASE.replace(/^https?:\/\//, "")}</div>
          <div>Data {overview.updatedAt ? relTime(new Date(overview.updatedAt).toISOString()) : "–"}</div>
        </div>
      </nav>

      <header className="topbar">
        <div>
          <div className="topbar-title">{title}</div>
          <div className="topbar-sub">{sub}</div>
        </div>
        <div className="spacer" />
        <div className="seg" role="radiogroup" aria-label="Date range">
          {([7, 30, 90] as Days[]).map((d) => (
            <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)} role="radio" aria-checked={days === d}>
              {d}d
            </button>
          ))}
        </div>
        <label className={`switch ${live ? "on" : ""}`}>
          <input type="checkbox" className="sr-only" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span className="track" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {live && <span className="live-dot" />}
            Live 30s
          </span>
        </label>
        <button className="btn icon ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme" title="Toggle theme">
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button className="key-pill" onClick={signOut} title="Sign out">
          <span className="dot" style={{ background: overview.error?.unauthorized ? "var(--critical)" : adminKey ? "var(--status-live)" : "var(--warning)" }} />
          {session ? `${session.username} · sign out` : "sign in"}
        </button>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}

/**
 * Full-screen admin sign-in. Nothing from the hub renders until an account with the `admin` role signs in.
 * Sessions live in sessionStorage (cleared when the tab closes) and refresh silently.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { needsKey, session, signIn } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session || !needsKey) return <>{children}</>;
  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <form
        className="gate-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          try { signIn(await adminLogin(email.trim(), password)); }
          catch (err) { setError(err instanceof ApiError ? (err.status === 0 ? err.message : err.status === 401 ? "Incorrect email or password." : err.message) : "Sign-in failed"); }
          finally { setBusy(false); }
        }}
      >
        <div className="gate-brand"><span className="gate-logo">G</span><div><strong>Gnarcadia</strong><div className="muted">Analytics Hub · administrators only</div></div></div>
        <h1 id="gate-title">Sign in</h1>
        <label className="field"><span>Email or username</span><input className="input" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="error-box"><strong>Sign-in failed</strong> {error}</div>}
        <button type="submit" className="btn primary" disabled={busy || !email || !password}>{busy ? "Signing in…" : "Enter the hub"}</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Connected to {API_BASE.replace(/^https?:\/\//, "")}. Access is logged.</p>
      </form>
    </div>
  );
}
