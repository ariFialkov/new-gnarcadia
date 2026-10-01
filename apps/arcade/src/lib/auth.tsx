import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, tokenStore, type Me, type SignupInput } from "./api.ts";

interface AuthCtx {
  user: Me | null;
  /** True once the initial session check has completed. */
  ready: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  signup: (input: SignupInput) => Promise<Me>;
  logout: () => Promise<void>;
  /** Re-fetch /me (balances, eligibility, kyc status...). Returns null when signed out. */
  refresh: () => Promise<Me | null>;
  setUser: (u: Me | null) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const inflight = useRef<Promise<Me | null> | null>(null);

  const refresh = useCallback(async (): Promise<Me | null> => {
    if (!tokenStore.get()) { setUser(null); return null; }
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      setLoading(true);
      try { const me = await api.me(); setUser(me); return me; }
      catch (e: any) { if (e?.status === 401) setUser(null); return null; }
      finally { setLoading(false); inflight.current = null; }
    })();
    return inflight.current;
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
    return tokenStore.subscribe(() => { if (!tokenStore.get()) setUser(null); });
  }, [refresh]);

  // Keep balances fresh when the tab regains focus.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && tokenStore.get()) void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    tokenStore.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    setUser(r.user); return r.user;
  }, []);
  const signup = useCallback(async (input: SignupInput) => {
    const r = await api.signup(input);
    tokenStore.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    setUser(r.user); return r.user;
  }, []);
  const logout = useCallback(async () => {
    const t = tokenStore.get();
    await api.logout(t?.refreshToken);
    tokenStore.set(null); setUser(null);
  }, []);

  const value = useMemo<AuthCtx>(() => ({ user, ready, loading, login, signup, logout, refresh, setUser }), [user, ready, loading, login, signup, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
