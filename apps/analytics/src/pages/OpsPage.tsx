import { useState } from "react";
import { api, type AdminUser } from "../lib/api";
import { useApi, useDebounced } from "../lib/hooks";
import { useApp, LIVE_INTERVAL_MS } from "../lib/store";
import { dateTime, relTime } from "../lib/format";
import { regionName } from "../lib/regions";
import { Panel, Async, SkeletonBlock } from "../components/Panel";
import { KycBadge, Badge } from "../components/Badge";
import { Table, type Column } from "../components/Table";

const KYC_STATUSES = ["none", "pending", "review", "approved", "rejected"] as const;
const FROZEN = "frozen";

export default function OpsPage() {
  const { live, adminKey } = useApp();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const users = useApi(adminKey ? (signal) => api.users(dq, signal) : null, [adminKey, dq]);
  const audit = useApi(adminKey ? (signal) => api.audit(signal) : null, [adminKey], live ? LIVE_INTERVAL_MS : 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, { tier: number; status: string }>>({});

  const flash = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };
  const run = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(id);
    try {
      await fn();
      flash(true, okMsg);
      users.reload();
      audit.reload();
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      label: "User",
      sort: (u) => u.username,
      render: (u) => (
        <div>
          <b>{u.username}</b>
          <div className="sub">{u.email}</div>
        </div>
      ),
    },
    { key: "region", label: "Region", sort: (u) => u.region ?? "", render: (u) => (u.region ? <span title={regionName(u.region)}>{u.region}</span> : <span className="muted">–</span>) },
    {
      key: "kyc",
      label: "KYC",
      sort: (u) => u.kycStatus,
      render: (u) => (
        <div className="actions">
          <KycBadge status={u.kycStatus} />
          <span className="sub">tier {u.kycTier}</span>
        </div>
      ),
    },
    {
      key: "set",
      label: "Set KYC",
      render: (u) => {
        const d = draft[u.id] ?? { tier: Number(u.kycTier), status: String(u.kycStatus) };
        const dirty = d.tier !== Number(u.kycTier) || d.status !== u.kycStatus;
        return (
          <div className="actions">
            <select className="select" style={{ padding: "3px 24px 3px 8px", fontSize: 12 }} value={d.tier} onChange={(e) => setDraft({ ...draft, [u.id]: { ...d, tier: Number(e.target.value) } })} aria-label="KYC tier">
              {[0, 1, 2].map((t) => (
                <option key={t} value={t}>
                  tier {t}
                </option>
              ))}
            </select>
            <select className="select" style={{ padding: "3px 24px 3px 8px", fontSize: 12 }} value={d.status} onChange={(e) => setDraft({ ...draft, [u.id]: { ...d, status: e.target.value } })} aria-label="KYC status">
              {KYC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="btn sm primary" disabled={!dirty || busy === u.id} onClick={() => run(u.id, () => api.setKyc(u.id, d.tier, d.status), `${u.username}: KYC set to ${d.status} / tier ${d.tier}`)}>
              Apply
            </button>
          </div>
        );
      },
    },
    {
      key: "flags",
      label: "Flags",
      sort: (u) => u.flags.length,
      render: (u) => {
        const frozen = u.flags.includes(FROZEN);
        return (
          <div className="actions">
            {u.flags.map((f) => (
              <Badge key={f} tone={f === FROZEN ? "critical" : "neutral"} icon={f === FROZEN ? "❄" : undefined}>
                {f}
              </Badge>
            ))}
            {u.roles.map((r) => (
              <Badge key={r} tone="info">
                {r}
              </Badge>
            ))}
            <button className={`btn sm ${frozen ? "" : "danger"}`} disabled={busy === u.id} onClick={() => run(u.id, () => api.setFlags(u.id, frozen ? u.flags.filter((f) => f !== FROZEN) : [...u.flags, FROZEN]), `${u.username} ${frozen ? "unfrozen" : "frozen"}`)}>
              {frozen ? "Unfreeze" : "Freeze"}
            </button>
          </div>
        );
      },
    },
    { key: "seen", label: "Last seen", sort: (u) => u.lastSeenAt ?? "", render: (u) => relTime(u.lastSeenAt) },
    { key: "created", label: "Joined", sort: (u) => u.createdAt, render: (u) => dateTime(u.createdAt) },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ops</h1>
          <p>User controls write through POST /admin/users/:id/kyc and /flags; every action lands in the audit log.</p>
        </div>
        {toast && (
          <Badge tone={toast.ok ? "good" : "critical"} icon={toast.ok ? "✓" : "✕"}>
            {toast.msg}
          </Badge>
        )}
      </div>

      <Panel title="Users" sub="Latest 100, or search by email / username" stale={users.refreshing} right={<input className="input" placeholder="Search email or username…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} aria-label="Search users" />}>
        <Async state={users} skeleton={<SkeletonBlock rows={6} />}>
          {(rows) => <Table rows={rows} columns={columns} rowKey={(u) => u.id} defaultSort="created" maxHeight={560} empty="No users match" />}
        </Async>
      </Panel>

      <Panel title="Audit log" sub="Most recent 200 admin actions" stale={audit.refreshing}>
        <Async state={audit} skeleton={<SkeletonBlock rows={6} />}>
          {(rows) => (
            <Table
              rows={rows}
              rowKey={(r) => r.id}
              defaultSort="at"
              maxHeight={480}
              empty="No admin actions yet"
              columns={[
                { key: "at", label: "When", sort: (r) => r.createdAt, render: (r) => dateTime(r.createdAt) },
                { key: "actor", label: "Actor", sort: (r) => r.actor, render: (r) => <code>{r.actor}</code> },
                { key: "action", label: "Action", sort: (r) => r.action, render: (r) => <Badge tone={r.action.startsWith("flags") ? "warning" : r.action.startsWith("game") ? "info" : "neutral"}>{r.action}</Badge> },
                { key: "target", label: "Target", render: (r) => <code>{r.target ?? "–"}</code> },
                { key: "meta", label: "Details", render: (r) => <span className="mono muted">{JSON.stringify(r.meta)}</span> },
              ]}
            />
          )}
        </Async>
      </Panel>
    </div>
  );
}
