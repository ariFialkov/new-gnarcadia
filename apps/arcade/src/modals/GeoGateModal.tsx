import { useEffect, useState } from "react";
import { JURISDICTIONS, type JurisdictionRule } from "@gnarcadia/protocol";
import { Modal } from "../components/Modal.tsx";
import { api, devRegion, errorMessage, type GeoCheckResult } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { getPosition, hasGeolocation, isMobileDevice } from "../lib/device.ts";
import type { ModalHandle } from "./ModalManager.tsx";

interface Props extends ModalHandle<boolean> { blockedReason?: string }

const STATUS_LABEL: Record<string, string> = { live: "Live", target: "Available", paused: "Paused", blocked: "Not available" };

export function GeoGateModal({ resolve, dismiss, blockedReason }: Props) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeoCheckResult | null>(null);
  const [error, setError] = useState<string | null>(blockedReason ?? null);
  const [showRegions, setShowRegions] = useState(false);
  const [regions, setRegions] = useState<Record<string, JurisdictionRule>>(JURISDICTIONS);
  const [dev, setDev] = useState(devRegion.get());
  const mobile = isMobileDevice();

  useEffect(() => { if (showRegions) api.jurisdictions().then(setRegions).catch(() => { /* keep bundled copy */ }); }, [showRegions]);

  async function verify() {
    setBusy(true); setError(null); setResult(null);
    try {
      const pos = hasGeolocation() ? await getPosition() : null;
      const body = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy, mobile } : { mobile };
      const r = await api.geoCheck(body);
      setResult(r);
      if (r.ok) { await auth.refresh(); setTimeout(() => resolve(true), 900); }
      else setError(r.reason ?? "Cash play isn't available in your location yet.");
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const regionName = (code: string | null) => (code && regions[code]?.name) || code || "your area";

  return (
    <Modal title="Verify your location" onClose={dismiss} size="sm">
      <div className="stack">
        <div className="geo-illus" aria-hidden="true">📍</div>
        <p className="muted">Real-money skill contests are only available in certain provinces and states. We check your location before each cash session — it takes a second and we never track you in the background.</p>
        {mobile && <p className="fineprint">On mobile we need your precise device location. If prompted, choose <strong>"Allow while using"</strong> with precise location on.</p>}

        {result?.ok && <div className="alert alert--success" role="status">You're verified in <strong>{regionName(result.region)}</strong>. Game on!</div>}
        {error && !result?.ok && <div className="alert alert--error" role="alert">{error}</div>}

        {import.meta.env.DEV && (
          <label className="field dev-box">
            <span>Dev region override (sends <code>X-GN-Dev-Region</code>)</span>
            <select className="input" value={dev} onChange={(e) => { setDev(e.target.value); devRegion.set(e.target.value); }}>
              <option value="">(none — use server default)</option>
              {Object.values(regions).map((j) => <option key={j.code} value={j.code}>{j.code} · {j.name} ({j.status})</option>)}
              <option value="CA-QC">CA-QC · Quebec (unsupported)</option>
              <option value="US-WA">US-WA · Washington (unsupported)</option>
            </select>
          </label>
        )}

        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={verify} disabled={busy} data-autofocus>{busy ? "Checking…" : "Verify my location"}</button>
        <button type="button" className="link center" onClick={() => setShowRegions((s) => !s)} aria-expanded={showRegions}>{showRegions ? "Hide" : "See"} supported regions</button>
        {showRegions && (
          <ul className="region-list" aria-label="Supported regions">
            {Object.values(regions).sort((a, b) => a.name.localeCompare(b.name)).map((j) => (
              <li key={j.code}>
                <span>{j.country === "CA" ? "🇨🇦" : "🇺🇸"} {j.name} <small className="muted">{j.minAge}+</small></span>
                <span className={`badge badge--${j.status}`}>{STATUS_LABEL[j.status] ?? j.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
