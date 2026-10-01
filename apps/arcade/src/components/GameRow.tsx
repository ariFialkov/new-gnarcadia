import { useRef, type ReactNode } from "react";
import type { GameSummary } from "@gnarcadia/protocol";
import { GameCard } from "./GameCard.tsx";
import { Skeleton } from "./Primitives.tsx";

/** Netflix-style horizontal scroller with snap + desktop arrow buttons. */
export function GameRow({ title, games, loading, emoji, action, size = "md" }: { title: ReactNode; games: GameSummary[] | null; loading?: boolean; emoji?: string; action?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });
  if (!loading && games && games.length === 0) return null;
  return (
    <section className="game-row">
      <div className="game-row__head">
        <h2 className="section-title">{emoji && <span aria-hidden="true">{emoji} </span>}{title}</h2>
        <div className="row">
          {action}
          <div className="game-row__arrows">
            <button type="button" className="icon-btn" aria-label={`Scroll ${title} left`} onClick={() => scrollBy(-1)}>‹</button>
            <button type="button" className="icon-btn" aria-label={`Scroll ${title} right`} onClick={() => scrollBy(1)}>›</button>
          </div>
        </div>
      </div>
      <div className="game-row__scroller" ref={scroller} role="list">
        {(loading || !games) ? Array.from({ length: 6 }).map((_, i) => <div key={i} className={`game-card game-card--${size} game-card--skeleton`} role="listitem"><Skeleton h="100%" r={20} /></div>)
          : games.map((g) => <div key={g.id} role="listitem"><GameCard game={g} size={size} /></div>)}
      </div>
    </section>
  );
}
