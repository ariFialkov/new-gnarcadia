import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "../components/Modal.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { useAuth } from "../lib/auth.tsx";
import { errorMessage, isApiError } from "../lib/api.ts";
import { track } from "../lib/analytics.ts";
import type { ModalHandle } from "./ModalManager.tsx";
import type { Me } from "../lib/api.ts";

type Tab = "login" | "signup";
interface Props extends ModalHandle<Me> { initialTab?: Tab; reason?: string }

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function AuthModal({ resolve, dismiss, initialTab = "login", reason }: Props) {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [celebrate, setCelebrate] = useState(false);

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // signup
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");
  const [country, setCountry] = useState<"CA" | "US">("CA");
  const [accept, setAccept] = useState(false);

  useEffect(() => { setError(null); setFieldErrors({}); }, [tab]);

  const usernameState = useMemo(() => {
    if (!username) return null;
    if (!USERNAME_RE.test(username)) return { ok: false, msg: "3–20 letters, numbers or underscores" };
    return { ok: true, msg: "Looks great!" };
  }, [username]);

  const age = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
    const d = new Date(dob), n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    const m = n.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
    return a;
  }, [dob]);

  const pwScore = useMemo(() => {
    let s = 0; if (password.length >= 8) s++; if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++; if (/\d/.test(password)) s++; if (/[^A-Za-z0-9]/.test(password)) s++; if (password.length >= 14) s++;
    return Math.min(4, s);
  }, [password]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setFieldErrors({});
    if (tab === "signup") {
      const fe: Record<string, string> = {};
      if (!/.+@.+\..+/.test(email)) fe.email = "Enter a valid email";
      if (password.length < 8) fe.password = "At least 8 characters";
      if (!USERNAME_RE.test(username)) fe.username = "3–20 letters, numbers or underscores";
      if (age == null) fe.dob = "Enter your date of birth"; else if (age < 18) fe.dob = "You must be 18 or older to create an account";
      if (!accept) fe.accept = "You need to accept to continue";
      if (Object.keys(fe).length) { setFieldErrors(fe); return; }
    }
    setBusy(true);
    try {
      const me = tab === "login" ? await auth.login(email.trim(), password) : await auth.signup({ email: email.trim(), password, username: username.trim(), dob, country, acceptTerms: true });
      track(tab === "login" ? "login" : "signup", { country: me.country });
      if (tab === "signup") { setCelebrate(true); setTimeout(() => resolve(me), 1400); } else resolve(me);
    } catch (err) {
      if (isApiError(err) && err.code === "validation" && err.details?.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.details.fieldErrors as Record<string, string[]>)) fe[k] = v[0] ?? "Invalid";
        setFieldErrors(fe);
      } else if (isApiError(err) && err.code === "account_exists") setError("That email or username is already taken. Try logging in instead?");
      else if (isApiError(err) && err.code === "bad_credentials") setError("Incorrect email or password.");
      else if (isApiError(err) && err.code === "underage") setFieldErrors({ dob: err.message });
      else setError(errorMessage(err));
    } finally { setBusy(false); }
  }

  const hero = (
    <div className="auth-hero">
      {celebrate && <Confetti />}
      <div className="auth-hero__logo" aria-hidden="true">G</div>
      <div>
        <div className="auth-hero__title">{celebrate ? "You're in! 🎉" : tab === "login" ? "Welcome back" : "Join the arcade"}</div>
        <div className="auth-hero__sub">{reason ?? (tab === "login" ? "Pick up where you left off." : "Skill games. Real prizes. No luck required.")}</div>
      </div>
    </div>
  );

  return (
    <Modal onClose={dismiss} ariaLabel="Sign in or create an account" hero={hero} size="sm" className="auth-modal">
      <div className="tabs" role="tablist" aria-label="Authentication">
        <button role="tab" type="button" aria-selected={tab === "login"} className={`tab ${tab === "login" ? "is-active" : ""}`} onClick={() => setTab("login")}>Log in</button>
        <button role="tab" type="button" aria-selected={tab === "signup"} className={`tab ${tab === "signup" ? "is-active" : ""}`} onClick={() => setTab("signup")}>Sign up</button>
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <label className="field">
          <span>{tab === "login" ? "Email or username" : "Email"}</span>
          <input className={`input ${fieldErrors.email ? "is-invalid" : ""}`} type={tab === "login" ? "text" : "email"} autoComplete={tab === "login" ? "username" : "email"} inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-autofocus />
          {fieldErrors.email && <small className="field__err">{fieldErrors.email}</small>}
        </label>
        <label className="field">
          <span>Password</span>
          <input className={`input ${fieldErrors.password ? "is-invalid" : ""}`} type="password" autoComplete={tab === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={tab === "signup" ? 8 : undefined} />
          {tab === "signup" && password && (
            <div className="pw-meter" aria-label={`Password strength ${pwScore} of 4`}>{[0, 1, 2, 3].map((i) => <span key={i} className={i < pwScore ? `is-on lvl-${pwScore}` : ""} />)}</div>
          )}
          {fieldErrors.password && <small className="field__err">{fieldErrors.password}</small>}
        </label>
        {tab === "signup" && (
          <>
            <label className="field">
              <span>Username <small className="muted">(this is your player name)</small></span>
              <div className="input-wrap">
                <input className={`input ${fieldErrors.username ? "is-invalid" : usernameState?.ok ? "is-valid" : ""}`} autoComplete="nickname" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} maxLength={20} required />
                {usernameState && <span className={`input-hint ${usernameState.ok ? "ok" : "bad"}`} aria-live="polite">{usernameState.ok ? "✓" : "!"}</span>}
              </div>
              {(fieldErrors.username || usernameState) && <small className={fieldErrors.username || !usernameState?.ok ? "field__err" : "field__ok"}>{fieldErrors.username ?? usernameState?.msg}</small>}
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Date of birth</span>
                <input className={`input ${fieldErrors.dob ? "is-invalid" : ""}`} type="date" autoComplete="bday" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} required />
                {fieldErrors.dob && <small className="field__err">{fieldErrors.dob}</small>}
              </label>
              <label className="field">
                <span>Country</span>
                <select className="input" value={country} onChange={(e) => setCountry(e.target.value as "CA" | "US")} autoComplete="country">
                  <option value="CA">🇨🇦 Canada</option>
                  <option value="US">🇺🇸 United States</option>
                </select>
              </label>
            </div>
            <label className={`check ${fieldErrors.accept ? "is-invalid" : ""}`}>
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>I'm 18+ (19+ in ON/BC/NS), I accept the <a href="/legal/terms" target="_blank" rel="noreferrer">Terms</a> &amp; <a href="/legal/privacy" target="_blank" rel="noreferrer">Privacy Policy</a></span>
            </label>
            {fieldErrors.accept && <small className="field__err">{fieldErrors.accept}</small>}
          </>
        )}
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy || celebrate}>
          {busy ? "One sec…" : tab === "login" ? "Let's go" : "Create my account"}
        </button>
        <p className="fineprint center">
          {tab === "login" ? <>New here? <button type="button" className="link" onClick={() => setTab("signup")}>Create an account</button></> : <>Already playing? <button type="button" className="link" onClick={() => setTab("login")}>Log in</button></>}
        </p>
      </form>
    </Modal>
  );
}
