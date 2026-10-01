// Leitner spaced repetition. Pure. Boxes 1–5; a question in box n is due `INTERVALS[n-1]` days after
// it was last answered, at the start of that day in the learner's time zone.
import { addDays, zonedTimeToUtc, type LocalDate } from "../time/zoned.ts";

export const INTERVALS = [1, 2, 4, 8, 16] as const; // days, for boxes 1..5
export const MAX_BOX = INTERVALS.length;
export const SESSION_SIZE = 5;

export type ReviewState = { box: number; dueAt: Date };

/** When a question in `box` answered `today` comes back: local midnight `interval` days later. */
export function dueFor(box: number, today: LocalDate, tz: string): Date {
  const days = INTERVALS[Math.min(MAX_BOX, Math.max(1, box)) - 1]!;
  return zonedTimeToUtc(addDays(today, days), "00:00", tz);
}

/** A question answered wrong in a quiz enters (or re-enters) box 1. */
export const enterQueue = (today: LocalDate, tz: string): ReviewState => ({ box: 1, dueAt: dueFor(1, today, tz) });

/** A review answer: correct moves up a box (max 5), wrong goes back to box 1. */
export function afterReview(prev: { box: number }, correct: boolean, today: LocalDate, tz: string): ReviewState {
  const box = correct ? Math.min(MAX_BOX, prev.box + 1) : 1;
  return { box, dueAt: dueFor(box, today, tz) };
}

export type DueItem = { questionId: string; courseId: string; box: number; dueAt: Date };

/**
 * Picks up to `size` due items: most overdue first, then lower boxes, then taking courses in turn so a
 * session mixes courses whenever more than one has something due.
 */
export function pickSession<T extends DueItem>(items: T[], now: Date, size = SESSION_SIZE): T[] {
  const due = items
    .filter((i) => i.dueAt.getTime() <= now.getTime())
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.box - b.box || a.questionId.localeCompare(b.questionId));
  const byCourse = new Map<string, T[]>();
  for (const i of due) byCourse.set(i.courseId, [...(byCourse.get(i.courseId) ?? []), i]);
  const queues = [...byCourse.values()];
  const out: T[] = [];
  while (out.length < size && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
      if (out.length === size) break;
    }
  }
  return out;
}

export const reviewsPerDayRewarded = 4;
