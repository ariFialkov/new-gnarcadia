import type { ReactNode } from "react";
import type { ApiError } from "../lib/api";
import { useApp } from "../lib/store";

export function Panel({ title, sub, right, children, stale, className = "", tight }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; stale?: boolean; className?: string; tight?: boolean }) {
  return (
    <section className={`panel ${stale ? "stale" : ""} ${tight ? "tight" : ""} ${className}`}>
      {(title || right) && (
        <header className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Skeleton({ h = 14, w, style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w ?? "100%", ...style }} />;
}

export function SkeletonBlock({ rows = 4, h = 14 }: { rows?: number; h?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} w={`${90 - (i % 3) * 15}%`} />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error | string; onRetry?: () => void }) {
  const { promptForKey } = useApp();
  const msg = typeof error === "string" ? error : error.message;
  const status = typeof error === "string" ? 0 : (error as ApiError).status ?? 0;
  const unauthorized = status === 401 || status === 403;
  return (
    <div className="error-box" role="alert">
      <strong>{unauthorized ? "Admin key rejected" : status === 0 ? "API unreachable" : `Error ${status}`}</strong>
      <span className="text-2">{unauthorized ? "The API returned " + status + ". Enter a valid admin key to continue." : msg}</span>
      {unauthorized && (
        <button className="btn sm primary" onClick={promptForKey}>
          Enter admin key
        </button>
      )}
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children = "No data yet" }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Wraps the common loading / error / data states for a panel body. */
export function Async<T>({ state, skeleton, children }: { state: { data: T | null; error: ApiError | null; loading: boolean; reload: () => void }; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} />;
  if (state.loading) return <>{skeleton ?? <SkeletonBlock />}</>;
  return <Empty />;
}
