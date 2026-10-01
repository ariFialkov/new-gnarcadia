import { Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./lib/store";
import { AdminKeyModal, Layout } from "./components/Layout";
import MapPage from "./pages/MapPage";
import OverviewPage from "./pages/OverviewPage";
import UsersPage from "./pages/UsersPage";
import MoneyPage from "./pages/MoneyPage";
import GamesPage from "./pages/GamesPage";
import KycGeoPage from "./pages/KycGeoPage";
import OpsPage from "./pages/OpsPage";

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/money" element={<MoneyPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/kyc" element={<KycGeoPage />} />
          <Route path="/ops" element={<OpsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <AdminKeyModal />
    </AppProvider>
  );
}
