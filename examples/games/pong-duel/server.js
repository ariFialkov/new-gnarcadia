// Pong Duel — authoritative server logic. Plain ESM, no imports needed (defineGame is only a typed identity).
// Runs inside the Gnarcadia realtime worker; receives inputs, simulates, ranks.
const W = 160, H = 90, PADDLE_H = 18, PADDLE_SPEED = 90, BALL_SPEED = 70, WIN_SCORE = 5;

export default {
  tickRate: 30,
  snapshotRate: 15,
  create(ctx) {
    return { ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, paddles: {}, scores: {}, order: [], serveAt: 0, rallies: 0 };
  },
  onJoin(s, p, ctx) {
    s.order.push(p.playerId);
    s.paddles[p.playerId] = { y: H / 2, target: H / 2, side: s.order.length === 1 ? "left" : "right" };
    s.scores[p.playerId] = 0;
  },
  onStart(s, ctx) { serve(s, ctx, 1); },
  onInput(s, p, input, ctx) {
    // Accept only a target y (0..H). Anything else is rejected and counts toward the kick threshold.
    if (!input || typeof input.y !== "number" || !Number.isFinite(input.y)) throw new Error("bad input");
    s.paddles[p.playerId].target = Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, input.y));
  },
  onTick(s, dtMs, ctx) {
    const dt = Math.min(dtMs, 50) / 1000;
    for (const pd of Object.values(s.paddles)) { const d = pd.target - pd.y; const step = Math.sign(d) * Math.min(Math.abs(d), PADDLE_SPEED * dt); pd.y += step; }
    if (ctx.now() < s.serveAt) return;
    const b = s.ball; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < 2) { b.y = 2; b.vy = Math.abs(b.vy); } if (b.y > H - 2) { b.y = H - 2; b.vy = -Math.abs(b.vy); }
    const [leftId, rightId] = s.order;
    const hit = (pd, x) => Math.abs(b.x - x) < 3 && Math.abs(b.y - pd.y) < PADDLE_H / 2 + 2;
    if (b.vx < 0 && leftId && hit(s.paddles[leftId], 6)) bounce(s, s.paddles[leftId], 1);
    if (b.vx > 0 && rightId && hit(s.paddles[rightId], W - 6)) bounce(s, s.paddles[rightId], -1);
    if (b.x < -4) point(s, ctx, rightId, 1); else if (b.x > W + 4) point(s, ctx, leftId, -1);
  },
  rank(s) {
    return Object.entries(s.scores).map(([playerId, score]) => ({ playerId, score })).sort((a, b) => b.score - a.score).map((e, i, arr) => ({ ...e, rank: i > 0 && arr[i - 1].score === e.score ? i : i + 1 }));
  },
  serialize(s) { return { ball: s.ball, paddles: s.paddles, scores: s.scores, order: s.order, serving: s.serveAt }; },
};

function serve(s, ctx, dir) {
  const angle = (ctx.random.next() - 0.5) * 1.2;         // shared seed → both clients could predict, server decides
  s.ball = { x: W / 2, y: H / 2, vx: Math.cos(angle) * BALL_SPEED * dir, vy: Math.sin(angle) * BALL_SPEED };
  s.serveAt = ctx.now() + 900; s.rallies = 0;
}
function bounce(s, pd, dir) {
  const rel = (s.ball.y - pd.y) / (PADDLE_H / 2);          // -1..1 → angle
  const speed = BALL_SPEED + Math.min(60, ++s.rallies * 4);
  const ang = rel * 1.1;
  s.ball.vx = Math.cos(ang) * speed * dir; s.ball.vy = Math.sin(ang) * speed;
}
function point(s, ctx, scorerId, nextDir) {
  if (scorerId) s.scores[scorerId]++;
  ctx.broadcast("point", { scorer: scorerId, scores: s.scores });
  if (scorerId && s.scores[scorerId] >= WIN_SCORE) { ctx.end(undefined); return; }
  serve(s, ctx, nextDir);
}
