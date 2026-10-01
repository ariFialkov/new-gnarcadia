import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { env } from "./env.js";
import { api } from "./api-client.js";

/**
 * Resolves the server module for a game version to a local file the worker can import().
 *  - Published versions: fetched once from the API (internal, HMAC) and cached on disk by content hash.
 *  - "dev" version: fetched from the local `gnarcadia dev` server every time (hot reload).
 */
export async function resolveServerModule(gameId: string, version: string): Promise<string> {
  fs.mkdirSync(env.CACHE_DIR, { recursive: true });
  if (version === "dev") {
    const r = await fetch(`${env.DEV_GAME_URL}/server.js`, { signal: AbortSignal.timeout(5000) }).catch((e) => { throw new Error(`cannot reach dev game server at ${env.DEV_GAME_URL}/server.js (${e.message}). Run 'gnarcadia dev' in your game folder.`); });
    if (!r.ok) throw new Error(`dev server.js -> ${r.status}`);
    const src = await r.text();
    const file = path.join(env.CACHE_DIR, `dev-${gameId}-${Date.now()}.mjs`);
    fs.writeFileSync(file, src);
    for (const f of fs.readdirSync(env.CACHE_DIR)) if (f.startsWith(`dev-${gameId}-`) && f !== path.basename(file)) fs.rmSync(path.join(env.CACHE_DIR, f), { force: true });
    return file;
  }
  const marker = path.join(env.CACHE_DIR, `${gameId}@${version}.mjs`);
  if (fs.existsSync(marker)) return marker;
  const src = await api.serverModuleSource(gameId, version);
  const hash = createHash("sha256").update(src).digest("hex").slice(0, 12);
  fs.writeFileSync(marker, `// ${gameId}@${version} sha256:${hash}\n${src}`);
  return marker;
}
