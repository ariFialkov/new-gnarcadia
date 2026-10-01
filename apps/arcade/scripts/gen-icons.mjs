/**
 * Generates the PWA icons into public/ with zero dependencies:
 *   - icon.svg (vector, purpose: any)
 *   - icon-192.png, icon-512.png, apple-touch-icon.png (raster, hand-encoded PNG via zlib)
 * The mark is a bold stylised "G" (ring with a gap + bar) on a purple->pink->cyan gradient.
 *   node scripts/gen-icons.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(out, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/><stop offset=".55" stop-color="#ec4899"/><stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <rect x="24" y="24" width="464" height="220" rx="96" fill="url(#s)"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" stroke-width="64" stroke-linecap="round" stroke-dasharray="730 1000" transform="rotate(35 256 256)"/>
  <rect x="256" y="224" width="152" height="64" rx="32" fill="#ffffff"/>
  <rect x="344" y="224" width="64" height="120" rx="32" fill="#ffffff"/>
  <circle cx="392" cy="128" r="28" fill="#fde047"/>
</svg>`;
writeFileSync(join(out, "icon.svg"), svg);
writeFileSync(join(out, "favicon.svg"), svg);

// ---- tiny PNG encoder ----
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x, y); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const lerp = (a, b, t) => a + (b - a) * t;
const stops = [[0, [124, 58, 237]], [0.55, [236, 72, 153]], [1, [6, 182, 212]]];
function grad(t) { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]; const k = (t - t0) / (t1 - t0); return c0.map((c, j) => lerp(c, c1[j], k)); } return stops[2][1]; }
const smooth = (edge, v) => Math.max(0, Math.min(1, 0.5 - v / edge));
function render(size) {
  const u = size / 512; // scale from the 512 design grid
  const R = 112 * u, cx = 256 * u, cy = 256 * u, ring = 150 * u, sw = 32 * u; // ring radius + half stroke
  const aa = 1.2;
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    // rounded square mask
    const qx = Math.abs(px - cx) - (size / 2 - R), qy = Math.abs(py - cy) - (size / 2 - R);
    const dBox = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
    const alpha = smooth(aa, dBox);
    if (alpha <= 0) return [0, 0, 0, 0];
    let [r, g, b] = grad((px + py) / (2 * size));
    // top sheen
    const sheen = Math.max(0, 1 - py / (size * 0.48)) * 0.28;
    r = lerp(r, 255, sheen); g = lerp(g, 255, sheen); b = lerp(b, 255, sheen);
    // "G": ring with a gap on the right-top (angle window), plus bar and stub
    const dx = px - cx, dy = py - cy, dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx); // -PI..PI, 0 = right
    const inGap = ang > -0.95 && ang < -0.15; // gap in the upper-right quadrant
    const dRing = Math.abs(dist - ring) - sw;
    let white = inGap ? 0 : smooth(aa, dRing);
    // round caps at gap ends
    for (const a of [-0.95, -0.15]) { const ex = cx + Math.cos(a) * ring, ey = cy + Math.sin(a) * ring; white = Math.max(white, smooth(aa, Math.hypot(px - ex, py - ey) - sw)); }
    // bar (y 224..288, x 256..408) and stub (x 344..408, y 224..344)
    const rr = (x0, y0, x1, y1, rad) => { const hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, mx = x0 + hx, my = y0 + hy; const ax = Math.abs(px - mx) - (hx - rad), ay = Math.abs(py - my) - (hy - rad); return Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0) - rad; };
    white = Math.max(white, smooth(aa, rr(256 * u, 224 * u, 408 * u, 288 * u, 32 * u)));
    white = Math.max(white, smooth(aa, rr(344 * u, 224 * u, 408 * u, 344 * u, 32 * u)));
    // yellow spark
    const spark = smooth(aa, Math.hypot(px - 392 * u, py - 128 * u) - 28 * u);
    r = lerp(r, 255, white); g = lerp(g, 255, white); b = lerp(b, 255, white);
    r = lerp(r, 253, spark); g = lerp(g, 224, spark); b = lerp(b, 71, spark);
    return [Math.round(r), Math.round(g), Math.round(b), Math.round(alpha * 255)];
  };
}
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(join(out, name), png(size, render(size)));
  console.log("wrote", name);
}
