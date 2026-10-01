import { useMemo, useState } from "react";
import type { MarketItem } from "@gnarcadia/protocol";
import { api, errorMessage, isApiError } from "../lib/api.ts";
import { useAsync, useDocumentTitle } from "../lib/hooks.ts";
import { useAuth } from "../lib/auth.tsx";
import { useGate } from "../lib/gate.tsx";
import { useToast } from "../components/Toast.tsx";
import { useModals } from "../modals/ModalManager.tsx";
import { WalletModal } from "../modals/WalletModal.tsx";
import { money, gradientFor, initials } from "../lib/format.ts";
import { track } from "../lib/analytics.ts";
import { EmptyState, ErrorState, RarityBadge, Skeleton } from "../components/Primitives.tsx";

type Filter = "all" | "skin" | "trail" | "pass" | `game:${string}`;
const SLOT_EMOJI: Record<string, string> = { skin: "🎨", trail: "🌈", pass: "🎟️", emote: "😎", badge: "🏅" };

export function MarketPage() {
  useDocumentTitle("Market");
  const auth = useAuth();
  const gate = useGate();
  const toast = useToast();
  const modals = useModals();
  const { data: items, error, loading, reload } = useAsync(() => api.marketItems(), [auth.user?.id]);
  const games = useAsync(() => api.games(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const cur = auth.user?.currency ?? "CAD";
  const gameName = (id: string | null) => games.data?.find((g) => g.id === id)?.name ?? id ?? "";

  const gameIds = useMemo(() => Array.from(new Set((items ?? []).map((i) => i.gameId).filter((x): x is string => !!x))), [items]);
  const visible = useMemo(() => (items ?? []).filter((i) => filter === "all" ? true : filter === "pass" ? i.kind === "pass" : filter.startsWith("game:") ? i.gameId === filter.slice(5) : i.slot === filter), [items, filter]);
  const owned = visible.filter((i) => i.owned);
  const shop = visible.filter((i) => !i.owned);

  async function buy(item: MarketItem) {
    setBusy(item.id);
    try {
      if (!(await gate.ensureEligible(`Sign in to buy ${item.name}.`))) return;
      try { await api.buyItem(item.id); }
      catch (e) {
        if (isApiError(e) && e.code === "insufficient_funds") { void modals.open((h) => <WalletModal {...h} suggestedCents={item.priceCents - (auth.user?.balanceCents ?? 0)} reason={`Add funds to buy ${item.name} (${money(item.priceCents, cur)})`} />); return; }
        if (isApiError(e) && e.status === 403 && (await gate.handleGateError(e))) await api.buyItem(item.id); else throw e;
      }
      track("market_buy", { itemId: item.id, priceCents: item.priceCents });
      toast.success(`${item.name} is yours! Equip it to show it off.`, "Purchased");
      await reload(); void auth.refresh();
    } catch (e) { toast.error(isApiError(e) && e.code === "already_owned" ? "You already own this." : errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function toggleEquip(item: MarketItem) {
    setBusy(item.id);
    try { await api.equipItem(item.id, !item.equipped); await reload(); toast({ message: item.equipped ? `${item.name} unequipped.` : `${item.name} equipped!`, kind: "info", durationMs: 2000 }); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(null); }
  }

  const chips: { k: Filter; label: string }[] = [{ k: "all", label: "All" }, { k: "skin", label: "🎨 Skins" }, { k: "trail", label: "🌈 Trails" }, { k: "pass", label: "🎟️ Passes" }, ...gameIds.map((g) => ({ k: `game:${g}` as Filter, label: `🎮 ${gameName(g)}` }))];

  return (
    <div className="container page page--market">
      <h1 className="page-title">🛍️ Market</h1>
      <div className="banner banner--info"><span aria-hidden="true">🛡️</span><span><strong>Cosmetics never affect gameplay.</strong> Skins, trails and badges are pure style — every match is decided by skill alone. Purchases use your cash balance and are final.</span></div>
      <div className="chips" role="group" aria-label="Filter items">{chips.map((c) => <button key={c.k} type="button" className={`chip ${filter === c.k ? "is-active" : ""}`} onClick={() => setFilter(c.k)}>{c.label}</button>)}</div>
      {error && !items && <ErrorState message={error} onRetry={reload} />}
      {loading && !items && <div className="grid-market">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={260} r={20} />)}</div>}
      {items && visible.length === 0 && <EmptyState emoji="🧢" title="Nothing here yet" body="New drops land regularly. Check back soon." />}
      {owned.length > 0 && (
        <section>
          <h2 className="section-title">Owned <span className="muted">({owned.length})</span></h2>
          <div className="grid-market">{owned.map((it) => <ItemCard key={it.id} item={it} cur={cur} busy={busy === it.id} onBuy={() => buy(it)} onEquip={() => toggleEquip(it)} gameName={gameName(it.gameId)} />)}</div>
        </section>
      )}
      {shop.length > 0 && (
        <section>
          <h2 className="section-title">{owned.length ? "Shop" : "Featured drops"}</h2>
          <div className="grid-market">{shop.map((it) => <ItemCard key={it.id} item={it} cur={cur} busy={busy === it.id} onBuy={() => buy(it)} onEquip={() => toggleEquip(it)} gameName={gameName(it.gameId)} />)}</div>
        </section>
      )}
    </div>
  );
}

function ItemCard({ item, cur, busy, onBuy, onEquip, gameName }: { item: MarketItem; cur: "CAD" | "USD"; busy: boolean; onBuy: () => void; onEquip: () => void; gameName: string }) {
  return (
    <article className={`item-card rarity-${item.rarity} ${item.equipped ? "is-equipped" : ""}`}>
      <div className="item-card__media" style={{ background: gradientFor(item.sku) }}>
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="item-card__glyph" aria-hidden="true">{SLOT_EMOJI[item.slot ?? item.kind] ?? initials(item.name)}</span>}
        <RarityBadge rarity={item.rarity} />
        {item.equipped && <span className="pill pill--equipped">Equipped</span>}
      </div>
      <div className="item-card__body">
        <h3 className="item-card__name">{item.name}</h3>
        <p className="item-card__desc">{item.description}</p>
        <div className="item-card__meta muted">{item.slot ? `${item.slot} · ` : ""}{item.gameId ? gameName : "All games"}</div>
        <div className="item-card__foot">
          {item.owned ? (
            <button type="button" className={`btn btn--sm ${item.equipped ? "btn--ghost" : "btn--primary"}`} disabled={busy || !item.slot} onClick={onEquip} aria-pressed={item.equipped}>{busy ? "…" : item.equipped ? "Unequip" : item.slot ? "Equip" : "Owned"}</button>
          ) : (
            <button type="button" className="btn btn--sm btn--cta" disabled={busy} onClick={onBuy}>{busy ? "…" : `Buy · ${money(item.priceCents, item.currency ?? cur, { compact: true })}`}</button>
          )}
        </div>
      </div>
    </article>
  );
}
