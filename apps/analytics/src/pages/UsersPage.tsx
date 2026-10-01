import { useMemo } from "react";
import { useApp } from "../lib/store";
import { money, num } from "../lib/format";
import { regionName, regionStatus } from "../lib/regions";
import { Panel, ErrorBox, SkeletonBlock } from "../components/Panel";
import { Funnel, SmallMultiples } from "../components/Charts";
import { Table, type Column } from "../components/Table";
import { StatusBadge } from "../components/Badge";
import type { AnalyticsOverview } from "@gnarcadia/protocol";

type RegionRow = AnalyticsOverview["regions"][number];

export default function UsersPage() {
  const { overview, days, palette } = useApp();
  const d = overview.data;
  const L = overview.loading && !d;

  const stages = useMemo(() => {
    const f = d?.funnel;
    if (!f) return [];
    return [
      { label: "Signups", value: f.signups },
      { label: "Geo verified", value: f.geoVerified },
      { label: "KYC approved", value: f.kycApproved },
      { label: "Deposited", value: f.deposited },
      { label: "Played (cash)", value: f.played },
      { label: "Withdrew", value: f.withdrew },
    ];
  }, [d]);

  const columns: Column<RegionRow>[] = [
    { key: "code", label: "Code", render: (r) => <code>{r.code}</code>, sort: (r) => r.code },
    { key: "name", label: "Region", render: (r) => regionName(r.code), sort: (r) => regionName(r.code) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={regionStatus(r.code, r.status)} />, sort: (r) => regionStatus(r.code, r.status) },
    { key: "users", label: "Users", align: "right", render: (r) => num(r.users), sort: (r) => r.users },
    { key: "dau", label: "DAU", align: "right", render: (r) => num(r.dau), sort: (r) => r.dau },
    { key: "deposits", label: "Deposits", align: "right", render: (r) => money(r.depositsCents, r.code.startsWith("US") ? "USD" : "CAD"), sort: (r) => r.depositsCents },
    { key: "rake", label: "Rake", align: "right", render: (r) => money(r.rakeCents, r.code.startsWith("US") ? "USD" : "CAD"), sort: (r) => r.rakeCents },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users & Retention</h1>
          <p>Acquisition funnel, regional cohorts and signup trend.</p>
        </div>
      </div>
      {overview.error && !d && <ErrorBox error={overview.error} onRetry={overview.reload} />}
      <div className="grid two">
        <Panel title="Conversion funnel" sub="Lifetime users reaching each stage" stale={overview.refreshing}>
          {d ? <Funnel stages={stages} /> : L ? <SkeletonBlock rows={6} h={18} /> : null}
          {d && (
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              Signup → deposit {d.funnel.signups ? ((d.funnel.deposited / d.funnel.signups) * 100).toFixed(1) : 0}% · deposit → play {d.funnel.deposited ? ((d.funnel.played / d.funnel.deposited) * 100).toFixed(1) : 0}% · DAU/MAU {d.users.mau ? ((d.users.dau / d.users.mau) * 100).toFixed(0) : 0}%
            </p>
          )}
        </Panel>
        <Panel title={`Signups · last ${days} days`} sub="New accounts per day" stale={overview.refreshing}>
          {d ? <SmallMultiples data={d.timeseries} series={[{ key: "signups", label: "Signups", color: palette.series[0], value: (r) => r.signups, format: num }]} rowHeight={150} /> : L ? <SkeletonBlock rows={5} h={22} /> : null}
        </Panel>
      </div>
      <Panel title="Regions" sub="Users with a verified region; click a column to sort" stale={overview.refreshing}>
        {d ? <Table rows={d.regions} columns={columns} rowKey={(r) => r.code} defaultSort="users" maxHeight={520} empty="No verified regions yet" /> : L ? <SkeletonBlock rows={6} /> : null}
      </Panel>
    </div>
  );
}
