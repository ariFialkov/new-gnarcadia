import { config as loadDotenv } from "./lib/dotenv.js";
loadDotenv();

const bool = (v: string | undefined, d = false) => (v === undefined ? d : /^(1|true|yes)$/i.test(v));
const num = (v: string | undefined, d: number) => (v === undefined || v === "" ? d : Number(v));

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  PORT: num(process.env.API_PORT, 4000),
  HOST: process.env.API_HOST ?? "0.0.0.0",
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-dev-secret-at-least-32-chars-long!!",
  INTERNAL_SECRET: process.env.INTERNAL_SECRET ?? "change-me-internal-hmac-secret",
  ADMIN_API_KEY: process.env.ADMIN_API_KEY ?? "dev-admin-key",
  DEV_API_KEY: process.env.DEV_API_KEY ?? "dev-upload-key",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  PGLITE_DIR: process.env.PGLITE_DIR ?? "./.pglite",
  STORAGE_DIR: process.env.STORAGE_DIR ?? "./storage",
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? "http://localhost:4000",
  PUBLIC_ARCADE_URL: process.env.PUBLIC_ARCADE_URL ?? "http://localhost:5173",
  PUBLIC_REALTIME_URL: process.env.PUBLIC_REALTIME_URL ?? "ws://localhost:4100",
  GEO_PROVIDER: process.env.GEO_PROVIDER ?? "mock",
  GEO_DEV_REGION: process.env.GEO_DEV_REGION ?? "CA-ON",
  IPINFO_TOKEN: process.env.IPINFO_TOKEN ?? "",
  KYC_PROVIDER: process.env.KYC_PROVIDER ?? "mock",
  KYC_AUTO_APPROVE: bool(process.env.KYC_AUTO_APPROVE, process.env.NODE_ENV !== "production"),
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? "mock",
  TERMS_VERSION: process.env.TERMS_VERSION ?? "2026-10-01",
  GEO_CHECK_TTL_MIN: num(process.env.GEO_CHECK_TTL_MIN, 30),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174,http://localhost:4000").split(","),
};

if (env.isProd) {
  for (const k of ["JWT_SECRET", "INTERNAL_SECRET", "ADMIN_API_KEY", "DEV_API_KEY"] as const) {
    if (env[k].startsWith("change-me") || env[k].startsWith("dev-")) throw new Error(`${k} must be set to a real secret in production`);
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
}
