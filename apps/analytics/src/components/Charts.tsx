import * as d3 from "d3";
import { useMemo, useState, type ReactNode } from "react";
import { useSize } from "../lib/hooks";
import { useApp } from "../lib/store";
import { num } from "../lib/format";

/* ------------------------------------------------------------------ */
/* shared bits                                                          */
/* ------------------------------------------------------------------ */

export interface TipRow {
  label: string;
  value: string;
  color?: string;
  mark?: "line" | "sq";
}

export function Tooltip({ x, y, title, rows, bounds }: { x: number; y: number; title?: string; rows: TipRow[]; bounds: { width: number; height: number } }) {
  const flipX = x > bounds.width * 0.62;
  const style: React.CSSProperties = { top: Math.max(0, Math.min(y - 10, bounds.height - 40)), ...(flipX ? { right: bounds.width - x + 12 } : { left: x + 12 }) };
  return (
    <div className="tooltip" style={style} role="status">
      {title && <div className="tt-title">{title}</div>}
      {rows.map((r) => (
        <div className="tt-row" key={r.label}>
          <span className="k">
            {r.color && <i className={r.mark === "sq" ? "sq" : ""} style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items, mark = "line" }: { items: { label: string; color: string }[]; mark?: "line" | "sq" }) {
  return (
    <div className="legend" aria-label="Legend">
      {items.map((it) => (
        <span className="item" key={it.label}>
          <i className={mark === "sq" ? "sq" : ""} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Table twin for any chart: the WCAG-clean equivalent, behind a toggle. */
export function TableToggle({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button className="table-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Hide table" : "Table view"}
      </button>
      {open && (
        <div className="table-wrap" style={{ marginTop: 8, maxHeight: 260 }}>
          <table className="tbl">
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th key={c} className={i > 0 ? "num" : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className={j > 0 ? "num" : undefined}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const rightRounded = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w, h / 2);
  if (w <= 0) return "";
  return `M${x},${y}h${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - 2 * rr}a${rr},${rr} 0 0 1 ${-rr},${rr}h${-(w - rr)}z`;
};
const topRounded = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, h, w / 2);
  if (h <= 0) return "";
  return `M${x},${y + h}v${-(h - rr)}a${rr},${rr} 0 0 1 ${rr},${-rr}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - rr}z`;
};

const niceTicks = (scale: d3.ScaleLinear<number, number>, n = 3) => scale.ticks(n);
const fmtTick = (v: number) => (Math.abs(v) >= 1000 ? d3.format("~s")(v).replace("G", "B") : d3.format(",")(v));

/* ------------------------------------------------------------------ */
/* Small multiples time series (one axis per measure, shared X)         */
/* ------------------------------------------------------------------ */

export interface SeriesSpec<T> {
  key: string;
  label: string;
  color: string;
  value: (d: T) => number;
  format: (v: number) => string;
  /** tick formatter for the y axis; defaults to compact numbers */
  tick?: (v: number) => string;
}

export function SmallMultiples<T extends { day: string }>({ data, series, rowHeight = 96, showTable = true }: { data: T[]; series: SeriesSpec<T>[]; rowHeight?: number; showTable?: boolean }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const { palette } = useApp();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const margin = { top: 8, right: 16, bottom: 20, left: 44 };
  const width = Math.max(size.width, 10);
  const gap = 18;
  const innerW = Math.max(width - margin.left - margin.right, 10);
  const totalH = series.length * (rowHeight + gap) - gap + margin.bottom;

  const days = useMemo(() => data.map((d) => new Date(d.day + (d.day.length === 10 ? "T00:00:00" : ""))), [data]);
  const x = useMemo(() => d3.scaleTime().domain(d3.extent(days) as [Date, Date]).range([0, innerW]), [days, innerW]);
  const xTicks = x.ticks(Math.max(2, Math.min(8, Math.floor(innerW / 90))));
  const bisect = d3.bisector<Date, Date>((d) => d).center;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = bisect(days, x.invert(px));
    setHoverIdx(Math.max(0, Math.min(days.length - 1, idx)));
  };

  if (!data.length) return <div className="empty">No time series yet</div>;

  const hovered = hoverIdx != null ? data[hoverIdx] : null;
  const hx = hoverIdx != null ? x(days[hoverIdx]) : 0;

  return (
    <div className="chart" ref={ref}>
      {size.width > 0 && (
        <svg width={width} height={totalH} role="img" aria-label={series.map((s) => s.label).join(", ")}>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {series.map((s, i) => {
              const top = i * (rowHeight + gap);
              const h = rowHeight - 18;
              const vals = data.map(s.value);
              const maxV = d3.max(vals) ?? 0;
              const y = d3.scaleLinear().domain([0, maxV > 0 ? maxV * 1.08 : 1]).nice(3).range([h, 0]);
              const line = d3.line<T>().x((_, j) => x(days[j])).y((d) => y(s.value(d))).curve(d3.curveMonotoneX);
              const area = d3.area<T>().x((_, j) => x(days[j])).y0(h).y1((d) => y(s.value(d))).curve(d3.curveMonotoneX);
              const last = data[data.length - 1];
              const ticks = niceTicks(y, 3);
              return (
                <g key={s.key} transform={`translate(0,${top})`}>
                  <text x={0} y={-2} dy="0.7em" className="label strong" style={{ fontSize: 11.5 }}>
                    {s.label}
                  </text>
                  <text x={innerW} y={-2} dy="0.7em" textAnchor="end" className="label" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {hovered ? s.format(s.value(hovered)) : s.format(s.value(last))}
                  </text>
                  <g transform="translate(0,16)">
                    <g className="grid">
                      {ticks.map((t) => (
                        <line key={t} x1={0} x2={innerW} y1={y(t)} y2={y(t)} />
                      ))}
                    </g>
                    {ticks.map((t) => (
                      <text key={t} x={-8} y={y(t)} dy="0.32em" textAnchor="end" className="tick-label">
                        {(s.tick ?? fmtTick)(t)}
                      </text>
                    ))}
                    <path d={area(data) ?? ""} fill={s.color} opacity={0.1} />
                    <path d={line(data) ?? ""} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {hovered && (
                      <circle cx={hx} cy={y(s.value(hovered))} r={4.5} fill={s.color} stroke={palette.surface} strokeWidth={2} />
                    )}
                    {!hovered && <circle cx={x(days[days.length - 1])} cy={y(s.value(last))} r={4} fill={s.color} stroke={palette.surface} strokeWidth={2} />}
                  </g>
                </g>
              );
            })}
            {/* shared x axis */}
            <g className="axis" transform={`translate(0,${totalH - margin.bottom - 4})`}>
              <line x1={0} x2={innerW} />
              {xTicks.map((t) => (
                <text key={+t} x={x(t)} y={6} dy="0.9em" textAnchor="middle" className="tick-label">
                  {d3.timeFormat(xTicks.length > 6 ? "%b %-d" : "%b %-d")(t)}
                </text>
              ))}
            </g>
            {hoverIdx != null && <line className="crosshair" x1={hx} x2={hx} y1={0} y2={totalH - margin.bottom - 4} />}
            <rect x={0} y={0} width={innerW} height={totalH - margin.bottom} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHoverIdx(null)} />
          </g>
        </svg>
      )}
      {hovered && hoverIdx != null && (
        <Tooltip x={margin.left + hx} y={20} bounds={{ width, height: totalH }} title={d3.timeFormat("%a %b %-d, %Y")(days[hoverIdx])} rows={series.map((s) => ({ label: s.label, value: s.format(s.value(hovered)), color: s.color }))} />
      )}
      {showTable && <TableToggle columns={["Day", ...series.map((s) => s.label)]} rows={data.map((d) => [d.day, ...series.map((s) => s.format(s.value(d)))])} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bars                                                      */
/* ------------------------------------------------------------------ */

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  sub?: string;
}

export function HBarChart({ data, format = num, color, maxBars = 12, showTable = false, labelWidth = 120, barThickness = 18 }: { data: BarDatum[]; format?: (v: number) => string; color?: string; maxBars?: number; showTable?: boolean; labelWidth?: number; barThickness?: number }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const { palette } = useApp();
  const [hover, setHover] = useState<number | null>(null);
  const rows = useMemo(() => {
    if (data.length <= maxBars) return data;
    const head = data.slice(0, maxBars - 1);
    const rest = data.slice(maxBars - 1).reduce((a, d) => a + d.value, 0);
    return [...head, { label: "Other", value: rest, color: palette.deemphasis }];
  }, [data, maxBars, palette.deemphasis]);
  const width = Math.max(size.width, 10);
  const rowH = barThickness + 10;
  const margin = { left: labelWidth, right: 64 };
  const innerW = Math.max(width - margin.left - margin.right, 10);
  const height = rows.length * rowH + 4;
  const maxV = d3.max(rows, (d) => d.value) ?? 0;
  const x = d3.scaleLinear().domain([0, maxV > 0 ? maxV : 1]).range([0, innerW]);
  const fill = color ?? palette.series[0];

  if (!rows.length) return <div className="empty">Nothing to show</div>;

  return (
    <div className="chart" ref={ref}>
      {size.width > 0 && (
        <svg width={width} height={height} role="img">
          {rows.map((d, i) => {
            const y = i * rowH + 2;
            const w = x(d.value);
            return (
              <g key={d.label} className={`bar ${hover === i ? "hover" : ""}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={0} y={y - 4} width={width} height={rowH} fill="transparent" />
                <text x={margin.left - 10} y={y + barThickness / 2} dy="0.32em" textAnchor="end" className="label">
                  {d.label.length > 18 ? d.label.slice(0, 17) + "…" : d.label}
                </text>
                <path d={rightRounded(margin.left, y, Math.max(w, 0), barThickness, 4)} fill={d.color ?? fill} />
                <text x={margin.left + w + 8} y={y + barThickness / 2} dy="0.32em" className="label strong" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {format(d.value)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && rows[hover] && (
        <Tooltip x={margin.left + x(rows[hover].value)} y={hover * rowH + 2} bounds={{ width, height }} title={rows[hover].label} rows={[{ label: rows[hover].sub ?? "Value", value: format(rows[hover].value), color: rows[hover].color ?? fill, mark: "sq" }]} />
      )}
      {showTable && <TableToggle columns={["Category", "Value"]} rows={rows.map((d) => [d.label, format(d.value)])} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Funnel (ordinal ramp, conversion between stages)                     */
/* ------------------------------------------------------------------ */

export function Funnel({ stages, format = num, ramp }: { stages: { label: string; value: number }[]; format?: (v: number) => string; ramp?: string[] }) {
  const { palette } = useApp();
  const colors = ramp ?? palette.ordinal;
  const max = stages[0]?.value ?? 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="list">
      {stages.map((s, i) => {
        const w = max > 0 ? (s.value / max) * 100 : 0;
        const prev = i > 0 ? stages[i - 1].value : null;
        const col = colors[Math.min(colors.length - 1, Math.round((i / Math.max(1, stages.length - 1)) * (colors.length - 1)))];
        return (
          <div key={s.label} role="listitem">
            {prev != null && <div className="funnel-conv">↳ {prev > 0 ? `${((s.value / prev) * 100).toFixed(1)}% of previous` : "–"} · {max > 0 ? `${((s.value / max) * 100).toFixed(1)}% of top` : "–"}</div>}
            <div className="funnel-row">
              <span className="text-2">{s.label}</span>
              <div style={{ height: 18, position: "relative" }} title={`${s.label}: ${format(s.value)}`}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(w, s.value > 0 ? 1 : 0)}%`, background: col, borderRadius: "0 4px 4px 0", transition: "width 0.4s ease" }} />
              </div>
              <b className="tabular" style={{ textAlign: "right" }}>
                {format(s.value)}
              </b>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Columns by hour (0..23)                                              */
/* ------------------------------------------------------------------ */

export function HourBars({ values, height = 70, color }: { values: number[]; height?: number; color?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const { palette } = useApp();
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(size.width, 10);
  const plotH = height - 16;
  const x = d3.scaleBand<number>().domain(d3.range(24)).range([0, width]).paddingInner(0.25);
  const maxV = d3.max(values) ?? 0;
  const y = d3.scaleLinear().domain([0, maxV > 0 ? maxV : 1]).range([plotH, 0]);
  const fill = color ?? palette.series[0];
  const bw = Math.min(x.bandwidth(), 24);
  return (
    <div className="chart" ref={ref}>
      {size.width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Activity by hour">
          <g className="axis">
            <line x1={0} x2={width} y1={plotH} y2={plotH} />
          </g>
          {values.map((v, h) => {
            const bx = (x(h) ?? 0) + (x.bandwidth() - bw) / 2;
            return (
              <g key={h} className={`bar ${hover === h ? "hover" : ""}`} onPointerEnter={() => setHover(h)} onPointerLeave={() => setHover(null)}>
                <rect x={x(h)} y={0} width={x.bandwidth() + x.step() * 0.25} height={height} fill="transparent" />
                <path d={topRounded(bx, y(v), bw, plotH - y(v), 3)} fill={hover === h ? fill : fill} opacity={maxV === 0 ? 0.25 : 1} />
              </g>
            );
          })}
          {[0, 6, 12, 18, 23].map((h) => (
            <text key={h} x={(x(h) ?? 0) + x.bandwidth() / 2} y={height - 2} textAnchor="middle" className="tick-label">
              {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
            </text>
          ))}
        </svg>
      )}
      {hover != null && <Tooltip x={(x(hover) ?? 0) + x.bandwidth() / 2} y={0} bounds={{ width, height }} title={`${hover.toString().padStart(2, "0")}:00`} rows={[{ label: "Joins", value: num(values[hover]), color: fill, mark: "sq" }]} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked horizontal bar (2px surface gaps between segments)           */
/* ------------------------------------------------------------------ */

export function StackedBar({ segments, height = 14, format = num, title }: { segments: { label: string; value: number; color: string }[]; height?: number; format?: (v: number) => string; title?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const width = Math.max(size.width, 10);
  let cursor = 0;
  return (
    <div className="chart" ref={ref}>
      {size.width > 0 && (
        <svg width={width} height={height} role="img" aria-label={title}>
          {total === 0 && <rect x={0} y={0} width={width} height={height} rx={4} fill="var(--grid)" />}
          {segments.map((s, i) => {
            const w = total > 0 ? (s.value / total) * width : 0;
            const x0 = cursor;
            cursor += w;
            if (w <= 0) return null;
            return (
              <rect key={s.label} x={x0 + (i > 0 ? 1 : 0)} y={0} width={Math.max(0, w - (i > 0 ? 1 : 0) - (i < segments.length - 1 ? 1 : 0))} height={height} rx={3} fill={s.color} className={`bar ${hover === i ? "hover" : ""}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
            );
          })}
        </svg>
      )}
      {hover != null && <Tooltip x={width / 2} y={-6} bounds={{ width, height }} title={title} rows={[{ label: segments[hover].label, value: `${format(segments[hover].value)} · ${total ? ((segments[hover].value / total) * 100).toFixed(0) : 0}%`, color: segments[hover].color, mark: "sq" }]} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline (12..n points, de-emphasis hue + accent current)           */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, width = 90, height = 26, color }: { values: number[]; width?: number; height?: number; color?: string }) {
  const { palette } = useApp();
  if (!values.length) return null;
  const x = d3.scaleLinear().domain([0, values.length - 1]).range([1, width - 1]);
  const y = d3.scaleLinear().domain([0, d3.max(values) || 1]).range([height - 2, 2]);
  const line = d3.line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
  const c = color ?? palette.series[0];
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={line(values) ?? ""} fill="none" stroke={palette.deemphasis} strokeWidth={1.5} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={c} stroke={palette.surface} strokeWidth={1.5} />
    </svg>
  );
}

export function ChartNote({ children }: { children: ReactNode }) {
  return <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{children}</p>;
}
