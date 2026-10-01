import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "../components/Modal.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { api, errorMessage } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import type { ModalHandle } from "./ModalManager.tsx";

interface Props extends ModalHandle<boolean> { tier?: 1 | 2 }

export function KycModal({ resolve, dismiss, tier = 1 }: Props) {
  const auth = useAuth();
  const u = auth.user;
  const [legalName, setLegalName] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState(u?.region?.split("-")[1] ?? "");
  const [postal, setPostal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "waiting" | "approved" | "review">(u?.kycStatus === "pending" ? "waiting" : "form");
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Poll /me while the provider session is open.
  useEffect(() => {
    if (phase !== "waiting") return;
    const tick = async () => {
      const me = await auth.refresh();
      if (me?.kycStatus === "approved" && me.kycTier >= tier) { setPhase("approved"); setTimeout(() => resolve(true), 1500); }
      else if (me?.kycStatus === "rejected" || me?.kycStatus === "review") setPhase("review");
    };
    pollRef.current = window.setInterval(tick, 3000);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { if (pollRef.current) clearInterval(pollRef.current); document.removeEventListener("visibilitychange", onVis); };
  }, [phase, auth, tier, resolve]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.kycStart({ tier, legalName: legalName.trim(), address: { line1: line1.trim(), city: city.trim(), region: region.trim().toUpperCase(), postal: postal.trim().toUpperCase(), country: u?.country ?? "CA" } });
      if (r.status === "approved") { await auth.refresh(); setPhase("approved"); setTimeout(() => resolve(true), 1500); return; }
      if (r.url) { setProviderUrl(r.url); window.open(r.url, "_blank", "noopener"); }
      setPhase("waiting");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={phase === "approved" ? "Verified!" : "Verify your identity"} onClose={dismiss} size="sm">
      {phase === "approved" && (
        <div className="stack center">
          <Confetti />
          <div className="big-emoji" aria-hidden="true">🪪✨</div>
          <p>You're verified. Deposits, cash play and withdrawals are unlocked.</p>
          <button type="button" className="btn btn--primary" onClick={() => resolve(true)}>Continue</button>
        </div>
      )}
      {phase === "waiting" && (
        <div className="stack center">
          <div className="spinner" aria-hidden="true" />
          <p>Finish verification in the tab we opened. We'll detect it automatically — this usually takes under a minute.</p>
          {providerUrl && <a className="btn btn--ghost" href={providerUrl} target="_blank" rel="noreferrer">Re-open verification</a>}
          <button type="button" className="link" onClick={() => resolve(false)}>I'll finish later</button>
        </div>
      )}
      {phase === "review" && (
        <div className="stack">
          <div className="alert alert--warn" role="status">Your documents are being reviewed by a human. We'll email you when it's done (usually within 24h).</div>
          <button type="button" className="btn btn--primary" onClick={() => resolve(false)}>Okay</button>
        </div>
      )}
      {phase === "form" && (
        <form className="stack" onSubmit={submit}>
          <p className="muted">Regulations require us to confirm who you are before real money moves. One time only, takes about a minute. We use a certified verification partner and never store your ID images ourselves.</p>
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          <label className="field"><span>Legal name (as on your ID)</span><input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} autoComplete="name" required data-autofocus /></label>
          <label className="field"><span>Street address</span><input className="input" value={line1} onChange={(e) => setLine1(e.target.value)} autoComplete="address-line1" required /></label>
          <div className="grid-3">
            <label className="field"><span>City</span><input className="input" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" required /></label>
            <label className="field"><span>{u?.country === "US" ? "State" : "Province"}</span><input className="input" value={region} onChange={(e) => setRegion(e.target.value)} autoComplete="address-level1" maxLength={2} placeholder={u?.country === "US" ? "CA" : "ON"} required /></label>
            <label className="field"><span>{u?.country === "US" ? "ZIP" : "Postal code"}</span><input className="input" value={postal} onChange={(e) => setPostal(e.target.value)} autoComplete="postal-code" required /></label>
          </div>
          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>{busy ? "Starting…" : "Start verification"}</button>
          <p className="fineprint center">Tier {tier} verification. Your data is handled under our <a href="/legal/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
        </form>
      )}
    </Modal>
  );
}
