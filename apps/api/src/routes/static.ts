import type { FastifyPluginAsync } from "fastify";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gamesRoot } from "../services/storage.js";

/**
 * Serves uploaded game bundles at /g/:gameId/:version/* and the SDK browser build at /sdk/*.
 * Bundles are served with a strict CSP: games run in a sandboxed iframe and may only talk to the host via postMessage
 * plus WebSocket to the realtime server. Move to R2/CDN behind the same paths when traffic grows.
 */
export const staticRoutes: FastifyPluginAsync = async (app) => {
  fs.mkdirSync(gamesRoot(), { recursive: true });
  await app.register(fastifyStatic, { root: gamesRoot(), prefix: "/g/", decorateReply: false, cacheControl: true, maxAge: "1h", immutable: false, setHeaders: (res) => {
    res.setHeader("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' ws: wss: http://localhost:* https:; font-src 'self' data: https:; frame-ancestors *;");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  } });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sdkDist = [path.join(here, "../../../packages/sdk/dist"), path.join(here, "../../../../packages/sdk/dist"), path.join(process.cwd(), "packages/sdk/dist"), path.join(process.cwd(), "../../packages/sdk/dist")].find((p) => fs.existsSync(p));
  if (sdkDist) await app.register(fastifyStatic, { root: sdkDist, prefix: "/sdk/", decorateReply: false, setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", "*") });
  const dataDir = [path.join(here, "../data"), path.join(here, "../../data")].find((p) => fs.existsSync(p));
  if (dataDir) await app.register(fastifyStatic, { root: dataDir, prefix: "/data/", decorateReply: false, setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", "*") });
};
