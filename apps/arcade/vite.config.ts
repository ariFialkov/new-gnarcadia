import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** API origin at build/runtime. Matches VITE_API_URL in .env (default http://localhost:4000). */
const apiUrl = (process.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const apiOrigin = new URL(apiUrl).origin;
/** Path prefix of the API on that origin ("" locally, "/api" behind the production proxy). */
const apiPath = new URL(apiUrl).pathname.replace(/\/$/, "");
const apiRoute = (re: RegExp) => (url: URL) => url.origin === apiOrigin && url.pathname.startsWith(apiPath) && re.test(url.pathname.slice(apiPath.length));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Gnarcadia",
        short_name: "Gnarcadia",
        description: "Skill games, real prizes. Quick rounds of arcade, puzzle and action games.",
        theme_color: "#7c3aed",
        background_color: "#f3efff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        id: "/",
        categories: ["games", "entertainment"],
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        // The game runner and the wallet return page must always hit the network / app shell fresh.
        navigateFallbackDenylist: [/^\/g\//, /^\/sdk\//, /^\/api\//, /^\/rt(\/|$)/, /^\/analytics-hub(\/|$)/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Game catalogue: fast when online, still browsable when flaky. Never cache auth/wallet/matches/me.
            urlPattern: ({ url, request }) => request.method === "GET" && apiRoute(/^\/games(\/|$)/)(url),
            handler: "NetworkFirst",
            options: { cacheName: "gn-games-api", networkTimeoutSeconds: 4, expiration: { maxEntries: 60, maxAgeSeconds: 10 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: ({ url }) => apiRoute(/^\/(auth|wallet|matches|me)(\/|$)/)(url),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => apiRoute(/^\/(jurisdictions|terms\/current)$/)(url),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "gn-static-api", expiration: { maxEntries: 10, maxAgeSeconds: 24 * 3600 } },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: { cacheName: "gn-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Game covers served by the API.
            urlPattern: ({ url, request }) => request.destination === "image" && url.origin === apiOrigin,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "gn-covers", expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, host: true },
  preview: { port: 5173 },
  build: { target: "es2022", sourcemap: false },
});
