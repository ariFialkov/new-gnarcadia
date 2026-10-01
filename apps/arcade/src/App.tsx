import { useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth.tsx";
import { ToastProvider, useToast } from "./components/Toast.tsx";
import { ModalProvider } from "./modals/ModalManager.tsx";
import { Shell } from "./components/Shell.tsx";
import { GamesPage } from "./pages/GamesPage.tsx";
import { GameDetailPage, LeaderboardPage } from "./pages/GameDetailPage.tsx";
import { MarketPage } from "./pages/MarketPage.tsx";
import { ProfilePage, PublicProfilePage } from "./pages/ProfilePage.tsx";
import { LegalPage } from "./pages/LegalPage.tsx";
import { WalletReturnPage } from "./pages/WalletReturnPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { PlayPage } from "./game-runner/PlayPage.tsx";
import { startAnalytics, track } from "./lib/analytics.ts";
import { lsGet, lsSet } from "./lib/storage.ts";

/** Scroll to top on navigation + page_view analytics. */
function RouteEffects() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); track("page_view", { path: loc.pathname }); }, [loc.pathname]);
  return null;
}

/** Responsible-play reminder: a toast after every 60 minutes spent in the game runner. */
function PlayReminder() {
  const loc = useLocation();
  const toast = useToast();
  const nav = useNavigate();
  const playing = loc.pathname.startsWith("/play/");
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) { started.current = null; return; }
    started.current = Date.now();
    const t = setInterval(() => {
      const total = lsGet<number>("gn.playSeconds", 0) + 30;
      lsSet("gn.playSeconds", total);
      if (total > 0 && total % 3600 === 0) {
        const hours = total / 3600;
        toast({ kind: "warn", title: "Time check 🌱", message: `You've been playing for ${hours} hour${hours > 1 ? "s" : ""}. Take a stretch, grab some water — the games will still be here.`, durationMs: 12_000, action: { label: "Play limits", onClick: () => nav("/profile") } });
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [playing, toast, nav]);
  return null;
}

function OnlineBanner() {
  const toast = useToast();
  useEffect(() => {
    const off = () => toast({ kind: "warn", title: "You're offline", message: "Browsing still works; cash play needs a connection.", durationMs: 6000 });
    const on = () => toast({ kind: "success", message: "Back online!", durationMs: 2500 });
    window.addEventListener("offline", off); window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, [toast]);
  return null;
}

export default function App() {
  useEffect(() => { startAnalytics(); }, []);
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ModalProvider>
            <RouteEffects />
            <PlayReminder />
            <OnlineBanner />
            <Routes>
              <Route path="/play/:matchId" element={<PlayPage />} />
              <Route element={<Shell />}>
                <Route index element={<GamesPage />} />
                <Route path="/games" element={<GamesPage />} />
                <Route path="/games/:id" element={<GameDetailPage />} />
                <Route path="/games/:id/leaderboard" element={<LeaderboardPage />} />
                <Route path="/market" element={<MarketPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/profile/:username" element={<PublicProfilePage />} />
                <Route path="/legal" element={<Navigate to="/legal/terms" replace />} />
                <Route path="/legal/:doc" element={<LegalPage />} />
                <Route path="/wallet/return" element={<WalletReturnPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </ModalProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
