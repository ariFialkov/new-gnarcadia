import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../lib/device.ts";

/** Lightweight canvas confetti burst. Respects reduced motion (renders nothing). */
export function Confetti({ burst = 120, duration = 1800 }: { burst?: number; duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; };
    resize();
    const colors = ["#7c3aed", "#ec4899", "#06b6d4", "#fde047", "#22c55e", "#fb923c"];
    const W = canvas.width, H = canvas.height;
    const parts = Array.from({ length: burst }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 18 * dpr, vy: (-6 - Math.random() * 10) * dpr,
      r: (3 + Math.random() * 5) * dpr, c: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, shape: Math.random() > 0.5 ? 1 : 0,
    }));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35 * dpr; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - t / duration);
        if (p.shape) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { ctx.beginPath(); ctx.arc(0, 0, p.r / 1.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (t < duration) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [burst, duration]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
