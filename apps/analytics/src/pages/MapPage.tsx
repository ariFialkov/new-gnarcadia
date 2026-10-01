import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { num, money } from "../lib/format";
import { LAYERS, NorthAmericaMap, type MapLayer } from "../components/Map";
import { RegionPanel } from "../components/RegionPanel";
import { ErrorBox } from "../components/Panel";

export default function MapPage() {
  const { overview } = useApp();
  const [layer, setLayer] = useState<MapLayer>("status");
  const [selected, setSelected] = useState<string | null>(null);
  const regions = overview.data?.regions ?? null;

  const totals = useMemo(() => {
    const rs = regions ?? [];
    return {
      regions: rs.filter((r) => r.users > 0).length,
      users: rs.reduce((a, r) => a + r.users, 0),
      dau: rs.reduce((a, r) => a + r.dau, 0),
      deposits: rs.reduce((a, r) => a + r.depositsCents, 0),
    };
  }, [regions]);

  return (
    <div className="map-page">
      <div className="map-stage" style={{ position: "relative" }}>
        <NorthAmericaMap regions={regions} layer={layer} selected={selected} onSelect={setSelected} loading={overview.loading} />
        <div className="map-overlay tl">
          <div className="map-card" style={{ minWidth: 240 }}>
            <h1>North America</h1>
            <div className="sub">Jurisdiction status · live activity</div>
            <div className="map-stats">
              <div>
                <b>{num(totals.users)}</b>
                <span>users</span>
              </div>
              <div>
                <b>{num(totals.dau)}</b>
                <span>DAU</span>
              </div>
              <div>
                <b>{money(totals.deposits, "CAD", { compact: true, code: false })}</b>
                <span>deposits</span>
              </div>
              <div>
                <b>{totals.regions}</b>
                <span>active regions</span>
              </div>
            </div>
          </div>
          {overview.error && !overview.data && <ErrorBox error={overview.error} onRetry={overview.reload} />}
        </div>
        <div className="map-overlay tr">
          <label className="map-card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 12px" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Layer
            </span>
            <select className="select" value={layer} onChange={(e) => setLayer(e.target.value as MapLayer)} aria-label="Data layer">
              {LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {selected && <RegionPanel code={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
