import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";
import { env } from "../env.js";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let _db: Db | null = null;
let _close: () => Promise<void> = async () => {};

/**
 * Dev: embedded PGlite (real Postgres compiled to WASM) in ./.pglite — zero setup.
 * Prod: DATABASE_URL (Neon / Supabase / Fly Postgres / RDS ...). Same schema, same queries.
 */
export async function getDb(): Promise<Db> {
  if (_db) return _db;
  if (env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: env.DATABASE_URL, max: 10 });
    _db = drizzle(pool, { schema }) as unknown as Db;
    _close = () => pool.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = env.PGLITE_DIR === ":memory:" ? undefined : path.resolve(env.PGLITE_DIR);
    const client = dir ? new PGlite(dir) : new PGlite();
    _db = drizzle(client, { schema }) as unknown as Db;
    _close = () => client.close();
  }
  await migrate(_db);
  return _db;
}

export async function closeDb() { await _close(); _db = null; }

async function migrate(db: Db) {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = [path.join(here, "../migrations"), path.join(here, "../../migrations")].find((p) => fs.existsSync(p));
  if (!dir) throw new Error("migrations directory not found");
  const applied = new Set(((await db.execute(sql`SELECT name FROM schema_migrations`)) as any).rows.map((r: any) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    for (const stmt of body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await db.execute(sql.raw(stmt));
    await db.execute(sql`INSERT INTO schema_migrations (name) VALUES (${file})`);
  }
}

export { schema };
