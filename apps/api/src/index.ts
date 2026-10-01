import { env } from "./env.js";
import { buildApp } from "./app.js";
import { startJanitor } from "./jobs/janitor.js";
import { seedIfEmpty, bootstrapAdmin, seedExampleGames } from "./seed.js";

const app = await buildApp();
await bootstrapAdmin(app.db);
if (env.SYNC_EXAMPLE_GAMES) await seedExampleGames(app.db);
if (env.SEED_DEMO_DATA) await seedIfEmpty(app.db);
startJanitor(app.db);
await app.listen({ port: env.PORT, host: env.HOST });
console.log(`\n  Gnarcadia API  →  ${env.PUBLIC_API_URL}   (db: ${env.DATABASE_URL ? "postgres" : "pglite " + env.PGLITE_DIR}, geo=${env.GEO_PROVIDER}, kyc=${env.KYC_PROVIDER}, pay=${env.PAYMENT_PROVIDER})\n`);
