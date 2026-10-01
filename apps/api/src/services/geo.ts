import type { Db } from "../db/client.js";
import { geoChecks } from "../db/schema.js";
import { uuid } from "../lib/ids.js";
import { regionForPoint, distanceToRegionEdgeKm } from "../lib/geo-pip.js";
import { makeGeoProvider } from "../providers/geo/index.js";
import { isPlayableRegion, getJurisdiction } from "@gnarcadia/protocol";

const provider = makeGeoProvider();

export interface GeoCheckInput { userId: string; ip: string; gps?: { lat: number; lng: number; accuracyM?: number }; devRegion?: string; requireGps?: boolean }

/**
 * Decision rules (docs/compliance.md §geolocation):
 *  - VPN/proxy/hosting => block.
 *  - IP region must be a playable jurisdiction.
 *  - If a GPS fix is supplied, its region must match the IP region (block on mismatch).
 *  - Mobile cash play requires GPS (requireGps) — enforced by the caller based on device class.
 *  - Border zone (<5km from the region edge) with poor accuracy (>2km) => block, ask to retry.
 */
export async function runGeoCheck(db: Db, input: GeoCheckInput) {
  const ipRes = await provider.lookup(input.ip, { devRegion: input.devRegion }).catch((e) => ({ provider: provider.name, country: null, region: null, vpn: false, raw: { error: String(e) } }));
  let gpsRegion: string | null = null;
  let reason: string | undefined;
  let ok = true;
  let region: string | null = ipRes.region;

  if (ipRes.vpn) { ok = false; reason = "VPN, proxy or hosting network detected. Disable it and try again."; }
  if (input.gps) {
    const hit = regionForPoint(input.gps.lat, input.gps.lng);
    gpsRegion = hit?.code ?? null;
    if (!gpsRegion) { ok = false; reason ??= "Your device location is outside North America."; }
    else if (ipRes.region && gpsRegion !== ipRes.region) { ok = false; reason ??= "Your network location and device location don't match."; }
    else {
      region = gpsRegion;
      const edgeKm = distanceToRegionEdgeKm(input.gps.lat, input.gps.lng, gpsRegion);
      const acc = input.gps.accuracyM ?? 0;
      if (edgeKm < 5 && acc > 2000) { ok = false; reason ??= "You're near a border and your location fix isn't precise enough. Enable precise location and retry."; }
    }
  } else if (input.requireGps) { ok = false; reason ??= "Precise device location is required on mobile for cash play."; }

  if (ok && !region) { ok = false; reason = "We couldn't determine your location."; }
  if (ok && region && !isPlayableRegion(region)) {
    const j = getJurisdiction(region);
    ok = false; reason = j?.status === "paused" ? `Cash play in ${j.name} is temporarily unavailable.` : "Cash play isn't available in your location yet.";
  }

  const row = { id: uuid(), userId: input.userId, ip: input.ip, ipRegion: ipRes.region, gpsRegion, lat: input.gps?.lat ?? null, lng: input.gps?.lng ?? null, accuracyM: input.gps?.accuracyM ?? null, vpn: ipRes.vpn, ok, region, reason: reason ?? null, provider: ipRes.provider };
  await db.insert(geoChecks).values(row);
  return { ok, region, reason, ipRegion: ipRes.region, gpsRegion, vpn: ipRes.vpn, checkedAt: new Date().toISOString() };
}
