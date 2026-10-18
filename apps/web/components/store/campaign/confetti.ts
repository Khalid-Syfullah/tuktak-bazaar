/**
 * A small confetti burst on a canvas laid over its parent. About 1.4 s, stops early when the tab is hidden.
 * Callers skip it when the visitor prefers reduced motion.
 */
export function confettiBurst(canvas: HTMLCanvasElement, colors: string[], origin: { x: number; y: number } = { x: 0.5, y: 0.35 }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  const count = Math.min(140, Math.round(width / 6));
  const parts = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    return {
      x: width * origin.x,
      y: height * origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    };
  });
  const started = performance.now();
  let frame = 0;
  const step = (t: number) => {
    const age = t - started;
    ctx.clearRect(0, 0, width, height);
    if (age > 1400 || document.hidden) return stop();
    ctx.globalAlpha = age > 1000 ? 1 - (age - 1000) / 400 : 1;
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    frame = requestAnimationFrame(step);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    ctx.clearRect(0, 0, width, height);
  };
  frame = requestAnimationFrame(step);
  return stop;
}
