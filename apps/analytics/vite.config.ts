import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Served under /analytics-hub/ in production (same domain as the arcade). Override with VITE_BASE=/ for a dedicated host. */
export default defineConfig({
  base: process.env.VITE_BASE ?? "/analytics-hub/",
  plugins: [react()],
  server: { port: 5174 },
  build: { outDir: "dist", sourcemap: false },
});
