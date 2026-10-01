import type { RegionStatus } from "@gnarcadia/protocol";
import { STATUS_LABEL } from "../lib/regions";

type Tone = "good" | "warning" | "serious" | "critical" | "neutral" | "info";

export function Badge({ tone = "neutral", children, icon }: { tone?: Tone; children: React.ReactNode; icon?: string }) {
  return (
    <span className={`badge ${tone}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

const ICON: Record<RegionStatus, string> = { live: "●", target: "◎", paused: "❚❚", blocked: "–" };

export function StatusChip({ status, count }: { status: RegionStatus; count?: number }) {
  return (
    <span className="chip">
      <span className="swatch" style={{ background: `var(--status-${status})` }} />
      <span aria-hidden style={{ fontSize: 9, color: "var(--muted)" }}>{ICON[status]}</span>
      {STATUS_LABEL[status]}
      {count !== undefined && <b style={{ color: "var(--text)" }}>{count}</b>}
    </span>
  );
}

export function StatusBadge({ status }: { status: RegionStatus | string }) {
  const s = status as RegionStatus;
  const tone: Tone = s === "live" ? "good" : s === "target" ? "info" : s === "paused" ? "warning" : "neutral";
  return (
    <Badge tone={tone} icon={ICON[s] ?? "–"}>
      {STATUS_LABEL[s] ?? status}
    </Badge>
  );
}

export function KycBadge({ status }: { status: string }) {
  const tone: Tone = status === "approved" ? "good" : status === "pending" || status === "review" ? "warning" : status === "rejected" ? "critical" : "neutral";
  const icon = status === "approved" ? "✓" : status === "rejected" ? "✕" : status === "none" ? "–" : "…";
  return (
    <Badge tone={tone} icon={icon}>
      {status}
    </Badge>
  );
}

export function GameStatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "live" || status === "approved" ? "good" : status === "review" || status === "uploaded" ? "warning" : status === "paused" ? "serious" : status === "rejected" ? "critical" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}
