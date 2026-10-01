import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function EmptyState({ emoji = "🕹️", title, body, action }: { emoji?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__emoji" aria-hidden="true">{emoji}</div>
      <h3>{title}</h3>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty empty--error" role="alert">
      <div className="empty__emoji" aria-hidden="true">📡</div>
      <h3>Hmm, that didn't load</h3>
      <p className="muted">{message}</p>
      {onRetry && <button type="button" className="btn btn--primary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 10, className = "" }: { h?: number | string; w?: number | string; r?: number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function SectionHead({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-head">
      <div><h2 className="section-title">{title}</h2>{sub && <p className="muted section-sub">{sub}</p>}</div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={`badge badge--${tone} ${className}`}>{children}</span>;
}

export const RARITY_LABEL: Record<string, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
export function RarityBadge({ rarity }: { rarity: string }) { return <span className={`rarity rarity--${rarity}`}>{RARITY_LABEL[rarity] ?? rarity}</span>; }

export function BackLink({ to = "/games", children = "Back" }: { to?: string; children?: ReactNode }) {
  return <Link to={to} className="back-link">← {children}</Link>;
}
