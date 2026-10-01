import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { GameSummary } from "@gnarcadia/protocol";
import { api } from "../lib/api.ts";
import { useAsync, useDebounced, useDocumentTitle } from "../lib/hooks.ts";
import { categoryLabel } from "../lib/format.ts";
import { HeroCarousel } from "../components/HeroCarousel.tsx";
import { GameRow } from "../components/GameRow.tsx";
import { GameCard } from "../components/GameCard.tsx";
import { EmptyState, ErrorState, Skeleton } from "../components/Primitives.tsx";

const CATEGORY_EMOJI: Record<string, string> = { arcade: "👾", puzzle: "🧩", action: "💥", sports: "⚽", strategy: "♟️", racing: "🏎️", shooter: "🎯", card: "🃏", trivia: "🧠", other: "✨" };

export function GamesPage() {
  useDocumentTitle("Games");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const dq = useDebounced(q, 250);
  const filtering = !!dq.trim() || !!category;

  const all = useAsync(() => api.games(), []);
  const filtered = useAsync(() => api.games({ q: dq.trim(), category }), [dq, category], { enabled: filtering });

  const games = all.data ?? [];
  const featured = useMemo(() => games.filter((g) => g.featured), [games]);
  const fresh = useMemo(() => games.filter((g) => g.isNew), [games]);
  const popular = useMemo(() => [...games].sort((a, b) => b.stats.plays24h - a.stats.plays24h || b.stats.playersOnline - a.stats.playersOnline).slice(0, 12), [games]);
  const categories = useMemo(() => Array.from(new Set(games.map((g) => g.category))), [games]);
  const byCategory = useMemo(() => categories.map((c) => ({ c, list: games.filter((g) => g.category === c) })), [categories, games]);

  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  return (
    <div className="page page--games">
      <div className="container">
        <div className="searchbar">
          <label className="search">
            <span className="search__icon" aria-hidden="true">🔎</span>
            <input className="search__input" type="search" placeholder="Search games…" value={q} onChange={(e) => setParam("q", e.target.value)} aria-label="Search games" enterKeyHint="search" />
            {q && <button type="button" className="search__clear" aria-label="Clear search" onClick={() => setParam("q", "")}>✕</button>}
          </label>
          <div className="chips" role="group" aria-label="Filter by category">
            <button type="button" className={`chip ${!category ? "is-active" : ""}`} onClick={() => setParam("category", "")}>All</button>
            {(categories.length ? categories : Object.keys(CATEGORY_EMOJI).slice(0, 5)).map((c) => (
              <button key={c} type="button" className={`chip ${category === c ? "is-active" : ""}`} onClick={() => setParam("category", category === c ? "" : c)}>{CATEGORY_EMOJI[c] ?? "🎮"} {categoryLabel(c)}</button>
            ))}
          </div>
        </div>
      </div>

      {filtering ? (
        <div className="container">
          <h2 className="section-title">{dq.trim() ? <>Results for “{dq.trim()}”</> : categoryLabel(category)} {filtered.data && <span className="muted">({filtered.data.length})</span>}</h2>
          {filtered.error && <ErrorState message={filtered.error} onRetry={filtered.reload} />}
          {filtered.loading && !filtered.data && <div className="grid-games">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={220} r={20} />)}</div>}
          {filtered.data && filtered.data.length === 0 && <EmptyState emoji="🫥" title="No games match" body="Try another word or clear the filters." action={<button type="button" className="btn btn--ghost" onClick={() => setParams({}, { replace: true })}>Clear filters</button>} />}
          {filtered.data && filtered.data.length > 0 && <div className="grid-games">{filtered.data.map((g: GameSummary) => <GameCard key={g.id} game={g} />)}</div>}
        </div>
      ) : (
        <>
          <div className="container">
            {all.loading && !all.data ? <Skeleton h={360} r={28} className="hero-skeleton" /> : featured.length ? <HeroCarousel games={featured.slice(0, 5)} /> : popular.length ? <HeroCarousel games={popular.slice(0, 3)} /> : null}
          </div>
          {all.error && !all.data && <div className="container"><ErrorState message={all.error} onRetry={all.reload} /></div>}
          {all.data && all.data.length === 0 && <div className="container"><EmptyState emoji="🚧" title="The arcade is warming up" body="No games are live yet. Check back soon — or run the seed script if you're a developer." /></div>}
          <div className="rows">
            <GameRow title="Featured" emoji="🌟" games={all.data ? featured : null} loading={all.loading && !all.data} size="lg" />
            <GameRow title="New" emoji="✨" games={all.data ? fresh : null} loading={all.loading && !all.data} />
            <GameRow title="Popular" emoji="🔥" games={all.data ? popular : null} loading={all.loading && !all.data} />
            {byCategory.map(({ c, list }) => <GameRow key={c} title={categoryLabel(c)} emoji={CATEGORY_EMOJI[c]} games={list} action={<button type="button" className="link" onClick={() => setParam("category", c)}>See all</button>} />)}
          </div>
        </>
      )}
    </div>
  );
}
