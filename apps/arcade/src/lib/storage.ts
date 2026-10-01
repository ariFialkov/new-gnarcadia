/** Safe wrappers: storage can throw in private mode / blocked contexts. */
export function lsGet<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw == null ? fallback : (JSON.parse(raw) as T); } catch { return fallback; }
}
export function lsSet(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
export function lsDel(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
export function ssGet<T>(key: string, fallback: T): T {
  try { const raw = sessionStorage.getItem(key); return raw == null ? fallback : (JSON.parse(raw) as T); } catch { return fallback; }
}
export function ssSet(key: string, value: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
export function ssDel(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}
