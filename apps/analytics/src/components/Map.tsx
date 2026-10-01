import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyticsOverview, RegionStatus } from "@gnarcadia/protocol";
import { loadRegions, makeProjection, type RegionFeature } from "../lib/geo";
import { useSize } from "../lib/hooks";
import { useApp } from "../lib/store";
import { money, num, numCompact } from "../lib/format";
import { regionName, regionStatus, STATUS_LABEL, STATUS_ORDER } from "../lib/regions";
import { StatusChip } from "./Badge";

export type MapLayer = "status" | "users" | "dau" | "deposits" | "rake";
export const LAYERS: { id: MapLayer; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "users", label: "Users" },
  { id: "dau", label: "DAU" },
  { id: "deposits", label: "Deposits" },
  { id: "rake", label: "Rake" },
];

type RegionRow = AnalyticsOverview["regions"][number];

const layerValue = (r: RegionRow | undefined, layer: MapLayer): number => {
  if (!r) return 0;
  switch (layer) {
    case "users":
      return r.users;
    case "dau":
      return r.dau;
    case "deposits":
      return r.depositsCents;
    case "rake":
      return r.rakeCents;
    default:
      return 0;
  }
};
const layerFormat = (layer: MapLayer, v: number) => (layer === "deposits" || layer === "rake" ? money(v, "CAD", { compact: true, code: false }) : numCompact(v));

export function NorthAmericaMap({ regions, layer, selected, onSelect, loading }: { regions: RegionRow[] | null; layer: MapLayer; selected: string | null; onSelect: (code: string | null) => void; loading?: boolean }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const { palette } = useApp();
  const [features, setFeatures] = useState<RegionFeature[] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadRegions()
      .then((f) => alive && setFeatures(f))
      .catch((e: Error) => alive && setGeoError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const width = Math.max(size.width, 10);
  const height = Math.max(size.height, 10);

  const { path, centroids } = useMemo(() => {
    if (!features) return { path: null, centroids: new Map<string, [number, number]>() };
    const projection = makeProjection(features, width, height, 24);
    const p = d3.geoPath(projection);
    const c = new Map<string, [number, number]>();
    for (const f of features) c.set(f.properties.code, p.centroid(f));
    return { path: p, centroids: c };
  }, [features, width, height]);

  const byCode = useMemo(() => new Map((regions ?? []).map((r) => [r.code, r])), [regions]);

  const colorScale = useMemo(() => {
    if (layer === "status") return null;
    const max = d3.max(regions ?? [], (r) => layerValue(r, layer)) ?? 0;
    const interp = d3.piecewise(d3.interpolateRgb, palette.sequential);
    return { scale: d3.scaleSequentialSqrt(interp).domain([0, max > 0 ? max : 1]), max };
  }, [layer, regions, palette]);

  const fillFor = useCallback(
    (code: string) => {
      const row = byCode.get(code);
      if (layer === "status") return palette.status[regionStatus(code, row?.status)];
      const v = layerValue(row, layer);
      if (!v || !colorScale) return palette.noData;
      return colorScale.scale(v);
    },
    [byCode, layer, palette, colorScale],
  );

  // zoom & pan
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const svg = d3.select(el);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.8, 14])
      .translateExtent([
        [-width * 0.6, -height * 0.6],
        [width * 1.6, height * 1.6],
      ])
      .on("zoom", (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(e.transform));
    svg.call(zoom);
    zoomRef.current = zoom;
    return () => {
      svg.on(".zoom", null);
    };
  }, [width, height]);

  const zoomBy = (k: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, k);
  };
  const reset = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity);
  };

  const onMove = (e: React.PointerEvent, code: string) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ code, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const k = transform.k;
  const hoverRow = hover ? byCode.get(hover.code) : undefined;
  const hoverStatus: RegionStatus | null = hover ? regionStatus(hover.code, hoverRow?.status) : null;
  const statusCounts = useMemo(() => {
    const c: Record<RegionStatus, number> = { live: 0, target: 0, paused: 0, blocked: 0 };
    for (const f of features ?? []) c[regionStatus(f.properties.code, byCode.get(f.properties.code)?.status)]++;
    return c;
  }, [features, byCode]);

  return (
    <div className="map-stage" ref={ref}>
      {geoError && (
        <div className="map-overlay tl">
          <div className="error-box">
            <strong>Map data</strong> {geoError}
          </div>
        </div>
      )}
      <svg ref={svgRef} className="map-svg" width={width} height={height} role="img" aria-label="North America jurisdiction map">
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={width} height={height} fill="transparent" onClick={() => onSelect(null)} />
        <g transform={transform.toString()}>
          {features &&
            path &&
            features.map((f) => {
              const code = f.properties.code;
              return (
                <path
                  key={code}
                  d={path(f) ?? ""}
                  className={`region ${selected === code ? "selected" : ""} ${hover?.code === code ? "hover" : ""}`}
                  fill={fillFor(code)}
                  style={{ strokeWidth: (selected === code ? 1.6 : 0.8) / k, opacity: loading && !regions ? 0.7 : 1 }}
                  onPointerMove={(e) => onMove(e, code)}
                  onPointerLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selected === code ? null : code);
                  }}
                >
                  <title>{regionName(code)}</title>
                </path>
              );
            })}
          {/* pulsing dots where DAU > 0 */}
          {features &&
            (regions ?? [])
              .filter((r) => r.dau > 0 && centroids.has(r.code))
              .map((r) => {
                const [cx, cy] = centroids.get(r.code)!;
                return (
                  <g key={r.code} className="pulse" transform={`translate(${cx},${cy}) scale(${1 / Math.sqrt(k)})`}>
                    <circle className="ring" r={5} />
                    <circle className="core" r={2.6} filter="url(#glow)" />
                  </g>
                );
              })}
          {/* region codes once zoomed in */}
          {k >= 2.2 &&
            features &&
            features.map((f) => {
              const c = centroids.get(f.properties.code);
              if (!c || !Number.isFinite(c[0])) return null;
              return (
                <text key={f.properties.code} x={c[0]} y={c[1]} dy="0.32em" textAnchor="middle" style={{ fontSize: 10 / k, fill: "rgba(255,255,255,0.85)", pointerEvents: "none", fontWeight: 600, paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 2 / k }}>
                  {f.properties.code.slice(3)}
                </text>
              );
            })}
        </g>
      </svg>

      {/* zoom controls */}
      <div className="map-overlay br">
        <div className="zoom-stack" role="group" aria-label="Zoom">
          <button onClick={() => zoomBy(1.6)} aria-label="Zoom in">
            +
          </button>
          <button onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">
            −
          </button>
          <button onClick={reset} aria-label="Reset view" style={{ fontSize: 11 }}>
            ⟲
          </button>
        </div>
      </div>

      {/* legend */}
      <div className="map-overlay bl">
        {layer === "status" ? (
          STATUS_ORDER.map((s) => <StatusChip key={s} status={s} count={statusCounts[s]} />)
        ) : (
          <div className="map-card seq-legend">
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>{LAYERS.find((l) => l.id === layer)?.label} by region</div>
            <div className="bar" style={{ background: `linear-gradient(90deg, ${palette.sequential.join(",")})` }} />
            <div className="ticks">
              <span>0</span>
              <span>{layerFormat(layer, (colorScale?.max ?? 0) / 4)}</span>
              <span>{layerFormat(layer, colorScale?.max ?? 0)}</span>
            </div>
            <div className="legend" style={{ marginTop: 2 }}>
              <span className="item">
                <i className="sq" style={{ background: palette.noData }} /> no data
              </span>
            </div>
          </div>
        )}
      </div>

      {hover && hoverStatus && (
        <div className="map-tooltip" style={{ left: Math.min(hover.x + 14, width - 220), top: Math.max(8, hover.y - 12) }}>
          <div className="tt-name">
            <span>{regionName(hover.code)}</span>
            <span className="chip" style={{ padding: "1px 7px" }}>
              <span className="swatch" style={{ background: palette.status[hoverStatus] }} />
              {STATUS_LABEL[hoverStatus]}
            </span>
          </div>
          <div className="tt-grid">
            <span>Users</span>
            <span>{num(hoverRow?.users ?? 0)}</span>
            <span>DAU</span>
            <span>{num(hoverRow?.dau ?? 0)}</span>
            <span>Deposits</span>
            <span>{money(hoverRow?.depositsCents ?? 0, hover.code.startsWith("US") ? "USD" : "CAD")}</span>
            <span>Rake</span>
            <span>{money(hoverRow?.rakeCents ?? 0, hover.code.startsWith("US") ? "USD" : "CAD")}</span>
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
            Click for details
          </div>
        </div>
      )}
    </div>
  );
}
