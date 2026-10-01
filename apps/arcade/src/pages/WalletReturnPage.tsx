import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage, type PaymentIntent } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useDocumentTitle, useInterval } from "../lib/hooks.ts";
import { money } from "../lib/format.ts";
import { Confetti } from "../components/Confetti.tsx";
import { METHOD_LABELS } from "../modals/WalletModal.tsx";

/** Processor redirect target: /wallet/return?intent=<id>. Polls GET /wallet until the intent leaves "pending". */
export function WalletReturnPage() {
  useDocumentTitle("Payment status");
  const [params] = useSearchParams();
  const intentId = params.get("intent");
  const auth = useAuth();
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const final = intent && intent.status !== "pending";

  const check = async () => {
    if (!intentId || !auth.user) return;
    try { const w = await api.wallet(); const i = w.intents.find((x) => x.id === intentId) ?? null; setIntent(i); setErr(i ? null : "We couldn't find that payment on your account."); if (i && i.status !== "pending") void auth.refresh(); }
    catch (e) { setErr(errorMessage(e)); }
    finally { setTries((t) => t + 1); }
  };
  useEffect(() => { void check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [intentId, auth.user?.id]);
  useInterval(() => void check(), !final && tries < 40 && auth.user ? 3000 : null);

  const cur = auth.user?.currency ?? "CAD";
  return (
    <div className="container page page--narrow">
      <div className="card card--pad center stack">
        {intent?.status === "succeeded" && <Confetti />}
        {!intentId ? (<><div className="big-emoji" aria-hidden="true">🤔</div><h1 className="page-title">No payment to check</h1><p className="muted">This page is where your bank sends you back after a deposit.</p></>)
          : !auth.user && auth.ready ? (<><div className="big-emoji" aria-hidden="true">🔐</div><h1 className="page-title">Sign in to see your payment</h1></>)
          : !intent && !err ? (<><div className="spinner" aria-hidden="true" /><h1 className="page-title">Checking your payment…</h1></>)
          : err && !intent ? (<><div className="big-emoji" aria-hidden="true">📡</div><h1 className="page-title">Hmm</h1><p className="muted">{err}</p><button type="button" className="btn btn--primary" onClick={() => void check()}>Try again</button></>)
          : intent && (
            <>
              <div className="big-emoji" aria-hidden="true">{intent.status === "succeeded" ? "🤑" : intent.status === "failed" ? "😬" : intent.status === "reversed" ? "↩️" : "⏳"}</div>
              <h1 className="page-title">{intent.status === "succeeded" ? `${money(intent.amountCents, cur)} added!` : intent.status === "failed" ? "Payment didn't go through" : intent.status === "pending" ? "Payment pending" : `Payment ${intent.status}`}</h1>
              <p className="muted">{intent.direction === "deposit" ? "Deposit" : "Withdrawal"} via {METHOD_LABELS[intent.method] ?? intent.method}{intent.feeCents ? ` · fee ${money(intent.feeCents, cur)}` : ""}.{intent.status === "pending" ? tries >= 40 ? " Still waiting on the processor; we'll credit your wallet automatically when it confirms." : " Waiting for confirmation — this usually takes under a minute." : ""}</p>
              {intent.status === "pending" && tries < 40 && <div className="spinner" aria-hidden="true" />}
            </>
          )}
        <div className="row row--center"><Link to="/games" className="btn btn--cta">Back to games</Link><Link to="/profile" className="btn btn--ghost">Wallet &amp; profile</Link></div>
      </div>
    </div>
  );
}
