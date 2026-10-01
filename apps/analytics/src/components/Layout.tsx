import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useApp, type Days } from "../lib/store";
import { API_BASE, DEFAULT_DEV_KEY } from "../lib/api";
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
  const { days, setDays, live, setLive, adminKey, promptForKey, theme, setTheme, overview } = useApp();
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
        <button className="key-pill" onClick={promptForKey} title="Change admin key">
          <span className="dot" style={{ background: overview.error?.unauthorized ? "var(--critical)" : adminKey ? "var(--status-live)" : "var(--warning)" }} />
          {adminKey ? (adminKey === DEFAULT_DEV_KEY ? "dev key" : `key ••••${adminKey.slice(-4)}`) : "no key"}
        </button>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}

export function AdminKeyModal() {
  const { needsKey, adminKey, setAdminKey, overview } = useApp();
  const [val, setVal] = useState(adminKey ?? DEFAULT_DEV_KEY);
  useEffect(() => {
    if (needsKey) setVal(adminKey ?? DEFAULT_DEV_KEY);
  }, [needsKey, adminKey]);
  if (!needsKey) return null;
  const rejected = overview.error?.unauthorized;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="key-title">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (val.trim()) setAdminKey(val.trim());
        }}
      >
        <div>
          <h2 id="key-title" style={{ fontSize: 18 }}>
            Admin key
          </h2>
          <p style={{ marginTop: 6 }}>
            Requests are sent with <code>X-Admin-Key</code> to <code>{API_BASE}</code>. The key is kept in this browser only.
          </p>
        </div>
        {rejected && (
          <div className="error-box">
            <strong>Rejected</strong> The API refused the previous key ({overview.error?.status}).
          </div>
        )}
        <input className="input" autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="dev-admin-key" spellCheck={false} aria-label="Admin key" />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {adminKey && (
            <button type="button" className="btn" onClick={() => setAdminKey(adminKey)}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!val.trim()}>
            Save key
          </button>
        </div>
      </form>
    </div>
  );
}
