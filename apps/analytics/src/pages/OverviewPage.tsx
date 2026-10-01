import { useMemo } from "react";
import { useApp } from "../lib/store";
import { money, num, numCompact, titleCase } from "../lib/format";
import { KpiTile } from "../components/KpiTile";
import { Panel, ErrorBox, SkeletonBlock } from "../components/Panel";
import { HBarChart, SmallMultiples, type SeriesSpec } from "../components/Charts";
import type { AnalyticsOverview } from "@gnarcadia/protocol";

type TS = AnalyticsOverview["timeseries"][number];

export default function OverviewPage() {
  const { overview, days, palette } = useApp();
  const d = overview.data;
  const L = overview.loading && !d;

  const series = useMemo<SeriesSpec<TS>[]>(
    () => [
      { key: "signups", label: "Signups", color: palette.series[0], value: (r) => r.signups, format: num },
      { key: "matches", label: "Matches", color: palette.series[1], value: (r) => r.matches, format: num },
      { key: "rake", label: "Rake", color: palette.series[2], value: (r) => r.rakeCents, format: (v) => money(v, "CAD", { code: false }), tick: (v) => "$" + numCompact(v / 100) },
      { key: "deposits", label: "Deposits", color: palette.series[3], value: (r) => r.depositsCents, format: (v) => money(v, "CAD", { code: false }), tick: (v) => "$" + numCompact(v / 100) },
    ],
    [palette],
  );

  const byFormat = useMemo(
    () =>
      Object.entries(d?.matches.byFormat ?? {})
        .map(([k, v]) => ({ label: titleCase(k), value: v }))
        .sort((a, b) => b.value - a.value),
    [d],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Lifetime totals with a {days}-day trend window. Refreshes with the live toggle.</p>
        </div>
      </div>
      {overview.error && !d && <ErrorBox error={overview.error} onRetry={overview.reload} />}

      <section>
        <h3 style={{ marginBottom: 10 }}>Users</h3>
        <div className="grid kpis">
          <KpiTile label="Total users" value={num(d?.users.total)} loading={L} foot={<span>+{num(d?.users.new7d)} in the last 7 days</span>} />
          <KpiTile label="Daily active" value={num(d?.users.dau)} loading={L} foot="seen in the last 24h" />
          <KpiTile label="Weekly active" value={num(d?.users.wau)} loading={L} foot={d ? `${d.users.wau ? ((d.users.dau / d.users.wau) * 100).toFixed(0) : 0}% DAU/WAU stickiness` : ""} />
          <KpiTile label="Monthly active" value={num(d?.users.mau)} loading={L} foot={d ? `${d.users.mau ? ((d.users.wau / d.users.mau) * 100).toFixed(0) : 0}% WAU/MAU` : ""} />
          <KpiTile label="KYC approved" value={num(d?.users.kycApproved)} loading={L} foot={d ? `${d.users.total ? ((d.users.kycApproved / d.users.total) * 100).toFixed(1) : 0}% of users` : ""} />
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 10 }}>Matches</h3>
        <div className="grid kpis">
          <KpiTile label="Matches total" value={num(d?.matches.total)} loading={L} />
          <KpiTile label="Matches 24h" value={num(d?.matches.last24h)} loading={L} />
          <KpiTile label="Avg entry (cash)" value={money(d?.matches.avgEntryCents ?? 0, "CAD", { code: false })} loading={L} foot="practice matches excluded" />
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 10 }}>Money</h3>
        <div className="grid two">
          {(d?.money ?? [{ currency: "CAD" }, { currency: "USD" }]).map((m) => (
            <div className="panel tight" key={m.currency}>
              <div className="panel-head">
                <h2>{m.currency}</h2>
                <span className="badge neutral">{m.currency === "CAD" ? "Canada" : "United States"}</span>
              </div>
              <div className="grid kpis" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                <KpiTile small label="Deposits" value={money((m as { depositsCents?: number }).depositsCents ?? 0, m.currency, { code: false })} loading={L} />
                <KpiTile small label="Withdrawals" value={money((m as { withdrawalsCents?: number }).withdrawalsCents ?? 0, m.currency, { code: false })} loading={L} />
                <KpiTile small label="Rake" value={money((m as { rakeCents?: number }).rakeCents ?? 0, m.currency, { code: false })} loading={L} />
                <KpiTile small label="Marketplace" value={money((m as { marketplaceCents?: number }).marketplaceCents ?? 0, m.currency, { code: false })} loading={L} />
                <KpiTile small label="Float" value={money((m as { floatCents?: number }).floatCents ?? 0, m.currency, { code: false })} loading={L} foot="owed to players" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid two">
        <Panel title={`Trends · last ${days} days`} sub="One axis per measure (small multiples); hover for all values on a day" stale={overview.refreshing} className="span-2">
          {d ? <SmallMultiples data={d.timeseries} series={series} /> : L ? <SkeletonBlock rows={8} h={22} /> : null}
        </Panel>
        <Panel title="Matches by format" sub="Lifetime, all games">
          {d ? <HBarChart data={byFormat} showTable /> : L ? <SkeletonBlock /> : null}
        </Panel>
      </div>
    </div>
  );
}
