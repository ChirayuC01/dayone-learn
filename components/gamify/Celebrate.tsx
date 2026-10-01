"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Rewards } from "@/lib/gamification/service";

type Toast = { id: number; icon: string; title: string; body?: string; big?: boolean };
const Ctx = createContext<(r: Rewards) => void>(() => {});

/** Show toasts (and confetti for big moments) for the rewards of an action. */
export const useCelebrate = () => useContext(Ctx);

function toastsFor(r: Rewards): Toast[] {
  const t: Omit<Toast, "id">[] = [];
  if (r.xp > 0) t.push({ icon: "✦", title: `+${r.xp} XP`, body: r.breakdown.map((b) => `${b.label} +${b.amount}`).join(" · ") });
  if (r.level.after > r.level.before) t.push({ icon: "⬆", title: `Level ${r.level.after}!`, body: `${r.level.info.toNext} XP to level ${r.level.after + 1}.`, big: true });
  if (r.streak.extended) {
    t.push({
      icon: "🔥",
      title: `${r.streak.current}-day streak`,
      body: [r.streak.frozenDays ? `A freeze covered ${r.streak.frozenDays} missed day${r.streak.frozenDays > 1 ? "s" : ""}.` : "", r.streak.freezeEarned ? "You earned a streak freeze ❄" : ""]
        .filter(Boolean)
        .join(" ") || undefined,
    });
  }
  if (r.goal.hit) t.push({ icon: "🎯", title: "Daily goal hit!", body: `${r.goal.xpToday}/${r.goal.target} XP today.`, big: true });
  for (const a of r.achievements) t.push({ icon: a.icon, title: `Unlocked: ${a.title}`, body: a.description, big: true });
  if (r.courseCompleted) t.push({ icon: "🎓", title: "Course complete!", body: "Every lesson read and every module test passed.", big: true });
  return t.map((x, i) => ({ ...x, id: Date.now() + i }));
}

function Confetti({ run }: { run: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!run || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = ["--accent", "--ok", "--bad", "--fg"].map((v) => css.getPropertyValue(v).trim() || "#f0b44c");
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)]!,
      s: 5 + Math.random() * 5,
    }));
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (t - start < 1800) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confetti, setConfetti] = useState(0);

  const celebrate = useCallback((r: Rewards) => {
    const next = toastsFor(r);
    if (!next.length) return;
    setToasts((t) => [...t, ...next].slice(-5));
    if (next.some((x) => x.big)) setConfetti((n) => n + 1);
    const ids = new Set(next.map((x) => x.id));
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 6000);
  }, []);

  return (
    <Ctx.Provider value={celebrate}>
      {children}
      <Confetti run={confetti} />
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.big ? " big" : ""}`}>
            <span className="ti" aria-hidden="true">
              {t.icon}
            </span>
            <span>
              <b>{t.title}</b>
              {t.body && <small>{t.body}</small>}
            </span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
