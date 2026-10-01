import * as d3 from "d3";
import { feature } from "topojson-client";

type Topo = Parameters<typeof feature>[0];

export interface RegionProps {
  name: string;
  code: string;
  country: "US" | "CA";
}
export type RegionFeature = GeoJSON.Feature<GeoJSON.Geometry, RegionProps>;

let cache: Promise<RegionFeature[]> | null = null;

/** Loads /data/north-america.topo.json once and converts object `regions` to GeoJSON features. */
export function loadRegions(): Promise<RegionFeature[]> {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}data/north-america.topo.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Map data failed to load (${r.status})`);
        return r.json() as Promise<Topo>;
      })
      .then((topo) => {
        const fc = feature(topo, topo.objects.regions as Parameters<typeof feature>[1]) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionProps>;
        return fc.features;
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

/** Codes excluded from the projection *fit* (still drawn). */
const FIT_EXCLUDE = new Set(["US-AK", "US-HI"]);
const FIT_MAX_LAT = 70;

/**
 * Albers-style conic equal-area projection for US + Canada, fitted to the populated
 * extent: AK/HI are excluded from the fit and the northern territories are clipped at 70°N,
 * so the lower 48 + southern Canada fill the viewport while everything is still drawn.
 */
export function makeProjection(features: RegionFeature[], width: number, height: number, pad = 12): d3.GeoConicProjection {
  const proj = d3.geoConicEqualArea().parallels([29.5, 55]).rotate([96, 0]);
  const fitFeatures = features.filter((f) => !FIT_EXCLUDE.has(f.properties.code));
  if (!fitFeatures.length || width <= 0 || height <= 0) return proj;
  const [[lon0, lat0], [lon1, latRaw]] = d3.geoBounds({ type: "FeatureCollection", features: fitFeatures });
  const lat1 = Math.min(latRaw, FIT_MAX_LAT);
  // densified edge points of the lon/lat box -> MultiPoint (no winding issues, exact projected bounds)
  const pts: [number, number][] = [];
  for (let lon = lon0; lon <= lon1; lon += 1) pts.push([lon, lat0], [lon, lat1]);
  for (let lat = lat0; lat <= lat1; lat += 1) pts.push([lon0, lat], [lon1, lat]);
  const box: GeoJSON.MultiPoint = { type: "MultiPoint", coordinates: pts };
  proj.fitExtent(
    [
      [pad, pad],
      [width - pad, height - pad],
    ],
    box,
  );
  return proj;
}
