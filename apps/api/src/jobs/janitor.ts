import type { Db } from "../db/client.js";
import { sweep } from "../services/matches.js";
import { applyPendingLimitChanges } from "../services/wallet.js";

/** Periodic housekeeping: stale matches, async bracket settlement, delayed limit increases. */
export function startJanitor(db: Db, everyMs = 10_000) {
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try { await sweep(db); await applyPendingLimitChanges(db); } catch (e) { console.error("[janitor]", e); } finally { running = false; }
  };
  const t = setInterval(tick, everyMs); t.unref();
  void tick();
  return () => clearInterval(t);
}
