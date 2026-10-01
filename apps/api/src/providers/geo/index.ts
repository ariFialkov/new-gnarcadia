import { env } from "../../env.js";

export interface IpGeoResult {
  provider: string;
  country: string | null;      // "CA" | "US" | other
  region: string | null;       // ISO 3166-2 e.g. "CA-ON"
  vpn: boolean;                // proxy / VPN / hosting / tor
  raw?: unknown;
}
export interface GeoProvider { name: string; lookup(ip: string, hints?: { devRegion?: string }): Promise<IpGeoResult>; }

/** Dev/testing: region from the X-GN-Dev-Region header or GEO_DEV_REGION. Never enable in production. */
export class MockGeoProvider implements GeoProvider {
  name = "mock";
  async lookup(_ip: string, hints?: { devRegion?: string }): Promise<IpGeoResult> {
    const region = hints?.devRegion ?? env.GEO_DEV_REGION;
    if (region === "VPN") return { provider: "mock", country: null, region: null, vpn: true };
    return { provider: "mock", country: region.split("-")[0], region, vpn: false };
  }
}

const US_STATE_CODES: Record<string, string> = { Alabama:"AL",Alaska:"AK",Arizona:"AZ",Arkansas:"AR",California:"CA",Colorado:"CO",Connecticut:"CT",Delaware:"DE","District of Columbia":"DC",Florida:"FL",Georgia:"GA",Hawaii:"HI",Idaho:"ID",Illinois:"IL",Indiana:"IN",Iowa:"IA",Kansas:"KS",Kentucky:"KY",Louisiana:"LA",Maine:"ME",Maryland:"MD",Massachusetts:"MA",Michigan:"MI",Minnesota:"MN",Mississippi:"MS",Missouri:"MO",Montana:"MT",Nebraska:"NE",Nevada:"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND",Ohio:"OH",Oklahoma:"OK",Oregon:"OR",Pennsylvania:"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",Tennessee:"TN",Texas:"TX",Utah:"UT",Vermont:"VT",Virginia:"VA",Washington:"WA","West Virginia":"WV",Wisconsin:"WI",Wyoming:"WY" };
const CA_PROV_CODES: Record<string, string> = { Alberta:"AB","British Columbia":"BC",Manitoba:"MB","New Brunswick":"NB","Newfoundland and Labrador":"NL","Nova Scotia":"NS","Northwest Territories":"NT",Nunavut:"NU",Ontario:"ON","Prince Edward Island":"PE",Quebec:"QC",Québec:"QC",Saskatchewan:"SK",Yukon:"YT" };
export function regionNameToCode(country: string, regionName: string | null | undefined, regionCode?: string | null): string | null {
  if (regionCode && /^[A-Z]{2}$/.test(regionCode)) return `${country}-${regionCode}`;
  if (!regionName) return null;
  const code = country === "US" ? US_STATE_CODES[regionName] : country === "CA" ? CA_PROV_CODES[regionName] : undefined;
  return code ? `${country}-${code}` : null;
}

/** ipinfo.io — generous free tier (50k/mo), privacy detection on paid plans. https://ipinfo.io/developers */
export class IpinfoGeoProvider implements GeoProvider {
  name = "ipinfo";
  async lookup(ip: string): Promise<IpGeoResult> {
    const r = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${env.IPINFO_TOKEN}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`ipinfo ${r.status}`);
    const j: any = await r.json();
    const country = j.country ?? null;
    const privacy = j.privacy ?? {};
    return { provider: "ipinfo", country, region: country ? regionNameToCode(country, j.region) : null, vpn: !!(privacy.vpn || privacy.proxy || privacy.tor || privacy.hosting || privacy.relay), raw: j };
  }
}

/** ip-api.com — free for non-commercial testing only (45 req/min, http). Use ipinfo/MaxMind in production. */
export class IpApiGeoProvider implements GeoProvider {
  name = "ipapi";
  async lookup(ip: string): Promise<IpGeoResult> {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,region,regionName,proxy,hosting`, { signal: AbortSignal.timeout(4000) });
    const j: any = await r.json();
    if (j.status !== "success") return { provider: "ipapi", country: null, region: null, vpn: false, raw: j };
    return { provider: "ipapi", country: j.countryCode, region: regionNameToCode(j.countryCode, j.regionName, j.region), vpn: !!(j.proxy || j.hosting), raw: j };
  }
}

export function makeGeoProvider(): GeoProvider {
  switch (env.GEO_PROVIDER) {
    case "ipinfo": return new IpinfoGeoProvider();
    case "ipapi": return new IpApiGeoProvider();
    case "mock": if (env.isProd) throw new Error("GEO_PROVIDER=mock is not allowed in production"); return new MockGeoProvider();
    default: throw new Error(`unknown GEO_PROVIDER ${env.GEO_PROVIDER}`);
  }
}
