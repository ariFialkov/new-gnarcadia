import { build } from "esbuild";
// Single-file browser build: <script src="gnarcadia.iife.js"></script> exposes window.Gnarcadia
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "Gnarcadia",
  outfile: "dist/gnarcadia.iife.js",
  target: ["es2020"],
  minify: false,
  sourcemap: true,
  footer: { js: "if (typeof window!=='undefined') { window.Gnarcadia = Gnarcadia; }" },
});
console.log("built dist/gnarcadia.iife.js");
