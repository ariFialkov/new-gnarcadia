import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AnalyticsOverview } from "@gnarcadia/protocol";
import { api, getAdminKey, getSession, onUnauthorized, setSession, type AdminSession } from "./api";
import { useApi, type AsyncState } from "./hooks";
import { paletteFor, type ChartPalette, type Theme } from "./palette";

export type Days = 7 | 30 | 90;
export const LIVE_INTERVAL_MS = 30_000;

interface AppState {
  /** Credential marker: the signed-in admin's token (or a legacy API key). Pages gate their fetches on it. */
  adminKey: string | null;
  session: AdminSession | null;
  signIn: (s: AdminSession) => void;
  signOut: () => void;
  needsKey: boolean;
  promptForKey: () => void;
  days: Days;
  setDays: (d: Days) => void;
  live: boolean;
  setLive: (b: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  palette: ChartPalette;
  overview: AsyncState<AnalyticsOverview>;
}

const Ctx = createContext<AppState | null>(null);

const THEME_KEY = "gnarcadia.analytics.theme";

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AdminSession | null>(() => getSession());
  const adminKey = session?.accessToken ?? getAdminKey();
  const [needsKey, setNeedsKey] = useState<boolean>(() => !getSession() && !getAdminKey());
  const [days, setDays] = useState<Days>(30);
  const [live, setLive] = useState(true);
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => onUnauthorized(() => { if (!getSession()) { setSessionState(null); setNeedsKey(true); } }), []);

  const signIn = useCallback((s: AdminSession) => { setSession(s); setSessionState(s); setNeedsKey(false); }, []);
  const signOut = useCallback(() => { setSession(null); setSessionState(null); setNeedsKey(true); }, []);

  const overview = useApi<AnalyticsOverview>(adminKey ? (signal) => api.overview(days, signal) : null, [days, adminKey], live ? LIVE_INTERVAL_MS : 0);

  const value = useMemo<AppState>(
    () => ({
      adminKey,
      session,
      signIn,
      signOut,
      needsKey,
      promptForKey: () => setNeedsKey(true),
      days,
      setDays,
      live,
      setLive,
      theme,
      setTheme: setThemeState,
      palette: paletteFor(theme),
      overview,
    }),
    [adminKey, session, signIn, signOut, needsKey, days, live, theme, overview],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
