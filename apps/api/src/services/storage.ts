import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { env } from "../env.js";
import { badRequest } from "../lib/errors.js";

/**
 * Game bundle storage. Dev/prod-small: local disk under STORAGE_DIR, served by the API at /g/:id/:version/.
 * To scale, sync STORAGE_DIR to object storage (Cloudflare R2 is free egress) and point PUBLIC_GAMES_URL at it.
 */
const MAX_BUNDLE_BYTES = 150 * 1024 * 1024;
const MAX_FILES = 5000;
const BLOCKED_EXT = new Set([".exe", ".dll", ".sh", ".bat", ".cmd", ".php", ".py", ".rb", ".pl"]);

export const storageRoot = () => path.resolve(env.STORAGE_DIR);
export const gamesRoot = () => path.join(storageRoot(), "games");
export const bundleDir = (gameId: string, version: string) => path.join(gamesRoot(), gameId, version);

export function extractBundle(zipBuffer: Buffer, gameId: string, version: string): { files: number; bytes: number; manifestJson: unknown } {
  if (zipBuffer.length > MAX_BUNDLE_BYTES) throw badRequest("bundle_too_large", `bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  if (entries.length > MAX_FILES) throw badRequest("too_many_files");
  const dest = bundleDir(gameId, version);
  if (fs.existsSync(dest)) throw badRequest("version_exists", `version ${version} already uploaded; bump the version`);
  // Allow a single top-level folder wrapper (common when zipping a directory).
  const roots = new Set(entries.map((e) => e.entryName.split("/")[0]));
  const strip = roots.size === 1 && entries.every((e) => e.entryName.includes("/")) ? `${[...roots][0]}/` : "";
  let bytes = 0, files = 0; let manifestJson: unknown = null;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of entries) {
    if (e.isDirectory) continue;
    const rel = e.entryName.startsWith(strip) ? e.entryName.slice(strip.length) : e.entryName;
    const target = path.join(dest, rel);
    if (!target.startsWith(dest + path.sep)) { fs.rmSync(dest, { recursive: true, force: true }); throw badRequest("zip_slip", `illegal path ${e.entryName}`); }
    if (BLOCKED_EXT.has(path.extname(rel).toLowerCase())) { fs.rmSync(dest, { recursive: true, force: true }); throw badRequest("blocked_file_type", rel); }
    const data = e.getData(); bytes += data.length; files++;
    if (bytes > MAX_BUNDLE_BYTES) { fs.rmSync(dest, { recursive: true, force: true }); throw badRequest("bundle_too_large"); }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    if (rel === "gnarcadia.json") manifestJson = JSON.parse(data.toString("utf8"));
  }
  if (!manifestJson) { fs.rmSync(dest, { recursive: true, force: true }); throw badRequest("manifest_missing", "gnarcadia.json not found at bundle root"); }
  return { files, bytes, manifestJson };
}

export function removeBundle(gameId: string, version: string) { fs.rmSync(bundleDir(gameId, version), { recursive: true, force: true }); }
export function bundleFileExists(gameId: string, version: string, rel: string) { return fs.existsSync(path.join(bundleDir(gameId, version), rel)); }
export function readBundleFile(gameId: string, version: string, rel: string) { return fs.readFileSync(path.join(bundleDir(gameId, version), rel)); }
