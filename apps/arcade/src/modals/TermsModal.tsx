import { useEffect, useState } from "react";
import { Modal } from "../components/Modal.tsx";
import { api, errorMessage } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { TERMS_SUMMARY } from "../legal/index.ts";
import { MarkdownLite } from "../components/MarkdownLite.tsx";
import { TERMS } from "../legal/terms.ts";
import type { ModalHandle } from "./ModalManager.tsx";

export function TermsModal({ resolve, dismiss }: ModalHandle<boolean>) {
  const auth = useAuth();
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.termsCurrent().then((t) => setVersion(t.version)).catch(() => setError("Couldn't load the current terms version. Please try again.")); }, []);

  async function accept() {
    if (!version) return;
    setBusy(true); setError(null);
    try { await api.termsAccept(version); await auth.refresh(); resolve(true); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="Updated Terms of Service" onClose={dismiss} size="md">
      <div className="stack">
        <p className="muted">Before you play for cash we need you to accept the current terms{version ? ` (version ${version})` : ""}. The short version:</p>
        <ul className="bullets">
          {TERMS_SUMMARY.map((b) => <li key={b}>{b}</li>)}
        </ul>
        <div className="scrollbox" tabIndex={0} aria-label="Full terms of service">
          <MarkdownLite source={TERMS} />
        </div>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <div className="row row--end">
          <button type="button" className="btn btn--ghost" onClick={() => resolve(false)}>Not now</button>
          <button type="button" className="btn btn--primary" onClick={accept} disabled={busy || !version}>{busy ? "Saving…" : "I accept"}</button>
        </div>
      </div>
    </Modal>
  );
}
