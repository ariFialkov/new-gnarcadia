import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Offline reverse-geocoding of a GPS fix to a US state / Canadian province, using Natural Earth
 * 1:50m admin-1 polygons. No vendor needed for the device-side cross-check.
 */
type Ring = [number, number][];
interface Region { code: string; name: string; country: string; polys: Ring[][]; bbox: [number, number, number, number] }
let regions: Region[] | null = null;

function load(): Region[] {
  if (regions) return regions;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, "../data/na-regions.geojson"), path.join(here, "../../data/na-regions.geojson"), path.join(process.cwd(), "data/na-regions.geojson"), path.join(process.cwd(), "apps/api/data/na-regions.geojson")];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error("na-regions.geojson not found");
  const gj = JSON.parse(fs.readFileSync(file, "utf8"));
  regions = gj.features.map((f: any) => {
    const polys: Ring[][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minx = 180, miny = 90, maxx = -180, maxy = -90;
    for (const poly of polys) for (const [x, y] of poly[0]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    return { code: f.properties.code, name: f.properties.name, country: f.properties.country, polys, bbox: [minx, miny, maxx, maxy] };
  });
  return regions!;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Returns the ISO 3166-2 code (e.g. "CA-ON") containing the point, or null. */
export function regionForPoint(lat: number, lng: number): { code: string; name: string; country: string } | null {
  for (const r of load()) {
    if (lng < r.bbox[0] || lng > r.bbox[2] || lat < r.bbox[1] || lat > r.bbox[3]) continue;
    for (const poly of r.polys) {
      if (!inRing(lng, lat, poly[0])) continue;
      if (poly.slice(1).some((hole) => inRing(lng, lat, hole))) continue;
      return { code: r.code, name: r.name, country: r.country };
    }
  }
  return null;
}

/** Approx distance (km) from a point to the nearest border of its region; used to flag border-zone fixes. */
export function distanceToRegionEdgeKm(lat: number, lng: number, code: string): number {
  const r = load().find((x) => x.code === code); if (!r) return Infinity;
  let best = Infinity;
  const kmPerDegLat = 111, kmPerDegLng = 111 * Math.cos((lat * Math.PI) / 180);
  for (const poly of r.polys) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
    const d = segDist(lng * kmPerDegLng, lat * kmPerDegLat, ring[i][0] * kmPerDegLng, ring[i][1] * kmPerDegLat, ring[i + 1][0] * kmPerDegLng, ring[i + 1][1] * kmPerDegLat);
    if (d < best) best = d;
  }
  return best;
}
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y);
}
