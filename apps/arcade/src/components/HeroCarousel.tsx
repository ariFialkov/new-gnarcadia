import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GameSummary } from "@gnarcadia/protocol";
import { GameCover } from "./GameCard.tsx";
import { gradientFor, money, compactNumber, categoryLabel } from "../lib/format.ts";
import { prefersReducedMotion } from "../lib/device.ts";

export function HeroCarousel({ games }: { games: GameSummary[] }) {
  const [i, setI] = useState(0);
  const n = games.length;
  useEffect(() => {
    if (n < 2 || prefersReducedMotion()) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n]);
  if (!n) return null;
  const g = games[i % n];
  const minTier = Math.min(...g.formats.flatMap((f) => f.entryTiersCents).filter((c) => c > 0), Infinity);
  return (
    <section className="hero" aria-roledescription="carousel" aria-label="Featured games">
      <div className="hero__slide" style={{ background: gradientFor(g.id) }} key={g.id}>
        <GameCover game={g} className="hero__cover" />
        <div className="hero__shade" />
        <div className="hero__content">
          <span className="eyebrow eyebrow--light">{g.isNew ? "✨ New this week" : "🔥 Featured"} · {categoryLabel(g.category)}</span>
          <h1 className="hero__title">{g.name}</h1>
          <p className="hero__tag">{g.tagline ?? g.description.slice(0, 120)}</p>
          <div className="hero__stats">
            {g.stats.playersOnline > 0 && <span><span className="dot dot--live" /> {compactNumber(g.stats.playersOnline)} playing now</span>}
            {Number.isFinite(minTier) && <span>Entry from {money(minTier, "CAD", { compact: true })}</span>}
            <span>by {g.developer}</span>
          </div>
          <div className="row">
            <Link to={`/games/${g.id}`} className="btn btn--cta btn--lg">Play now</Link>
            <Link to={`/games/${g.id}`} state={{ practice: true }} className="btn btn--glass btn--lg">Try free</Link>
          </div>
        </div>
      </div>
      {n > 1 && (
        <div className="hero__dots" role="tablist" aria-label="Featured game slides">
          {games.map((x, k) => <button key={x.id} role="tab" type="button" aria-selected={k === i} aria-label={`Show ${x.name}`} className={`hero__dot ${k === i ? "is-active" : ""}`} onClick={() => setI(k)} />)}
        </div>
      )}
    </section>
  );
}
