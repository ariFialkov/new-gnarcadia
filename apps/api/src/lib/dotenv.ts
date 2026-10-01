import fs from "node:fs";
import path from "node:path";
/** Minimal .env loader (walks up to the repo root). Does not override existing env vars. */
export function config() {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const p = path.join(dir, ".env");
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m || line.trim().startsWith("#")) continue;
        let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
      return;
    }
    dir = path.dirname(dir);
  }
}
