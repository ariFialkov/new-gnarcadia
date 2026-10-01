import { Link } from "react-router-dom";
import type { GameSummary } from "@gnarcadia/protocol";
import { gradientFor, initials, money, compactNumber } from "../lib/format.ts";

export function GameCover({ game, className = "" }: { game: Pick<GameSummary, "id" | "name" | "coverUrl">; className?: string }) {
  if (game.coverUrl) return <img className={`cover ${className}`} src={game.coverUrl} alt="" loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />;
  return <div className={`cover cover--fallback ${className}`} style={{ background: gradientFor(game.id) }} aria-hidden="true"><span>{initials(game.name)}</span></div>;
}

export function GameCard({ game, size = "md" }: { game: GameSummary; size?: "sm" | "md" | "lg" }) {
  const tiers = Array.from(new Set(game.formats.flatMap((f) => f.entryTiersCents))).filter((c) => c > 0).sort((a, b) => a - b);
  const cur = "CAD" as const;
  return (
    <Link to={`/games/${game.id}`} className={`game-card game-card--${size}`} aria-label={`${game.name}: ${game.tagline ?? game.category}`}>
      <div className="game-card__media" style={{ background: gradientFor(game.id) }}>
        <GameCover game={game} />
        {game.isNew && <span className="pill pill--new">NEW</span>}
        {game.featured && !game.isNew && <span className="pill pill--hot">HOT</span>}
        {game.stats.playersOnline > 0 && <span className="pill pill--online"><span className="dot" />{compactNumber(game.stats.playersOnline)} online</span>}
      </div>
      <div className="game-card__body">
        <div className="game-card__name">{game.name}</div>
        <div className="game-card__meta">
          {tiers.length ? <span className="game-card__tiers">{tiers.slice(0, 3).map((c) => money(c, cur, { compact: true })).join(" · ")}{tiers.length > 3 ? " +" : ""}</span> : <span className="game-card__tiers">Free play</span>}
          {game.stats.plays24h > 0 && <span className="muted">{compactNumber(game.stats.plays24h)} plays today</span>}
        </div>
      </div>
    </Link>
  );
}
