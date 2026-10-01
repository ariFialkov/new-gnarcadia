import { useState, type FormEvent } from "react";
import { Modal } from "../components/Modal.tsx";
import { api, errorMessage } from "../lib/api.ts";
import type { ModalHandle } from "./ModalManager.tsx";

/** Minimal W-9 attestation: legal name + last 4 of TIN. Full TIN is collected by the tax vendor in production. */
export function TaxInfoModal({ resolve, dismiss, thresholdCents }: ModalHandle<boolean> & { thresholdCents?: number }) {
  const [legalName, setLegalName] = useState("");
  const [tin, setTin] = useState("");
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(tin)) { setError("Enter the last 4 digits of your SSN or ITIN."); return; }
    setBusy(true); setError(null);
    try { await api.taxInfo({ attestW9: true, legalName: legalName.trim(), tinLast4: tin }); resolve(true); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="Tax information (Form W-9)" onClose={dismiss} size="sm">
      <form className="stack" onSubmit={submit}>
        <p className="muted">Congrats on the winnings! US tax rules require us to collect a W-9 once your net winnings pass {thresholdCents ? `$${(thresholdCents / 100).toLocaleString()}` : "the IRS reporting threshold"} in a calendar year. We'll issue a 1099-MISC in January.</p>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <label className="field"><span>Legal name (as on your tax return)</span><input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} autoComplete="name" required minLength={2} data-autofocus /></label>
        <label className="field"><span>Last 4 digits of SSN / ITIN</span><input className="input" value={tin} onChange={(e) => setTin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" pattern="\d{4}" maxLength={4} required /></label>
        <label className="check">
          <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} required />
          <span>Under penalties of perjury, I certify that the number shown is my correct taxpayer identification number, I am a U.S. person, and I am not subject to backup withholding.</span>
        </label>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !attest}>{busy ? "Saving…" : "Submit W-9"}</button>
        <p className="fineprint center">Full TIN collection is completed with our tax vendor; we only keep the last 4 digits.</p>
      </form>
    </Modal>
  );
}
