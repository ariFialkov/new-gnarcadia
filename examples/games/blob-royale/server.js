// Blob Royale — perpetual lobby. Entry = bounty. Eat a smaller blob -> ctx.eliminate(victim, you) moves their bounty to your bank.
// Leaving (SDK rt.leave()) cashes out bank + remaining bounty. The runtime + platform handle all money.
const W = 400, H = 400, BASE_R = 8, SPEED = 60;

export default {
  tickRate: 20,
  snapshotRate: 12,
  create(ctx) { return { blobs: {}, food: spawnFood(ctx, 40) }; },
  onJoin(s, p, ctx) {
    s.blobs[p.playerId] = { x: 20 + ctx.random.next() * (W - 40), y: 20 + ctx.random.next() * (H - 40), r: BASE_R, tx: 0, ty: 0, name: p.displayName, skin: p.cosmetics.skin || "", trail: p.cosmetics.trail || "", mass: 1, spawnedAt: ctx.now() };
  },
  onLeave(s, p) { delete s.blobs[p.playerId]; },
  onInput(s, p, input) {
    if (!input || typeof input.dx !== "number" || typeof input.dy !== "number" || !Number.isFinite(input.dx + input.dy)) throw new Error("bad input");
    const b = s.blobs[p.playerId]; if (!b) return;
    const len = Math.hypot(input.dx, input.dy) || 1; b.tx = input.dx / len; b.ty = input.dy / len;
  },
  onTick(s, dtMs, ctx) {
    const dt = Math.min(dtMs, 60) / 1000;
    const ids = Object.keys(s.blobs);
    for (const id of ids) {
      const b = s.blobs[id]; if (!b) continue;
      const sp = SPEED * Math.pow(BASE_R / b.r, 0.35);           // bigger = slower (risk/reward)
      b.x = Math.max(b.r, Math.min(W - b.r, b.x + b.tx * sp * dt)); b.y = Math.max(b.r, Math.min(H - b.r, b.y + b.ty * sp * dt));
      // food
      for (let i = s.food.length - 1; i >= 0; i--) { const f = s.food[i]; if (Math.hypot(f.x - b.x, f.y - b.y) < b.r) { s.food.splice(i, 1); b.r = Math.min(40, b.r + 0.6); } }
    }
    if (s.food.length < 40) s.food.push(...spawnFood(ctx, 1));
    // eat: 20% bigger and overlapping centre; 3s spawn protection
    for (const a of ids) for (const v of ids) {
      if (a === v) continue; const A = s.blobs[a], V = s.blobs[v]; if (!A || !V) continue;
      if (ctx.now() - V.spawnedAt < 3000) continue;
      if (A.r > V.r * 1.2 && Math.hypot(A.x - V.x, A.y - V.y) < A.r - V.r * 0.4) {
        A.r = Math.min(48, Math.sqrt(A.r * A.r + V.r * V.r * 0.6));
        delete s.blobs[v];
        ctx.eliminate(v, a);                                      // bounty transfer handled by the runtime
        ctx.broadcast("eaten", { victim: v, by: a });
      }
    }
  },
  rank(s) { return Object.entries(s.blobs).map(([playerId, b]) => ({ playerId, score: b.r })).sort((x, y) => y.score - x.score).map((e, i) => ({ ...e, rank: i + 1 })); },
  serialize(s) { return { blobs: s.blobs, food: s.food, w: W, h: H }; },
};

function spawnFood(ctx, n) { const out = []; for (let i = 0; i < n; i++) out.push({ x: 5 + ctx.random.next() * (W - 10), y: 5 + ctx.random.next() * (H - 10), c: ctx.random.int(0, 5) }); return out; }
