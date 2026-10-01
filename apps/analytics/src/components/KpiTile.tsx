import type { ReactNode } from "react";
import { Skeleton } from "./Panel";

export function KpiTile({ label, value, foot, hero, small, loading }: { label: string; value: ReactNode; foot?: ReactNode; hero?: boolean; small?: boolean; loading?: boolean }) {
  return (
    <div className={`kpi ${hero ? "kpi-hero" : ""}`}>
      <div className="kpi-label">{label}</div>
      {loading ? <Skeleton h={hero ? 48 : 28} w="60%" /> : <div className={`kpi-value ${small ? "sm" : ""}`}>{value}</div>}
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}
