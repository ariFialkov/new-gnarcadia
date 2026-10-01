import { useMemo } from "react";
import { api } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useApp, LIVE_INTERVAL_MS } from "../lib/store";
import { money, num } from "../lib/format";
import { regionName, regionStatus } from "../lib/regions";
import { StatusBadge } from "./Badge";
import { ErrorBox, SkeletonBlock } from "./Panel";
import { HBarChart, HourBars, Legend, StackedBar } from "./Charts";

export function RegionPanel({ code, onClose }: { code: string; onClose: () => void }) {
  const { live, palette } = useApp();
  const state = useApi((signal) => api.region(code, signal), [code], live ? LIVE_INTERVAL_MS : 0);
  const d = state.data;
  const currency = code.startsWith("US") ? "USD" : "CAD";
  const status = regionStatus(code, d?.jurisdiction?.status);

  const topGames = useMemo(() => (d?.topGames ?? []).map((g) => ({ label: g.name, value: g.plays, sub: "Plays" })), [d]);

  return (
    <aside className="slideover" aria-label={`${regionName(code)} details`}>
      <div className="so-head">
        <div>
          <div className="muted mono" style={{ fontSize: 11 }}>
            {code}
          </div>
          <h2>{regionName(code)}</h2>
          <div style={{ marginTop: 6 }}>
            <StatusBadge status={status} />
          </div>
        </div>
        <button className="btn icon ghost" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {state.error && !d && <ErrorBox error={state.error} onRetry={state.reload} />}
      {state.loading && !d && <SkeletonBlock rows={8} h={18} />}

      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: state.refreshing ? 0.7 : 1, transition: "opacity 0.2s" }}>
          <div className="jur-card">
            <div>
              <div className="k">Jurisdiction</div>
              <div>{d.jurisdiction ? "On launch list" : "No rule configured"}</div>
            </div>
            <div>
              <div className="k">Currency</div>
              <div>{d.jurisdiction?.currency ?? currency}</div>
            </div>
            <div>
              <div className="k">Min age</div>
              <div>{d.jurisdiction ? `${d.jurisdiction.minAge}+` : "–"}</div>
            </div>
            <div>
              <div className="k">Max entry</div>
              <div>{d.jurisdiction ? money(d.jurisdiction.maxEntryCents, d.jurisdiction.currency, { code: false }) : "–"}</div>
            </div>
            <div>
              <div className="k">Daily deposit cap</div>
              <div>{d.jurisdiction ? money(d.jurisdiction.defaultDailyDepositCapCents, d.jurisdiction.currency, { code: false }) : "–"}</div>
            </div>
            <div>
              <div className="k">Tax-ID threshold</div>
              <div>{d.jurisdiction ? (Number.isFinite(d.jurisdiction.taxIdThresholdCents) ? money(d.jurisdiction.taxIdThresholdCents, d.jurisdiction.currency, { code: false }) : "none") : "–"}</div>
            </div>
            {d.jurisdiction?.note && <div className="note">{d.jurisdiction.note}</div>}
          </div>

          <div className="so-kpis">
            <Kpi l="Users" v={num(d.users.total)} />
            <Kpi l="DAU" v={num(d.users.dau)} />
            <Kpi l="WAU" v={num(d.users.wau)} />
            <Kpi l="KYC approved" v={num(d.users.kycApproved)} />
            <Kpi l="New (7d)" v={num(d.users.new7d)} />
            <Kpi l="Avg age" v={d.users.avgAge ? String(d.users.avgAge) : "–"} />
          </div>

          <div>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Deposits vs withdrawals
            </div>
            <HBarChart
              data={[
                { label: "Deposits", value: d.money.depositsCents, color: palette.series[0] },
                { label: "Withdrawals", value: d.money.withdrawalsCents, color: palette.series[1] },
              ]}
              format={(v) => money(v, currency, { code: false })}
              labelWidth={90}
            />
            <div style={{ marginTop: 6 }}>
              <Legend mark="sq" items={[{ label: "Deposits", color: palette.series[0] }, { label: "Withdrawals", color: palette.series[1] }]} />
            </div>
          </div>

          <div>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Top games · plays
            </div>
            {topGames.length ? <HBarChart data={topGames} labelWidth={110} maxBars={8} /> : <div className="empty">No matches played here yet</div>}
          </div>

          <div>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Geo checks
            </div>
            <StackedBar
              title="Geo checks"
              segments={[
                { label: "Passed", value: d.geo.passed, color: palette.good },
                { label: "Blocked", value: d.geo.blocked, color: palette.critical },
              ]}
            />
            <div className="legend" style={{ marginTop: 8 }}>
              <span className="item">
                <i className="sq" style={{ background: palette.good }} /> Passed <b className="tabular" style={{ color: "var(--text)" }}>{num(d.geo.passed)}</b>
              </span>
              <span className="item">
                <i className="sq" style={{ background: palette.critical }} /> Blocked <b className="tabular" style={{ color: "var(--text)" }}>{num(d.geo.blocked)}</b>
              </span>
              <span className="item">
                <span className="badge warning" style={{ padding: "0 6px" }}>
                  VPN
                </span>
                <b className="tabular" style={{ color: "var(--text)" }}>{num(d.geo.vpn)}</b>
              </span>
            </div>
          </div>

          <div>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Match joins by hour (UTC)
            </div>
            <HourBars values={d.activityByHour} />
          </div>
        </div>
      )}
    </aside>
  );
}

function Kpi({ l, v }: { l: string; v: string }) {
  return (
    <div className="so-kpi">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
