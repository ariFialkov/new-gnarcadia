import { useState } from "react";
import { api, type AdminGame, type GameVersionRow } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useApp, LIVE_INTERVAL_MS } from "../lib/store";
import { dateTime } from "../lib/format";
import { Panel, Async, SkeletonBlock } from "../components/Panel";
import { GameStatusBadge, Badge } from "../components/Badge";
import { KpiTile } from "../components/KpiTile";

export default function GamesPage() {
  const { live, adminKey } = useApp();
  const games = useApi(adminKey ? (signal) => api.games(signal) : null, [adminKey], live ? LIVE_INTERVAL_MS : 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const review = async (g: AdminGame, v: GameVersionRow, decision: "approve" | "reject", featured?: boolean) => {
    let notes: string | undefined;
    if (decision === "reject" || featured === undefined) {
      const n = window.prompt(`${decision === "approve" ? "Approve" : "Reject"} ${g.name} v${v.version}. Notes (optional):`, v.notes ?? "");
      if (n === null) return;
      notes = n || undefined;
    }
    setBusy(v.id);
    try {
      await api.reviewGame(g.id, { version: v.version, decision, notes, featured: decision === "approve" ? featured ?? g.featured : undefined });
      setToast({ ok: true, msg: `${g.name} v${v.version} ${decision === "approve" ? "approved" : "rejected"}${featured !== undefined ? (featured ? " and featured" : ", unfeatured") : ""}` });
      games.reload();
    } catch (e) {
      setToast({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const all = games.data ?? [];
  const queue = all.flatMap((g) => g.versions.filter((v) => v.status === "uploaded").map((v) => ({ g, v })));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Games</h1>
          <p>Catalogue from GET /admin/games. Approving a version makes it live; featured is set via approve.</p>
        </div>
        {toast && (
          <Badge tone={toast.ok ? "good" : "critical"} icon={toast.ok ? "✓" : "✕"}>
            {toast.msg}
          </Badge>
        )}
      </div>
      <div className="grid kpis">
        <KpiTile label="Games" value={all.length} loading={games.loading && !games.data} />
        <KpiTile label="Live" value={all.filter((g) => g.status === "live").length} loading={games.loading && !games.data} />
        <KpiTile label="Awaiting review" value={queue.length} loading={games.loading && !games.data} foot="uploaded versions" />
        <KpiTile label="Featured" value={all.filter((g) => g.featured).length} loading={games.loading && !games.data} />
      </div>

      <Panel title="Review queue" sub="Uploaded versions not yet approved or rejected" stale={games.refreshing}>
        <Async state={games} skeleton={<SkeletonBlock />}>
          {() =>
            queue.length === 0 ? (
              <div className="empty">Queue is clear</div>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th>Version</th>
                      <th>Uploaded</th>
                      <th className="num">Size</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map(({ g, v }) => (
                      <tr key={v.id}>
                        <td>
                          <b>{g.name}</b>
                          <div className="sub">{g.developerName}</div>
                        </td>
                        <td>
                          <code>{v.version}</code>
                        </td>
                        <td>{dateTime(v.uploadedAt)}</td>
                        <td className="num">{(v.sizeBytes / 1024 / 1024).toFixed(1)} MB</td>
                        <td>
                          <div className="actions">
                            <button className="btn sm good" disabled={busy === v.id} onClick={() => review(g, v, "approve")}>
                              Approve
                            </button>
                            <button className="btn sm" disabled={busy === v.id} onClick={() => review(g, v, "approve", true)}>
                              Approve + feature
                            </button>
                            <button className="btn sm danger" disabled={busy === v.id} onClick={() => review(g, v, "reject")}>
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </Panel>

      <Panel title="Catalogue" sub="All games with their versions" stale={games.refreshing}>
        <Async state={games} skeleton={<SkeletonBlock rows={6} />}>
          {(rows) => (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Status</th>
                    <th>Live version</th>
                    <th>Featured</th>
                    <th>Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty">
                        No games uploaded yet
                      </td>
                    </tr>
                  )}
                  {rows.map((g) => {
                    const liveV = g.versions.find((v) => v.version === g.liveVersion);
                    return (
                      <tr key={g.id}>
                        <td>
                          <b>{g.name}</b>
                          <div className="sub">
                            {g.category} · {g.developerName || "unknown dev"} · ★ {g.rating.toFixed(1)}
                          </div>
                        </td>
                        <td>
                          <GameStatusBadge status={g.status} />
                        </td>
                        <td>{g.liveVersion ? <code>{g.liveVersion}</code> : <span className="muted">–</span>}</td>
                        <td>
                          <label className="switch" style={{ gap: 6 }} title={liveV ? "Toggle featured (re-approves the live version)" : "Approve a version first"}>
                            <input type="checkbox" className="sr-only" checked={g.featured} disabled={!liveV || busy === liveV.id} onChange={(e) => liveV && review(g, liveV, "approve", e.target.checked)} />
                            <span className={`track`} style={{ background: g.featured ? "var(--status-live)" : undefined }} />
                            <span style={{ fontSize: 12 }}>{g.featured ? "on" : "off"}</span>
                          </label>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {g.versions.length === 0 && <span className="muted">none</span>}
                            {g.versions.map((v) => (
                              <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <code style={{ minWidth: 56 }}>{v.version}</code>
                                <GameStatusBadge status={v.status} />
                                <span className="sub">{dateTime(v.uploadedAt)}</span>
                                {v.notes && (
                                  <span className="sub" title={v.notes}>
                                    “{v.notes.length > 40 ? v.notes.slice(0, 39) + "…" : v.notes}”
                                  </span>
                                )}
                                {v.status !== "approved" && (
                                  <button className="btn sm ghost good" disabled={busy === v.id} onClick={() => review(g, v, "approve")}>
                                    approve
                                  </button>
                                )}
                                {v.status !== "rejected" && (
                                  <button className="btn sm ghost danger" disabled={busy === v.id} onClick={() => review(g, v, "reject")}>
                                    reject
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Panel>
    </div>
  );
}
