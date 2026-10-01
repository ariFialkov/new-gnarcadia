import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type RegionDetail } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useApp, LIVE_INTERVAL_MS } from "../lib/store";
import { num, pct } from "../lib/format";
import { LAUNCH_REGION_CODES, regionName, regionStatus } from "../lib/regions";
import { Panel, Async, SkeletonBlock, ErrorBox } from "../components/Panel";
import { Funnel, HBarChart, Legend, StackedBar } from "../components/Charts";
import { KpiTile } from "../components/KpiTile";
import { StatusBadge } from "../components/Badge";

const KYC_ORDER = ["none", "pending", "review", "approved", "rejected"] as const;

export default function KycGeoPage() {
  const { live, adminKey, palette } = useApp();
  const users = useApi(adminKey ? (signal) => api.users("", signal) : null, [adminKey], live ? LIVE_INTERVAL_MS : 0);
  const [regions, setRegions] = useState<RegionDetail[] | null>(null);
  const [regionsErr, setRegionsErr] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!adminKey) return;
    const ctrl = new AbortController();
    Promise.all(LAUNCH_REGION_CODES.map((c) => api.region(c, ctrl.signal)))
      .then((rs) => {
        setRegions(rs);
        setRegionsErr(null);
      })
      .catch((e: unknown) => {
        if ((e as Error).name === "AbortError") return;
        setRegionsErr(e instanceof ApiError ? e : new ApiError(0, (e as Error).message));
      });
    return () => ctrl.abort();
  }, [adminKey, tick]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [live]);

  const kyc = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users.data ?? []) counts[u.kycStatus] = (counts[u.kycStatus] ?? 0) + 1;
    return counts;
  }, [users.data]);
  const total = users.data?.length ?? 0;
  const tiers = useMemo(() => {
    const t = [0, 0, 0];
    for (const u of users.data ?? []) t[Math.min(2, Math.max(0, Number(u.kycTier)))]++;
    return t;
  }, [users.data]);

  const geoTotals = useMemo(() => {
    const rs = regions ?? [];
    return { passed: rs.reduce((a, r) => a + r.geo.passed, 0), blocked: rs.reduce((a, r) => a + r.geo.blocked, 0), vpn: rs.reduce((a, r) => a + r.geo.vpn, 0) };
  }, [regions]);

  const funnelStages = [
    { label: "Users (sample)", value: total },
    { label: "Started (pending)", value: total - (kyc.none ?? 0) },
    { label: "In review", value: (kyc.review ?? 0) + (kyc.approved ?? 0) + (kyc.rejected ?? 0) },
    { label: "Approved", value: kyc.approved ?? 0 },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>KYC & Geo</h1>
          <p>KYC statuses are derived from the most recent 100 users returned by GET /admin/users; geo checks are per launch-list region.</p>
        </div>
      </div>

      <div className="grid kpis">
        <KpiTile label="KYC approved" value={num(kyc.approved)} loading={users.loading && !users.data} foot={`${pct(kyc.approved ?? 0, total)} of sample`} />
        <KpiTile label="Pending / review" value={num((kyc.pending ?? 0) + (kyc.review ?? 0))} loading={users.loading && !users.data} foot="awaiting decision" />
        <KpiTile label="Rejected" value={num(kyc.rejected)} loading={users.loading && !users.data} />
        <KpiTile label="Geo passed" value={num(geoTotals.passed)} loading={!regions && !regionsErr} foot={`${pct(geoTotals.passed, geoTotals.passed + geoTotals.blocked)} pass rate`} />
        <KpiTile label="Geo blocked" value={num(geoTotals.blocked)} loading={!regions && !regionsErr} />
        <KpiTile label="VPN detected" value={num(geoTotals.vpn)} loading={!regions && !regionsErr} foot="across all checks" />
      </div>

      <div className="grid two">
        <Panel title="KYC funnel" sub="From the latest user sample" stale={users.refreshing}>
          <Async state={users} skeleton={<SkeletonBlock rows={4} h={18} />}>
            {() => (
              <>
                <Funnel stages={funnelStages} />
                <div style={{ marginTop: 16 }}>
                  <div className="section-title" style={{ marginBottom: 8 }}>
                    By status
                  </div>
                  <HBarChart data={KYC_ORDER.map((s) => ({ label: s, value: kyc[s] ?? 0 }))} labelWidth={90} showTable />
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="section-title" style={{ marginBottom: 8 }}>
                    By tier
                  </div>
                  <HBarChart data={tiers.map((v, i) => ({ label: `Tier ${i}`, value: v }))} labelWidth={90} />
                </div>
              </>
            )}
          </Async>
        </Panel>

        <Panel title="Geo checks by launch region" sub="Passed vs blocked, VPN detections" right={<Legend mark="sq" items={[{ label: "Passed", color: palette.good }, { label: "Blocked", color: palette.critical }]} />}>
          {regionsErr && !regions && <ErrorBox error={regionsErr} onRetry={() => setTick((t) => t + 1)} />}
          {!regions && !regionsErr && <SkeletonBlock rows={8} />}
          {regions && (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Status</th>
                    <th style={{ width: 180 }}>Pass / block</th>
                    <th className="num">Passed</th>
                    <th className="num">Blocked</th>
                    <th className="num">VPN</th>
                    <th className="num">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {[...regions]
                    .sort((a, b) => b.geo.passed + b.geo.blocked - (a.geo.passed + a.geo.blocked))
                    .map((r) => (
                      <tr key={r.code}>
                        <td>
                          <b>{regionName(r.code)}</b> <span className="sub">{r.code}</span>
                        </td>
                        <td>
                          <StatusBadge status={regionStatus(r.code, r.jurisdiction?.status)} />
                        </td>
                        <td>
                          <StackedBar
                            title={regionName(r.code)}
                            height={10}
                            segments={[
                              { label: "Passed", value: r.geo.passed, color: palette.good },
                              { label: "Blocked", value: r.geo.blocked, color: palette.critical },
                            ]}
                          />
                        </td>
                        <td className="num">{num(r.geo.passed)}</td>
                        <td className="num">{num(r.geo.blocked)}</td>
                        <td className="num">{r.geo.vpn ? <span className="badge warning">{num(r.geo.vpn)}</span> : "0"}</td>
                        <td className="num">{num(r.users.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
