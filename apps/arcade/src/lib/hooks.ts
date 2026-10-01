import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { errorMessage } from "./api.ts";

export interface AsyncState<T> { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> }

/** Minimal data hook: runs `fn` when deps change, ignores stale results, exposes reload(). */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, opts: { enabled?: boolean; keepData?: boolean } = {}): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(opts.enabled !== false);
  const seq = useRef(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true); setError(null);
    try { const r = await fnRef.current(); if (id === seq.current) setData(r); }
    catch (e) { if (id === seq.current) { setError(errorMessage(e)); if (!opts.keepData) setData(null); } }
    finally { if (id === seq.current) setLoading(false); }
  }, [opts.keepData]);
  useEffect(() => {
    if (opts.enabled === false) { setLoading(false); return; }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, opts.enabled]);
  return { data, error, loading, reload: run };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { if (ms == null) return; const t = setInterval(() => ref.current(), ms); return () => clearInterval(t); }, [ms]);
}

export function useDocumentTitle(title: string) {
  useEffect(() => { const prev = document.title; document.title = title ? `${title} · Gnarcadia` : "Gnarcadia"; return () => { document.title = prev; }; }, [title]);
}
