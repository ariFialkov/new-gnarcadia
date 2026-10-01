import { useCallback, useEffect, useMemo, useState } from "react";
import type { WalletTxn } from "@gnarcadia/protocol";
import { Modal } from "../components/Modal.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { api, errorMessage, isApiError, type DepositMethod, type PayoutMethod, type WalletInfo } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useGate } from "../lib/gate.tsx";
import { useToast } from "../components/Toast.tsx";
import { money, relativeTime, dateTime } from "../lib/format.ts";
import { track } from "../lib/analytics.ts";
import { useModals, type ModalHandle } from "./ModalManager.tsx";
import { TaxInfoModal } from "./TaxInfoModal.tsx";

type Tab = "deposit" | "withdraw" | "history";
interface Props extends ModalHandle<void> { initialTab?: Tab; suggestedCents?: number; reason?: string }

export const METHOD_LABELS: Record<string, string> = {
  card: "Credit / Debit card", interac: "Interac e-Transfer", bank: "Bank account (pay by bank)", card_push: "Instant to debit card", wallet: "e-Wallet",
};
const METHOD_ICON: Record<string, string> = { card: "💳", interac: "⚡", bank: "🏦", card_push: "💸", wallet: "👛" };
const DEPOSIT_FEE_HINT: Record<string, string> = { card: "Processing fee ~2.9% + 30¢ · instant", interac: "No fee · usually instant", bank: "No fee · instant via your bank login", wallet: "Fee set by your wallet provider" };
const PAYOUT_FEE_HINT: Record<string, string> = { interac: "No fee · within 30 minutes", bank: "$1 fee · 1–3 business days", card_push: "$1 fee · usually within minutes", wallet: "Fee set by your wallet provider" };
const KIND_LABEL: Record<string, string> = { deposit: "Deposit", deposit_reversal: "Deposit reversed", withdrawal: "Withdrawal", withdrawal_reversal: "Withdrawal returned", match_entry: "Entry fee", match_refund: "Entry refunded", match_payout: "Prize", match_rake: "Platform fee", bounty_transfer: "Bounty", marketplace_purchase: "Marketplace", bonus_grant: "Bonus", adjustment: "Adjustment" };

export function WalletModal({ dismiss, initialTab = "deposit", suggestedCents, reason }: Props) {
  const auth = useAuth();
  const gate = useGate();
  const toast = useToast();
  const modals = useModals();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(() => api.wallet().then((w) => { setInfo(w); setLoadErr(null); }).catch((e) => setLoadErr(errorMessage(e))), []);
  useEffect(() => { track("wallet_open", { tab: initialTab }); void load(); }, [load, initialTab]);

  const cur = info?.currency ?? auth.user?.currency ?? "CAD";
  const balance = info?.balanceCents ?? auth.user?.balanceCents ?? 0;

  return (
    <Modal onClose={dismiss} ariaLabel="Wallet" size="md" className="wallet-modal" hero={
      <div className="wallet-hero">
        <div className="wallet-hero__label">Your balance</div>
        <div className="wallet-hero__amt">{money(balance, cur)}</div>
        {!!info?.bonusCents && <div className="wallet-hero__bonus">+ {money(info.bonusCents, cur)} bonus</div>}
        {reason && <div className="wallet-hero__reason">{reason}</div>}
      </div>
    }>
      <div className="tabs" role="tablist" aria-label="Wallet sections">
        {(["deposit", "withdraw", "history"] as Tab[]).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tab ${tab === t ? "is-active" : ""}`} onClick={() => setTab(t)}>{t === "deposit" ? "Deposit" : t === "withdraw" ? "Withdraw" : "History"}</button>
        ))}
      </div>
      {loadErr && !info && <div className="alert alert--error" role="alert">{loadErr} <button type="button" className="link" onClick={() => void load()}>Retry</button></div>}
      {!info && !loadErr && <div className="skeleton-stack"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
      {info && tab === "deposit" && <DepositPane info={info} suggestedCents={suggestedCents} reload={load} onDone={() => void auth.refresh()} gate={gate} toast={toast} />}
      {info && tab === "withdraw" && <WithdrawPane info={info} reload={load} onDone={() => void auth.refresh()} gate={gate} toast={toast} openTax={(th) => modals.open<boolean>((h) => <TaxInfoModal {...h} thresholdCents={th} />)} country={auth.user?.country ?? "CA"} email={auth.user?.email ?? ""} />}
      {info && tab === "history" && <HistoryPane info={info} />}
    </Modal>
  );
}

// ---------------- amount input shared ----------------
function AmountPicker({ quick, cur, value, onChange, max }: { quick: number[]; cur: "CAD" | "USD"; value: number; onChange: (c: number) => void; max?: number }) {
  const [custom, setCustom] = useState(quick.includes(value) ? "" : value ? String(value / 100) : "");
  return (
    <div className="stack-sm">
      <div className="quick-amounts" role="group" aria-label="Quick amounts">
        {quick.map((c) => <button key={c} type="button" className={`chip chip--lg ${value === c && !custom ? "is-active" : ""}`} onClick={() => { setCustom(""); onChange(c); }} disabled={max !== undefined && c > max}>{money(c, cur, { compact: true })}</button>)}
      </div>
      <label className="field">
        <span>Custom amount</span>
        <div className="input-wrap input-wrap--money">
          <span className="input-prefix" aria-hidden="true">$</span>
          <input className="input" inputMode="decimal" placeholder="0.00" value={custom} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setCustom(v); const cents = Math.round(parseFloat(v || "0") * 100); onChange(Number.isFinite(cents) ? cents : 0); }} aria-label="Custom amount in dollars" />
          <span className="input-suffix">{cur}</span>
        </div>
      </label>
    </div>
  );
}

function MethodPicker<T extends string>({ methods, value, onChange, hints }: { methods: T[]; value: T | null; onChange: (m: T) => void; hints: Record<string, string> }) {
  if (!methods.length) return <div className="alert alert--warn">No payment methods are available for your country yet.</div>;
  return (
    <div className="methods" role="radiogroup" aria-label="Payment method">
      {methods.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} className={`method ${value === m ? "is-active" : ""}`} onClick={() => onChange(m)}>
          <span className="method__icon" aria-hidden="true">{METHOD_ICON[m] ?? "💰"}</span>
          <span className="method__body"><strong>{METHOD_LABELS[m] ?? m}</strong><small>{hints[m] ?? ""}</small></span>
          <span className="method__radio" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

// ---------------- deposit ----------------
function DepositPane({ info, suggestedCents, reload, onDone, gate, toast }: { info: WalletInfo; suggestedCents?: number; reload: () => Promise<void>; onDone: () => void; gate: ReturnType<typeof useGate>; toast: ReturnType<typeof useToast> }) {
  const quick = info.quickAmountsCents?.length ? info.quickAmountsCents : [1000, 2000, 5000, 10000, 20000];
  const remaining = Math.max(0, info.limits.dailyDepositCapCents - info.limits.usedTodayCents);
  const usedPct = info.limits.dailyDepositCapCents > 0 ? Math.min(100, Math.round((info.limits.usedTodayCents / info.limits.dailyDepositCapCents) * 100)) : 0;
  const [amount, setAmount] = useState<number>(suggestedCents && suggestedCents > 0 ? Math.max(500, Math.ceil(suggestedCents / 500) * 500) : quick[1] ?? 2000);
  const [method, setMethod] = useState<DepositMethod | null>(info.methods.deposit[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; amount: number; redirect?: string | null } | null>(null);

  const problems = useMemo(() => {
    if (amount < 500) return "Minimum deposit is $5.";
    if (amount > 100_000) return "Maximum deposit is $1,000 per transaction.";
    if (amount > remaining) return `That's over your remaining daily limit (${money(remaining, info.currency, { compact: true })}).`;
    if (!method) return "Choose a payment method.";
    return null;
  }, [amount, remaining, method, info.currency]);

  async function submit() {
    if (problems || !method) { setError(problems); return; }
    setBusy(true); setError(null);
    try {
      if (!(await gate.ensureEligible("Verify once to unlock deposits."))) { setBusy(false); return; }
      let r;
      try { r = await api.deposit({ amountCents: amount, method }); }
      catch (e) {
        if (isApiError(e) && e.status === 403 && (await gate.handleGateError(e))) r = await api.deposit({ amountCents: amount, method });
        else throw e;
      }
      track("deposit", { amountCents: amount, method, status: r.status });
      if (r.redirectUrl) { setDone({ status: "redirect", amount, redirect: r.redirectUrl }); window.location.assign(r.redirectUrl); return; }
      setDone({ status: r.status, amount });
      await reload(); onDone();
    } catch (e) {
      if (isApiError(e) && e.code === "deposit_limit") setError(`${e.message} Used today: ${money(e.details?.usedCents ?? 0, info.currency)} of ${money(e.details?.capCents ?? 0, info.currency)}.`);
      else setError(errorMessage(e));
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="stack center deposit-done">
        {done.status === "succeeded" && <Confetti />}
        <div className="big-emoji" aria-hidden="true">{done.status === "succeeded" ? "🤑" : done.status === "failed" ? "😬" : "⏳"}</div>
        <h3>{done.status === "succeeded" ? `${money(done.amount, info.currency)} added!` : done.status === "failed" ? "Deposit failed" : done.status === "redirect" ? "Finishing with your bank…" : "Deposit pending"}</h3>
        <p className="muted">{done.status === "succeeded" ? "Your balance is updated. Go win something." : done.status === "failed" ? "Your payment method declined. Nothing was charged — try another method." : done.status === "redirect" ? "Complete the payment in the window that opened. We'll update your balance as soon as it clears." : "We'll credit your wallet as soon as the processor confirms. Usually under a minute."}</p>
        <div className="row row--center">
          {done.status === "redirect" && done.redirect && <a className="btn btn--ghost" href={done.redirect}>Re-open payment page</a>}
          <button type="button" className="btn btn--primary" onClick={() => { setDone(null); void reload(); }}>{done.status === "succeeded" ? "Deposit more" : "Back"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <AmountPicker quick={quick} cur={info.currency} value={amount} onChange={setAmount} />
      <div className="limit-bar" aria-label={`Daily deposit limit: ${money(info.limits.usedTodayCents, info.currency)} used of ${money(info.limits.dailyDepositCapCents, info.currency)}`}>
        <div className="limit-bar__head"><span>Daily limit</span><span>{money(remaining, info.currency, { compact: true })} left today</span></div>
        <div className="limit-bar__track"><div className="limit-bar__fill" style={{ width: `${usedPct}%` }} /></div>
      </div>
      <MethodPicker methods={info.methods.deposit} value={method} onChange={setMethod} hints={DEPOSIT_FEE_HINT} />
      {(error || problems) && amount > 0 && <div className={`alert ${error ? "alert--error" : "alert--info"}`} role={error ? "alert" : undefined}>{error ?? problems}</div>}
      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy || !!problems} onClick={submit}>{busy ? "Processing…" : `Deposit ${money(amount, info.currency, { compact: true })}`}</button>
      <p className="fineprint center">Funds are held in a segregated player account. Deposits are subject to your daily limit; change it under Profile → Responsible play.</p>
    </div>
  );
}

// ---------------- withdraw ----------------
function WithdrawPane({ info, reload, onDone, gate, toast, openTax, country, email }: { info: WalletInfo; reload: () => Promise<void>; onDone: () => void; gate: ReturnType<typeof useGate>; toast: ReturnType<typeof useToast>; openTax: (th?: number) => Promise<boolean | undefined>; country: "CA" | "US"; email: string }) {
  const [amount, setAmount] = useState<number>(Math.min(info.balanceCents, 2000) || 1000);
  const [method, setMethod] = useState<PayoutMethod | null>(info.methods.payout[0] ?? null);
  const [dest, setDest] = useState<Record<string, string>>({ email });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; amount: number } | null>(null);
  const set = (k: string, v: string) => setDest((d) => ({ ...d, [k]: v }));

  const problems = useMemo(() => {
    if (amount < 1000) return "Minimum withdrawal is $10.";
    if (amount > info.balanceCents) return "That's more than your available balance.";
    if (!method) return "Choose a payout method.";
    if (method === "interac" && !/.+@.+\..+/.test(dest.email ?? "")) return "Enter the email registered for Interac e-Transfer.";
    if (method === "bank" && country === "CA" && !(/^\d{3}$/.test(dest.institution ?? "") && /^\d{5}$/.test(dest.transit ?? "") && /^\d{5,12}$/.test(dest.account ?? ""))) return "Enter institution (3 digits), transit (5 digits) and account number.";
    if (method === "bank" && country === "US" && !(/^\d{9}$/.test(dest.routing ?? "") && /^\d{4,17}$/.test(dest.account ?? ""))) return "Enter routing (9 digits) and account number.";
    if (method === "card_push" && !/^\d{4}$/.test(dest.last4 ?? "")) return "Enter the last 4 digits of your debit card.";
    return null;
  }, [amount, info.balanceCents, method, dest, country]);

  async function submit() {
    if (problems || !method) { setError(problems); return; }
    setBusy(true); setError(null);
    try {
      if (!(await gate.ensureEligible("Verify once to unlock withdrawals."))) { setBusy(false); return; }
      const attempt = () => api.withdraw({ amountCents: amount, method, destination: dest });
      let r;
      try { r = await attempt(); }
      catch (e) {
        if (isApiError(e) && e.code === "tax_id_required") { if (await openTax(e.details?.thresholdCents)) r = await attempt(); else { setBusy(false); return; } }
        else if (isApiError(e) && e.status === 403 && (await gate.handleGateError(e))) r = await attempt();
        else throw e;
      }
      track("withdraw", { amountCents: amount, method, status: r.status });
      setDone({ status: r.status, amount });
      await reload(); onDone();
      toast.success("Withdrawal requested. We'll email you when it's sent.");
    } catch (e) {
      if (isApiError(e) && e.code === "insufficient_funds") setError("Insufficient funds for that amount.");
      else setError(errorMessage(e));
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="stack center">
        <div className="big-emoji" aria-hidden="true">{done.status === "failed" ? "😬" : "🚀"}</div>
        <h3>{done.status === "failed" ? "Withdrawal failed" : done.status === "succeeded" ? `${money(done.amount, info.currency)} sent!` : `${money(done.amount, info.currency)} on its way`}</h3>
        <p className="muted">{done.status === "failed" ? "The payout couldn't be processed; the funds are back in your wallet." : "We've debited your wallet and sent the payout for processing. Check History for status."}</p>
        <button type="button" className="btn btn--primary" onClick={() => setDone(null)}>Done</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row row--between muted"><span>Available</span><strong>{money(info.balanceCents, info.currency)}</strong></div>
      <AmountPicker quick={[1000, 2500, 5000, 10000].filter((c) => c <= Math.max(1000, info.balanceCents))} cur={info.currency} value={amount} onChange={setAmount} max={info.balanceCents} />
      <button type="button" className="link" onClick={() => setAmount(info.balanceCents)} disabled={info.balanceCents < 1000}>Withdraw everything ({money(info.balanceCents, info.currency)})</button>
      <MethodPicker methods={info.methods.payout} value={method} onChange={setMethod} hints={PAYOUT_FEE_HINT} />
      {method === "interac" && <label className="field"><span>Interac e-Transfer email</span><input className="input" type="email" autoComplete="email" value={dest.email ?? ""} onChange={(e) => set("email", e.target.value)} /></label>}
      {method === "bank" && country === "CA" && (
        <div className="grid-3">
          <label className="field"><span>Institution</span><input className="input" inputMode="numeric" maxLength={3} placeholder="004" value={dest.institution ?? ""} onChange={(e) => set("institution", e.target.value.replace(/\D/g, ""))} /></label>
          <label className="field"><span>Transit</span><input className="input" inputMode="numeric" maxLength={5} placeholder="12345" value={dest.transit ?? ""} onChange={(e) => set("transit", e.target.value.replace(/\D/g, ""))} /></label>
          <label className="field"><span>Account</span><input className="input" inputMode="numeric" maxLength={12} value={dest.account ?? ""} onChange={(e) => set("account", e.target.value.replace(/\D/g, ""))} /></label>
        </div>
      )}
      {method === "bank" && country === "US" && (
        <div className="grid-2">
          <label className="field"><span>Routing number</span><input className="input" inputMode="numeric" maxLength={9} value={dest.routing ?? ""} onChange={(e) => set("routing", e.target.value.replace(/\D/g, ""))} /></label>
          <label className="field"><span>Account number</span><input className="input" inputMode="numeric" maxLength={17} value={dest.account ?? ""} onChange={(e) => set("account", e.target.value.replace(/\D/g, ""))} /></label>
        </div>
      )}
      {method === "card_push" && (
        <div className="grid-2">
          <label className="field"><span>Name on card</span><input className="input" autoComplete="cc-name" value={dest.name ?? ""} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="field"><span>Debit card · last 4</span><input className="input" inputMode="numeric" maxLength={4} placeholder="4242" value={dest.last4 ?? ""} onChange={(e) => set("last4", e.target.value.replace(/\D/g, ""))} /></label>
          <p className="fineprint" style={{ gridColumn: "1 / -1" }}>Card tokenisation happens on our processor's secure page after you confirm.</p>
        </div>
      )}
      {(error || problems) && <div className={`alert ${error ? "alert--error" : "alert--info"}`} role={error ? "alert" : undefined}>{error ?? problems}</div>}
      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy || !!problems} onClick={submit}>{busy ? "Sending…" : `Withdraw ${money(amount, info.currency, { compact: true })}`}</button>
      <p className="fineprint center">Payouts go to an account in your own name. Withdrawals over $500 may need enhanced verification.</p>
    </div>
  );
}

// ---------------- history ----------------
function HistoryPane({ info }: { info: WalletInfo }) {
  const [txns, setTxns] = useState<WalletTxn[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.transactions().then(setTxns).catch((e) => setErr(errorMessage(e))); }, []);
  const pending = info.intents.filter((i) => i.status === "pending");
  return (
    <div className="stack">
      {pending.length > 0 && (
        <section>
          <h4 className="eyebrow">In progress</h4>
          <ul className="txn-list">
            {pending.map((i) => (
              <li key={i.id} className="txn">
                <span className="txn__icon" aria-hidden="true">⏳</span>
                <span className="txn__body"><strong>{i.direction === "deposit" ? "Deposit" : "Withdrawal"} · {METHOD_LABELS[i.method] ?? i.method}</strong><small>{relativeTime(i.createdAt)} · pending</small></span>
                <span className="txn__amt">{money(i.amountCents, info.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h4 className="eyebrow">Transactions</h4>
        {err && <div className="alert alert--error">{err}</div>}
        {!txns && !err && <div className="skeleton-stack"><div className="skeleton" /><div className="skeleton" /></div>}
        {txns && txns.length === 0 && <div className="empty"><div className="empty__emoji" aria-hidden="true">🧾</div><p>No transactions yet. Your first deposit will show up here.</p></div>}
        {txns && txns.length > 0 && (
          <ul className="txn-list">
            {txns.map((t) => (
              <li key={t.id} className="txn" title={dateTime(t.createdAt)}>
                <span className="txn__icon" aria-hidden="true">{t.deltaCents >= 0 ? "🟢" : "🔻"}</span>
                <span className="txn__body"><strong>{KIND_LABEL[t.kind] ?? t.kind}</strong><small>{relativeTime(t.createdAt)}{t.status && t.status !== "posted" ? ` · ${t.status}` : ""}</small></span>
                <span className={`txn__amt ${t.deltaCents >= 0 ? "pos" : "neg"}`}>{money(t.deltaCents, info.currency, { sign: true })}<small>{money(t.balanceAfterCents, info.currency)}</small></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
