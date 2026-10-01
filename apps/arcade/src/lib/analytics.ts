/**
 * Tiny analytics queue: events batch to POST /analytics/events every 10s and on pagehide.
 * Anonymous events are fine (API uses optionalAuth). Max 50 events per request.
 */
import { api, type AnalyticsEvent, API_URL, tokenStore } from "./api.ts";
import { lsGet, lsSet } from "./storage.ts";

const SESSION_KEY = "gn.analytics.sid";
function sessionId(): string {
  let sid = lsGet<string>(SESSION_KEY, "");
  if (!sid) { sid = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 64); lsSet(SESSION_KEY, sid); }
  return sid;
}

const queue: AnalyticsEvent[] = [];
let timer: number | null = null;
let started = false;

export function track(event: string, props?: Record<string, unknown>) {
  queue.push({ event: event.slice(0, 60), props, at: Date.now() });
  if (queue.length >= 50) void flush();
}

export async function flush(useBeacon = false): Promise<void> {
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  if (useBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator && !tokenStore.get()) {
    // Unauthenticated: a beacon is enough (no auth header possible). Authenticated: use keepalive fetch below.
    try { navigator.sendBeacon(`${API_URL}/analytics/events`, new Blob([JSON.stringify({ sessionId: sessionId(), events: batch })], { type: "application/json" })); return; } catch { /* fall through */ }
  }
  try { await api.analytics(sessionId(), batch, useBeacon); } catch { /* drop silently: analytics must never break the UI */ }
  if (queue.length) void flush(useBeacon);
}

export function startAnalytics() {
  if (started || typeof window === "undefined") return;
  started = true;
  timer = window.setInterval(() => void flush(), 10_000);
  window.addEventListener("pagehide", () => void flush(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(true); });
  track("app_open", { standalone: matchMedia("(display-mode: standalone)").matches, path: location.pathname });
}

export function stopAnalytics() { if (timer) clearInterval(timer); timer = null; started = false; }
