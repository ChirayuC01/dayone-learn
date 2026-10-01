// Pure helpers for presenting a course: titles, tracks, syllabus states and paging.
import type { TrackDef } from "../ingest/normalize.ts";
import type { DayAccess } from "../learning/access.ts";

export const pad = (n: number) => String(n).padStart(2, "0");

/** Parses the [nn] route segment. Returns null for anything that isn't a positive day number. */
export function parseDayParam(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

/** Picks a valid track: the requested one if the course has it, else the course default. */
export function resolveTrack(tracks: TrackDef[], defaultTrack: string, requested?: string | null): string {
  if (requested && tracks.some((t) => t.key === requested)) return requested;
  return defaultTrack;
}

export function lessonTitle(lesson: { title: string; trackTitles: unknown }, track: string): string {
  const titles = (lesson.trackTitles ?? {}) as Record<string, string>;
  return titles[track] || lesson.title;
}

/** Markdown for a track, falling back to the course default and then any track (as the prototype did). */
export function lessonMarkdown(content: unknown, track: string, defaultTrack: string): string {
  const c = (content ?? {}) as Record<string, string>;
  return c[track] ?? c[defaultTrack] ?? Object.values(c)[0] ?? "";
}

/** Rough reading time at 200 words a minute; code blocks count like prose. */
export function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ───────────── Syllabus outline ─────────────

export type OutlineInput = {
  modules: { number: number; title: string; dayFrom: number; dayTo: number; testQuestions: number }[];
  syllabus: { day: number; moduleNumber: number; title: string }[];
  lessons: { day: number; title: string; trackTitles: unknown }[];
};

export type OutlineDay = { day: number; title: string; access: DayAccess };
export type OutlineModule = {
  number: number;
  title: string;
  dayFrom: number;
  dayTo: number;
  days: OutlineDay[];
  published: number;
  hasTest: boolean;
};

/** `access` decides each day's state; by default every published day is open (no enrollment rules). */
export function buildOutline(
  input: OutlineInput,
  track: string,
  access: (day: number, published: boolean) => DayAccess = (_d, p) => (p ? "open" : "upcoming"),
): OutlineModule[] {
  const lessons = new Map(input.lessons.map((l) => [l.day, l]));
  return [...input.modules]
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      const days = input.syllabus
        .filter((d) => d.moduleNumber === m.number)
        .sort((a, b) => a.day - b.day)
        .map((d): OutlineDay => {
          const l = lessons.get(d.day);
          return { day: d.day, title: l ? lessonTitle(l, track) : d.title, access: access(d.day, Boolean(l)) };
        });
      return {
        number: m.number,
        title: m.title,
        dayFrom: m.dayFrom,
        dayTo: m.dayTo,
        days,
        published: days.filter((d) => d.access !== "upcoming").length,
        hasTest: m.testQuestions > 0,
      };
    });
}

/** The nearest published days before and after `day`. */
export function neighbours(publishedDays: number[], day: number): { prev: number | null; next: number | null } {
  const sorted = [...publishedDays].sort((a, b) => a - b);
  return {
    prev: sorted.filter((d) => d < day).at(-1) ?? null,
    next: sorted.find((d) => d > day) ?? null,
  };
}
