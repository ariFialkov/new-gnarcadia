import fs from "node:fs";
import path from "node:path";
(function loadDotenv() {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const p = path.join(dir, ".env");
    if (fs.existsSync(p)) { for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } return; }
    dir = path.dirname(dir);
  }
})();
export const env = {
  isProd: process.env.NODE_ENV === "production",
  PORT: Number(process.env.REALTIME_PORT ?? 4100),
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-dev-secret-at-least-32-chars-long!!",
  INTERNAL_SECRET: process.env.INTERNAL_SECRET ?? "change-me-internal-hmac-secret",
  API_INTERNAL_URL: process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  /** Where `gnarcadia dev` serves the game being developed (server.js is fetched from here for gameVersion "dev"). */
  DEV_GAME_URL: process.env.DEV_GAME_URL ?? "http://localhost:5180",
  CACHE_DIR: process.env.REALTIME_CACHE_DIR ?? "./.cache/game-servers",
  /** Minutes an empty perpetual lobby stays alive before closing and settling. */
  PERPETUAL_IDLE_MIN: Number(process.env.PERPETUAL_IDLE_MIN ?? 5),
  MAX_ROOMS: Number(process.env.MAX_ROOMS ?? 500),
};
if (env.isProd && (env.JWT_SECRET.startsWith("change-me") || env.INTERNAL_SECRET.startsWith("change-me"))) throw new Error("secrets must be set in production");
