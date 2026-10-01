#!/usr/bin/env node
/**
 * gnarcadia — developer CLI
 *
 *   gnarcadia init <dir> [--template async|realtime|perpetual]   scaffold a new game
 *   gnarcadia dev [dir]                                          serve the game locally with hot reload (http://localhost:5180)
 *   gnarcadia validate [dir]                                     validate gnarcadia.json + bundle layout
 *   gnarcadia pack [dir]                                         bundle server.js (esbuild) and zip -> dist/<id>-<version>.zip
 *   gnarcadia publish [dir] [--promote] [--api URL] [--key KEY]  upload the zip to the platform (and optionally make it live)
 *   gnarcadia status [--api URL] [--key KEY]                     list your games and versions
 *
 * Config: GNARCADIA_API (default http://localhost:4000), GNARCADIA_DEV_KEY (default dev-upload-key),
 * or a .gnarcadiarc.json {"api":"...","key":"..."} in the game folder or home dir.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import AdmZip from "adm-zip";
import { build as esbuild } from "esbuild";
import { GameManifestSchema, validateManifestInvariants, type GameManifest } from "@gnarcadia/protocol";

const args = process.argv.slice(2);
const cmd = args[0];
const flags: Record<string, string | boolean> = {};
const positional: string[] = [];
for (let i = 1; i < args.length; i++) { const a = args[i]; if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); flags[k] = v ?? (args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true); } else positional.push(a); }

const c = { pink: (s: string) => `\x1b[95m${s}\x1b[0m`, green: (s: string) => `\x1b[92m${s}\x1b[0m`, red: (s: string) => `\x1b[91m${s}\x1b[0m`, dim: (s: string) => `\x1b[2m${s}\x1b[0m`, bold: (s: string) => `\x1b[1m${s}\x1b[0m` };
const log = (...a: unknown[]) => console.log(...a);
function die(msg: string): never { console.error(c.red("✖ ") + msg); process.exit(1); }

function rc(dir: string) {
  for (const p of [path.join(dir, ".gnarcadiarc.json"), path.join(os.homedir(), ".gnarcadiarc.json")]) if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* ignore */ } }
  return {};
}
function cfg(dir: string) {
  const r = rc(dir);
  return { api: String(flags.api ?? process.env.GNARCADIA_API ?? r.api ?? "http://localhost:4000").replace(/\/$/, ""), key: String(flags.key ?? process.env.GNARCADIA_DEV_KEY ?? r.key ?? "dev-upload-key") };
}
const gameDir = () => path.resolve(positional[0] ?? ".");

function readManifest(dir: string): GameManifest {
  const p = path.join(dir, "gnarcadia.json");
  if (!fs.existsSync(p)) die(`no gnarcadia.json in ${dir}. Run 'gnarcadia init' first.`);
  const parsed = GameManifestSchema.safeParse(JSON.parse(fs.readFileSync(p, "utf8")));
  if (!parsed.success) die("gnarcadia.json invalid:\n" + parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
  return parsed.data;
}

function validate(dir: string): GameManifest {
  const m = readManifest(dir);
  const problems = validateManifestInvariants(m);
  if (!fs.existsSync(path.join(dir, m.entry))) problems.push(`entry '${m.entry}' not found`);
  if (m.server && !fs.existsSync(path.join(dir, m.server))) problems.push(`server module '${m.server}' not found`);
  if (m.cover && !fs.existsSync(path.join(dir, m.cover))) problems.push(`cover '${m.cover}' not found`);
  const html = fs.existsSync(path.join(dir, m.entry)) ? fs.readFileSync(path.join(dir, m.entry), "utf8") : "";
  if (!/gnarcadia/i.test(html)) problems.push(`entry '${m.entry}' doesn't appear to load the Gnarcadia SDK (expected a reference to gnarcadia.iife.js or @gnarcadia/sdk)`);
  if (problems.length) die("validation failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  log(c.green("✔ ") + `${m.name} v${m.version} (${m.id}) — ${m.formats.map((f) => f.format).join(", ")}`);
  return m;
}

async function bundleServer(dir: string, m: GameManifest, outDir: string) {
  if (!m.server) return null;
  const out = path.join(outDir, "server.js");
  await esbuild({ entryPoints: [path.join(dir, m.server)], bundle: true, platform: "node", format: "esm", target: "node20", outfile: out, external: ["node:*"], logLevel: "silent", legalComments: "none" });
  return out;
}

async function pack(dir: string): Promise<string> {
  const m = validate(dir);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "gn-pack-"));
  const ignore = new Set(["node_modules", "dist", ".git", ".gnarcadiarc.json", ".DS_Store"]);
  const copy = (src: string, dst: string) => { for (const e of fs.readdirSync(src, { withFileTypes: true })) { if (ignore.has(e.name)) continue; const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); } else fs.copyFileSync(s, d); } };
  copy(dir, stage);
  if (m.server) {
    // Bundle the server module so it has no bare imports (the realtime worker imports it standalone).
    await bundleServer(dir, m, stage);
    const manifest = { ...m, server: "server.js" };
    fs.writeFileSync(path.join(stage, "gnarcadia.json"), JSON.stringify(manifest, null, 2));
    if (m.server !== "server.js" && fs.existsSync(path.join(stage, m.server))) fs.rmSync(path.join(stage, m.server), { force: true });
  }
  const zip = new AdmZip();
  zip.addLocalFolder(stage);
  const outDir = path.join(dir, "dist"); fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${m.id}-${m.version}.zip`);
  zip.writeZip(out);
  fs.rmSync(stage, { recursive: true, force: true });
  log(c.green("✔ ") + `packed ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  return out;
}

async function publish(dir: string) {
  const m = readManifest(dir);
  const { api, key } = cfg(dir);
  const zipPath = await pack(dir);
  const headers = { "x-dev-key": key };
  const reg = await fetch(`${api}/dev/games`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ id: m.id, name: m.name, developerName: m.developer, category: m.category, tags: m.tags, description: m.description, tagline: m.tagline }) });
  if (!reg.ok) die(`register failed: ${reg.status} ${await reg.text()}`);
  const form = new FormData();
  form.append("bundle", new Blob([fs.readFileSync(zipPath)], { type: "application/zip" }), path.basename(zipPath));
  const up = await fetch(`${api}/dev/games/${m.id}/versions`, { method: "POST", headers, body: form });
  const body: any = await up.json().catch(() => ({}));
  if (!up.ok) die(`upload failed: ${up.status} ${JSON.stringify(body)}`);
  log(c.green("✔ ") + `uploaded ${m.id}@${m.version} (${body.files} files) → ${body.previewUrl}`);
  if (flags.promote) {
    const pr = await fetch(`${api}/dev/games/${m.id}/promote`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ version: m.version, featured: !!flags.featured }) });
    const pb: any = await pr.json().catch(() => ({}));
    if (!pr.ok) die(`promote failed: ${pr.status} ${JSON.stringify(pb)}`);
    log(c.green("✔ ") + (pb.status === "live" ? `LIVE → ${pb.url}` : pb.message));
  } else log(c.dim(`  not live yet. Run: gnarcadia publish --promote   (or promote from the admin hub)`));
}

async function status(dir: string) {
  const { api, key } = cfg(dir);
  const r = await fetch(`${api}/dev/games`, { headers: { "x-dev-key": key } });
  if (!r.ok) die(`${r.status} ${await r.text()}`);
  for (const g of (await r.json()) as any[]) log(`${c.bold(g.id)}  ${g.status}${g.liveVersion ? ` live=${g.liveVersion}` : ""}\n` + g.versions.map((v: any) => `   ${v.version}  ${v.status}  ${new Date(v.uploadedAt).toLocaleString()}`).join("\n"));
}

function init(dir: string) {
  const template = String(flags.template ?? "async");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = [path.join(here, "../templates", template), path.join(here, "../../templates", template)].find((p) => fs.existsSync(p));
  if (!src) die(`unknown template '${template}' (async | realtime | perpetual)`);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) die(`${dir} is not empty`);
  fs.mkdirSync(dir, { recursive: true });
  const id = path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "my-game";
  for (const f of fs.readdirSync(src)) { let body = fs.readFileSync(path.join(src, f), "utf8"); body = body.replaceAll("__GAME_ID__", id).replaceAll("__GAME_NAME__", id.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())); fs.writeFileSync(path.join(dir, f), body); }
  log(c.green("✔ ") + `created ${dir} from the '${template}' template\n`);
  log(`  cd ${path.relative(process.cwd(), dir) || "."}\n  gnarcadia dev          ${c.dim("# http://localhost:5180 (needs the platform API + realtime running: pnpm dev at repo root)")}\n  gnarcadia publish --promote\n`);
}

/** Dev server: static files + hot reload (SSE) + bundles server.js on the fly for the realtime server. */
async function dev(dir: string) {
  const m = readManifest(dir);
  const port = Number(flags.port ?? 5180);
  const { api } = cfg(dir);
  const clients = new Set<import("node:http").ServerResponse>();
  const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".webp": "image/webp", ".data": "application/octet-stream" };
  const sdkPath = [path.join(path.dirname(fileURLToPath(import.meta.url)), "../../sdk/dist/gnarcadia.iife.js")].find((p) => fs.existsSync(p));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (url.pathname === "/__reload") { res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" }); res.write("\n"); clients.add(res); req.on("close", () => clients.delete(res)); return; }
    if (url.pathname === "/server.js" && m.server) {
      try { const r = await esbuild({ entryPoints: [path.join(dir, m.server)], bundle: true, platform: "node", format: "esm", target: "node20", write: false, external: ["node:*"], logLevel: "silent" }); res.writeHead(200, { "content-type": "text/javascript" }); res.end(r.outputFiles[0].text); }
      catch (e: any) { res.writeHead(500); res.end(String(e.message)); }
      return;
    }
    if (url.pathname === "/sdk/gnarcadia.iife.js" && sdkPath) { res.writeHead(200, { "content-type": "text/javascript" }); res.end(fs.readFileSync(sdkPath)); return; }
    let rel = decodeURIComponent(url.pathname); if (rel === "/") rel = "/" + m.entry;
    const file = path.join(dir, rel);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    let body: Buffer | string = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    if (ext === ".html") body = body.toString("utf8").replace("</body>", `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script></body>`);
    res.writeHead(200, { "content-type": mime[ext] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  });
  server.listen(port, () => {
    log(`\n  ${c.pink("Gnarcadia dev")}  ${c.bold(m.name)} v${m.version}\n`);
    log(`  game:      http://localhost:${port}/?format=${m.formats[0].format}&game=${m.id}&name=You&api=${encodeURIComponent(api)}`);
    log(`  2nd player: open the same URL in another window with &name=Rival (realtime formats)`);
    log(`  standalone mode: the SDK talks to ${api} for dev tickets; the realtime server fetches server.js from this server.\n`);
  });
  let t: NodeJS.Timeout | null = null;
  fs.watch(dir, { recursive: true }, (_e, f) => { if (f && (String(f).startsWith("dist") || String(f).includes("node_modules"))) return; if (t) clearTimeout(t); t = setTimeout(() => { for (const cl of clients) cl.write("data: reload\n\n"); log(c.dim(`  reloaded (${f})`)); }, 120); });
}

(async () => {
  switch (cmd) {
    case "init": return init(path.resolve(positional[0] ?? die("usage: gnarcadia init <dir> [--template async|realtime|perpetual]")));
    case "dev": return dev(gameDir());
    case "validate": validate(gameDir()); return;
    case "pack": await pack(gameDir()); return;
    case "publish": return publish(gameDir());
    case "status": return status(gameDir());
    default:
      log(`${c.pink(c.bold("gnarcadia"))} — game developer CLI\n\n  init <dir> [--template async|realtime|perpetual]\n  dev [dir] [--port 5180]\n  validate [dir]\n  pack [dir]\n  publish [dir] [--promote] [--featured] [--api URL] [--key KEY]\n  status\n`);
  }
})().catch((e) => die(e?.message ?? String(e)));
