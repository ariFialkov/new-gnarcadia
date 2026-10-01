import { useMemo } from "react";
import { api, type Reconciliation } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useApp, LIVE_INTERVAL_MS } from "../lib/store";
import { money, num, numCompact } from "../lib/format";
import { KpiTile } from "../components/KpiTile";
import { Panel, ErrorBox, SkeletonBlock, Async } from "../components/Panel";
import { SmallMultiples, type SeriesSpec } from "../components/Charts";
import { Badge } from "../components/Badge";
import type { AnalyticsOverview } from "@gnarcadia/protocol";

type TS = AnalyticsOverview["timeseries"][number];

export default function MoneyPage() {
  const { overview, days, palette, live, adminKey } = useApp();
  const d = overview.data;
  const L = overview.loading && !d;
  const recon = useApi(adminKey ? (signal) => api.reconcile(signal) : null, [adminKey], live ? LIVE_INTERVAL_MS : 0);

  const series = useMemo<SeriesSpec<TS>[]>(
    () => [
      { key: "deposits", label: "Deposits", color: palette.series[0], value: (r) => r.depositsCents, format: (v) => money(v, "CAD", { code: false }), tick: (v) => "$" + numCompact(v / 100) },
      { key: "rake", label: "Rake", color: palette.series[1], value: (r) => r.rakeCents, format: (v) => money(v, "CAD", { code: false }), tick: (v) => "$" + numCompact(v / 100) },
    ],
    [palette],
  );

  const totalFloat = (d?.money ?? []).map((m) => `${money(m.floatCents, m.currency, { code: false })} ${m.currency}`).join(" · ");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Money</h1>
          <p>All amounts are integer cents in the ledger; shown per currency.</p>
        </div>
      </div>
      {overview.error && !d && <ErrorBox error={overview.error} onRetry={overview.reload} />}

      <div className="grid two">
        {(d?.money ?? [{ currency: "CAD" }, { currency: "USD" }]).map((m) => {
          const mm = m as Partial<AnalyticsOverview["money"][number]> & { currency: "CAD" | "USD" };
          const net = (mm.depositsCents ?? 0) - (mm.withdrawalsCents ?? 0);
          return (
            <Panel key={m.currency} title={m.currency} sub={m.currency === "CAD" ? "Canadian players" : "US players"} stale={overview.refreshing} right={<Badge tone={net >= 0 ? "good" : "warning"} icon={net >= 0 ? "▲" : "▼"}>net {money(net, m.currency, { code: false })}</Badge>}>
              <div className="grid kpis" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                <KpiTile small label="Deposits" value={money(mm.depositsCents ?? 0, m.currency, { code: false })} loading={L} foot="succeeded intents" />
                <KpiTile small label="Withdrawals" value={money(mm.withdrawalsCents ?? 0, m.currency, { code: false })} loading={L} foot="pending + succeeded" />
                <KpiTile small label="Rake revenue" value={money(mm.rakeCents ?? 0, m.currency, { code: false })} loading={L} />
                <KpiTile small label="Marketplace" value={money(mm.marketplaceCents ?? 0, m.currency, { code: false })} loading={L} />
                <KpiTile small label="Float" value={money(mm.floatCents ?? 0, m.currency, { code: false })} loading={L} foot="player liabilities" />
                <KpiTile small label="Hold ratio" value={mm.depositsCents ? `${(((mm.rakeCents ?? 0) + (mm.marketplaceCents ?? 0)) / mm.depositsCents * 100).toFixed(1)}%` : "–"} loading={L} foot="revenue ÷ deposits" />
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid two">
        <Panel title={`Deposits vs rake · last ${days} days`} sub="Separate axes - the two measures differ by an order of magnitude" stale={overview.refreshing}>
          {d ? <SmallMultiples data={d.timeseries} series={series} rowHeight={110} /> : L ? <SkeletonBlock rows={6} h={22} /> : null}
        </Panel>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Float (player liabilities)" sub="What the platform must hold in cash on behalf of players">
            <div className="kpi-value" style={{ fontSize: 28 }}>
              {d ? totalFloat || "–" : "–"}
            </div>
            <p className="text-2" style={{ fontSize: 13, marginTop: 10 }}>
              Float = sum of every player&apos;s <b>cash</b> balance plus funds in <b>match escrow</b>. Bonus balances are excluded (they are promotional credit, not a liability). The number must always be covered by funds at the payment processor / bank; it rises on deposits and match entries and falls on withdrawals, rake and marketplace purchases.
            </p>
          </Panel>
          <Panel title="Ledger reconciliation" sub="GET /admin/ledger/reconcile · double-entry: every currency must sum to zero" stale={recon.refreshing} right={recon.data && <ReconBadge all={Object.values(recon.data)} />}>
            <Async state={recon} skeleton={<SkeletonBlock rows={5} />}>
              {(r) => (
                <div className="grid two" style={{ gap: 10 }}>
                  {(["CAD", "USD"] as const).map((c) => (
                    <ReconCard key={c} r={r[c]} />
                  ))}
                </div>
              )}
            </Async>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReconBadge({ all }: { all: Reconciliation[] }) {
  const ok = all.every((r) => r.balanced);
  return (
    <Badge tone={ok ? "good" : "critical"} icon={ok ? "✓" : "✕"}>
      {ok ? "Balanced" : "Out of balance"}
    </Badge>
  );
}

function ReconCard({ r }: { r: Reconciliation }) {
  const rows: [string, number][] = [
    ["User cash", r.userCashTotal],
    ["User bonus", r.userBonusTotal],
    ["Match escrow", r.escrow],
    ["Platform clearing", r.clearing],
    ["Platform revenue", r.revenue],
    ["Platform promo", r.promo],
  ];
  const sum = rows.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="jur-card" style={{ gridTemplateColumns: "1fr auto" }}>
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b>{r.currency}</b>
        <Badge tone={r.balanced ? "good" : "critical"} icon={r.balanced ? "✓" : "✕"}>
          {r.balanced ? "balanced" : `off by ${num(sum)}¢`}
        </Badge>
      </div>
      {rows.map(([k, v]) => (
        <RowKV key={k} k={k} v={money(v, r.currency, { code: false })} neg={v < 0} />
      ))}
      <div className="note" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Float (cash + escrow)</span>
        <b className="tabular">{money(r.floatCents, r.currency, { code: false })}</b>
      </div>
    </div>
  );
}

function RowKV({ k, v, neg }: { k: string; v: string; neg?: boolean }) {
  return (
    <>
      <span className="k" style={{ fontSize: 12.5 }}>
        {k}
      </span>
      <span className="tabular" style={{ textAlign: "right", color: neg ? "var(--text-2)" : "var(--text)" }}>
        {v}
      </span>
    </>
  );
}
