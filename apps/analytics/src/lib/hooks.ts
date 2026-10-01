import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  /** true only before the first successful load */
  loading: boolean;
  /** true while a refetch is in flight and previous data is still shown */
  refreshing: boolean;
  reload: () => void;
  updatedAt: number | null;
}

/**
 * Fetch hook: keeps the previous render while refetching (no skeleton flash),
 * optional polling interval (ms), abort on unmount / dependency change.
 */
export function useApi<T>(fn: ((signal: AbortSignal) => Promise<T>) | null, deps: unknown[], pollMs = 0): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!fn);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const f = fnRef.current;
    if (!f) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    setRefreshing(true);
    f(ctrl.signal)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      })
      .catch((e: unknown) => {
        if (cancelled || (e as Error).name === "AbortError") return;
        setError(e instanceof ApiError ? e : new ApiError(0, (e as Error).message ?? "Request failed"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!pollMs || !fn) return;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, !!fn]);

  return { data, error, loading, refreshing, reload, updatedAt };
}

/** ResizeObserver-backed element size. */
export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.width - r.width) < 0.5 && Math.abs(s.height - r.height) < 0.5 ? s : { width: r.width, height: r.height }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
