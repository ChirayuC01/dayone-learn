// Pure validation and normalisation for ingested content. No database access here.
import type { CourseInput, LessonInput, QuestionInput } from "./schema.ts";

export const MIN_QUESTIONS_PER_TRACK = 5;

export class IngestError extends Error {
  readonly status: number;
  readonly issues: string[];
  constructor(status: number, message: string, issues: string[] = []) {
    super(issues.length ? `${message}: ${issues.join("; ")}` : message);
    this.name = "IngestError";
    this.status = status;
    this.issues = issues;
  }
}

export type TrackDef = { key: string; label: string };

/** Question row data, ready for Prisma (minus ids/relations). */
export type QuestionData = {
  kind: "MCQ" | "CMD" | "TEXT_EXACT";
  tracks: string[];
  prompt: string;
  options: string[];
  answerIndex: number | null;
  accept: string[];
  caseSensitive: boolean;
  explain: string;
  order: number;
};

export function normalizeQuestion(q: QuestionInput, order: number): QuestionData {
  const common = {
    tracks: q.tracks ? [...new Set(q.tracks)] : [],
    prompt: q.q,
    explain: q.explain,
    order,
  };
  switch (q.type) {
    case "mcq":
      return { ...common, kind: "MCQ", options: q.options, answerIndex: q.answer, accept: [], caseSensitive: true };
    case "cmd":
      return { ...common, kind: "CMD", options: [], answerIndex: null, accept: q.accept, caseSensitive: q.caseSensitive ?? true };
    case "text":
      return {
        ...common,
        kind: "TEXT_EXACT",
        options: [],
        answerIndex: null,
        accept: q.accept,
        caseSensitive: q.caseSensitive ?? true,
      };
  }
}

/** Questions visible on a track: an empty `tracks` list means every track. */
export function questionsForTrack<T extends { tracks: string[] }>(questions: T[], track: string): T[] {
  return questions.filter((q) => q.tracks.length === 0 || q.tracks.includes(track));
}

/** Returns one issue per track that has fewer than `min` questions. */
export function trackCoverageIssues(questions: QuestionData[], trackKeys: string[], min: number): string[] {
  return trackKeys
    .map((key) => ({ key, n: questionsForTrack(questions, key).length }))
    .filter(({ n }) => n < min)
    .map(({ key, n }) => `track "${key}" has ${n} question${n === 1 ? "" : "s"}, needs at least ${min}`);
}

function unknownTrackIssues(keys: string[], trackKeys: string[], where: string): string[] {
  return keys.filter((k) => !trackKeys.includes(k)).map((k) => `${where}: "${k}" is not a track of this course`);
}

export function prepareQuestions(quiz: QuestionInput[], trackKeys: string[]) {
  const questions = quiz.map((q, i) => normalizeQuestion(q, i));
  const issues = questions.flatMap((q, i) => unknownTrackIssues(q.tracks, trackKeys, `quiz[${i}].tracks`));
  return { questions, issues };
}

// ───────────── Syllabus ─────────────

export type SyllabusPlan = {
  modules: { number: number; title: string; dayFrom: number; dayTo: number }[];
  days: { day: number; moduleNumber: number; title: string }[];
};

/** Validates the course body and flattens it into modules and syllabus days. */
export function planSyllabus(input: CourseInput, urlSlug: string): SyllabusPlan {
  const issues: string[] = [];
  if (input.slug !== undefined && input.slug !== urlSlug) issues.push(`body slug "${input.slug}" does not match URL slug "${urlSlug}"`);

  const trackKeys = input.tracks.map((t) => t.key);
  if (new Set(trackKeys).size !== trackKeys.length) issues.push("track keys must be unique");
  if (!trackKeys.includes(input.defaultTrack)) issues.push(`defaultTrack "${input.defaultTrack}" is not one of the tracks`);

  const numbers = input.modules.map((m) => m.number);
  if (new Set(numbers).size !== numbers.length) issues.push("module numbers must be unique");

  const modules: SyllabusPlan["modules"] = [];
  const days: SyllabusPlan["days"] = [];
  for (const m of [...input.modules].sort((a, b) => a.number - b.number)) {
    const ds = [...m.days].sort((a, b) => a.day - b.day);
    ds.forEach((d, i) => {
      if (i > 0 && d.day !== ds[i - 1]!.day + 1) issues.push(`module ${m.number}: days must be consecutive (gap before day ${d.day})`);
    });
    modules.push({ number: m.number, title: m.title, dayFrom: ds[0]!.day, dayTo: ds[ds.length - 1]!.day });
    for (const d of ds) days.push({ day: d.day, moduleNumber: m.number, title: d.title });
  }

  days.sort((a, b) => a.day - b.day);
  const dayNumbers = days.map((d) => d.day);
  const expected = Array.from({ length: input.totalDays }, (_, i) => i + 1);
  if (dayNumbers.length !== expected.length || dayNumbers.some((d, i) => d !== expected[i])) {
    issues.push(`syllabus must list each day 1..${input.totalDays} exactly once (got ${dayNumbers.length} days)`);
  }

  if (issues.length) throw new IngestError(422, "invalid course", issues);
  return { modules, days };
}

// ───────────── Lessons ─────────────

export type LessonCourseContext = {
  trackKeys: string[];
  syllabusDay: { day: number; moduleNumber: number } | null;
};

/** Validates a lesson body against its course and returns normalised questions. */
export function prepareLesson(input: LessonInput, urlDay: number, ctx: LessonCourseContext) {
  const issues: string[] = [];
  if (input.day !== urlDay) issues.push(`body day ${input.day} does not match URL day ${urlDay}`);
  if (!ctx.syllabusDay) issues.push(`day ${urlDay} is not in the course syllabus`);
  else if (ctx.syllabusDay.moduleNumber !== input.module) {
    issues.push(`day ${urlDay} belongs to module ${ctx.syllabusDay.moduleNumber}, not ${input.module}`);
  }
  issues.push(...unknownTrackIssues(Object.keys(input.content), ctx.trackKeys, "content"));
  issues.push(...unknownTrackIssues(Object.keys(input.trackTitles ?? {}), ctx.trackKeys, "trackTitles"));

  const { questions, issues: qIssues } = prepareQuestions(input.quiz, ctx.trackKeys);
  issues.push(...qIssues);
  issues.push(...trackCoverageIssues(questions, ctx.trackKeys, MIN_QUESTIONS_PER_TRACK));

  if (issues.length) throw new IngestError(422, "invalid lesson", issues);
  return questions;
}

/** Appends a section (e.g. answered doubts) to existing per-track markdown. */
export function appendSections(
  content: Record<string, string>,
  section: Record<string, string>,
  trackKeys: string[],
): Record<string, string> {
  const issues = unknownTrackIssues(Object.keys(section), trackKeys, "section");
  if (issues.length) throw new IngestError(422, "invalid section", issues);
  const next = { ...content };
  for (const [key, md] of Object.entries(section)) {
    next[key] = next[key] ? `${next[key].trimEnd()}\n\n---\n\n${md.trim()}\n` : `${md.trim()}\n`;
  }
  return next;
}
