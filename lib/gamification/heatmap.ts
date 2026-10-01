// Calendar heatmap layout. Pure.
import { addDays, daysBetween, type LocalDate } from "../time/zoned.ts";

export type HeatDay = { date: LocalDate; xp: number; byCourse: { courseId: string; xp: number }[]; frozen: boolean };

/** Monday-first weeks covering the last `weeks` weeks up to `today`, oldest first. Future days are null. */
export function heatmapWeeks(today: LocalDate, weeks: number, days: Map<LocalDate, Omit<HeatDay, "date">>): (HeatDay | null)[][] {
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const start = addDays(today, -dow - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      if (daysBetween(today, date) > 0) return null;
      return { date, ...(days.get(date) ?? { xp: 0, byCourse: [], frozen: false }) };
    }),
  );
}

/** 0–4 intensity bucket for a day's XP. */
export const heatLevel = (xp: number) => (xp <= 0 ? 0 : xp < 10 ? 1 : xp < 30 ? 2 : xp < 60 ? 3 : 4);
