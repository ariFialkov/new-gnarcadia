import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerIn, WorkerOut } from "./game-worker.js";
import { resolveServerModule } from "./module-cache.js";

/** One worker per game@version; rooms are multiplexed inside it. Restarts lazily if the worker dies. */
export class GameHost {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private listeners = new Set<(m: WorkerOut) => void>();
  constructor(readonly gameId: string, readonly version: string) {}

  key() { return `${this.gameId}@${this.version}`; }

  async ensure(): Promise<void> {
    if (this.worker && this.ready) return this.ready;
    const modulePath = await resolveServerModule(this.gameId, this.version);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const isTs = import.meta.url.endsWith(".ts");
    const workerFile = path.join(here, isTs ? "game-worker.ts" : "game-worker.js");
    const w = new Worker(workerFile, { workerData: { modulePath }, execArgv: isTs ? ["--import", "tsx"] : [], resourceLimits: { maxOldGenerationSizeMb: 256 } });
    this.worker = w;
    this.ready = new Promise<void>((resolve, reject) => {
      const onMsg = (m: any) => { if (m.t === "ready") { resolve(); } else if (m.t === "fatal" && m.roomId === "*") reject(new Error(m.error)); };
      w.once("error", reject);
      w.on("message", onMsg);
    });
    w.on("message", (m: WorkerOut) => this.listeners.forEach((l) => l(m)));
    w.on("exit", (code) => { console.warn(`[host ${this.key()}] worker exited (${code})`); this.listeners.forEach((l) => l({ t: "fatal", roomId: "*", error: `worker exited ${code}` })); this.worker = null; this.ready = null; });
    w.on("error", (e) => console.error(`[host ${this.key()}] worker error`, e));
    return this.ready;
  }

  send(m: WorkerIn) { this.worker?.postMessage(m); }
  onMessage(fn: (m: WorkerOut) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async terminate() { await this.worker?.terminate(); this.worker = null; this.ready = null; }
}
