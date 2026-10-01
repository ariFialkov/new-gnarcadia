import { useEffect, useState } from "react";
import { API_URL } from "../lib/api.ts";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import type { Me } from "../lib/api.ts";
import { useModals } from "../modals/ModalManager.tsx";
import { AuthModal } from "../modals/AuthModal.tsx";
import { WalletModal } from "../modals/WalletModal.tsx";
import { money } from "../lib/format.ts";
import { Avatar } from "./Avatar.tsx";
import { LEGAL_LINKS } from "../legal/index.ts";

const TABS = [
  { to: "/games", label: "Games", icon: "🎮" },
  { to: "/market", label: "Market", icon: "🛍️" },
  { to: "/profile", label: "Profile", icon: "👤" },
];

export function Shell() {
  const { user, ready } = useAuth();
  const modals = useModals();
  const loc = useLocation();
  const openAuth = (tab: "login" | "signup") => void modals.open<Me>((h) => <AuthModal {...h} initialTab={tab} />);
  const openWallet = () => void modals.open((h) => <WalletModal {...h} />);

  const [testMode, setTestMode] = useState(false);
  useEffect(() => { fetch(`${API_URL}/health`).then((r) => r.json()).then((h) => setTestMode(!!h?.testMode)).catch(() => {}); }, []);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      {testMode && <div className="testmode-banner" role="status">Test mode · play money only — deposits and prizes are not real while providers are mocked.</div>}
      <header className="topbar">
        <div className="container topbar__inner">
          <Link to="/" className="brand" aria-label="Gnarcadia home">
            <img src="/icon.svg" alt="" width={36} height={36} className="brand__mark" />
            <span className="brand__name">Gnarcadia</span>
          </Link>
          <nav className="topnav" aria-label="Primary">
            {TABS.map((t) => <NavLink key={t.to} to={t.to} className={({ isActive }) => `topnav__link ${isActive || (t.to === "/games" && loc.pathname === "/") ? "is-active" : ""}`}>{t.label}</NavLink>)}
          </nav>
          <div className="topbar__right">
            {!ready ? <div className="skeleton" style={{ width: 120, height: 40, borderRadius: 999 }} /> : user ? (
              <>
                <button type="button" className="wallet-pill" onClick={openWallet} aria-label={`Wallet balance ${money(user.balanceCents, user.currency)}. Open wallet`}>
                  <span className="wallet-pill__coin" aria-hidden="true">🪙</span>
                  <span className="wallet-pill__amt">{money(user.balanceCents, user.currency, { compact: true })}</span>
                  <span className="wallet-pill__plus" aria-hidden="true">+</span>
                </button>
                <Link to="/profile" className="topbar__avatar" aria-label="Your profile"><Avatar name={user.username} url={user.avatarUrl} size={40} /></Link>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--ghost" onClick={() => openAuth("login")}>Log in</button>
                <button type="button" className="btn btn--primary" onClick={() => openAuth("signup")}>Sign up</button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}><Outlet /></main>

      <footer className="footer container">
        <div className="footer__links">
          {LEGAL_LINKS.map((l) => "to" in l ? <Link key={l.label} to={l.to}>{l.label}</Link> : <a key={l.label} href={l.href}>{l.label}</a>)}
        </div>
        <p className="fineprint">Gnarcadia hosts games of skill. 18+ (19+ in ON/BC/NS). Play responsibly — limits, breaks and self-exclusion are in your profile. Cosmetics never affect gameplay.</p>
      </footer>

      {/* Mobile: floating wallet pill + bottom tab bar */}
      {ready && user && (
        <button type="button" className="wallet-fab" onClick={openWallet} aria-label={`Wallet balance ${money(user.balanceCents, user.currency)}. Open wallet`}>
          <span aria-hidden="true">🪙</span> {money(user.balanceCents, user.currency, { compact: true })} <span className="wallet-fab__plus" aria-hidden="true">+</span>
        </button>
      )}
      <nav className="tabbar" aria-label="Primary">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `tabbar__item ${isActive || (t.to === "/games" && loc.pathname === "/") ? "is-active" : ""}`}>
            <span className="tabbar__icon" aria-hidden="true">{t.icon}</span>
            <span className="tabbar__label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
