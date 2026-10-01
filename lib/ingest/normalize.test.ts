import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IngestError,
  appendSections,
  normalizeQuestion,
  planSyllabus,
  prepareLesson,
  questionsForTrack,
} from "./normalize.ts";
import { courseSchema, lessonSchema, moduleTestSchema, questionSchema, type CourseInput, type LessonInput } from "./schema.ts";

const SEED = join(import.meta.dirname, "..", "..", "reference", "seed", "linux");
const json = (f: string) => JSON.parse(readFileSync(join(SEED, f), "utf8"));

const course = (over: Partial<CourseInput> = {}): CourseInput =>
  courseSchema.parse({
    title: "T",
    tracks: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
    defaultTrack: "a",
    totalDays: 3,
    modules: [
      { number: 1, title: "M1", days: [{ day: 1, title: "d1" }, { day: 2, title: "d2" }] },
      { number: 2, title: "M2", days: [{ day: 3, title: "d3" }] },
    ],
    ...over,
  });

const mcq = (tracks?: string[]) => ({ type: "mcq", q: "Q?", options: ["x", "y"], answer: 1, explain: "", ...(tracks ? { tracks } : {}) });
const lesson = (over: Partial<LessonInput> = {}): LessonInput =>
  lessonSchema.parse({ day: 1, module: 1, title: "L", content: { a: "# a", b: "# b" }, quiz: Array.from({ length: 5 }, () => mcq()), ...over });
const ctx = { trackKeys: ["a", "b"], syllabusDay: { day: 1, moduleNumber: 1 } };

describe("question schema + normalisation", () => {
  it("maps mcq, cmd and text questions", () => {
    expect(normalizeQuestion(questionSchema.parse(mcq(["a"])), 0)).toMatchObject({ kind: "MCQ", answerIndex: 1, tracks: ["a"], prompt: "Q?" });
    const cmd = normalizeQuestion(questionSchema.parse({ type: "cmd", q: "q", accept: ["ls -la"], explain: "e" }), 3);
    expect(cmd).toMatchObject({ kind: "CMD", accept: ["ls -la"], caseSensitive: true, answerIndex: null, order: 3, tracks: [] });
    const text = normalizeQuestion(questionSchema.parse({ type: "text", q: "q", accept: ["Kernel"], caseSensitive: false }), 0);
    expect(text).toMatchObject({ kind: "TEXT_EXACT", caseSensitive: false, explain: "" });
  });

  it("rejects an mcq answer outside the options", () => {
    expect(questionSchema.safeParse({ ...mcq(), answer: 2 }).success).toBe(false);
  });

  it("rejects unknown question types and empty accept lists", () => {
    expect(questionSchema.safeParse({ type: "essay", q: "q" }).success).toBe(false);
    expect(questionSchema.safeParse({ type: "cmd", q: "q", accept: [] }).success).toBe(false);
  });

  it("treats an empty tracks list as every track", () => {
    const qs = [{ tracks: [] }, { tracks: ["a"] }, { tracks: ["b"] }];
    expect(questionsForTrack(qs, "a")).toHaveLength(2);
    expect(questionsForTrack(qs, "b")).toHaveLength(2);
  });
});

describe("planSyllabus", () => {
  it("flattens modules into day ranges", () => {
    const plan = planSyllabus(course(), "t");
    expect(plan.modules).toEqual([
      { number: 1, title: "M1", dayFrom: 1, dayTo: 2 },
      { number: 2, title: "M2", dayFrom: 3, dayTo: 3 },
    ]);
    expect(plan.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });

  it("rejects a slug mismatch, bad default track, gaps and a wrong totalDays", () => {
    expect(() => planSyllabus(course({ slug: "other" }), "t")).toThrow(/does not match URL slug/);
    expect(() => planSyllabus(course({ defaultTrack: "zzz" }), "t")).toThrow(/defaultTrack/);
    expect(() => planSyllabus(course({ totalDays: 4 }), "t")).toThrow(/each day 1..4/);
    const gap = course({
      totalDays: 3,
      modules: [{ number: 1, title: "M", days: [{ day: 1, title: "a" }, { day: 3, title: "c" }] }],
    });
    expect(() => planSyllabus(gap, "t")).toThrow(/consecutive/);
  });

  it("throws IngestError with status 422", () => {
    try {
      planSyllabus(course({ defaultTrack: "zzz" }), "t");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IngestError);
      expect((e as IngestError).status).toBe(422);
    }
  });
});

describe("prepareLesson", () => {
  it("accepts a valid lesson", () => {
    expect(prepareLesson(lesson(), 1, ctx)).toHaveLength(5);
  });

  it("rejects a track with fewer than 5 questions", () => {
    // 4 shared + 1 for "a" only: track b has 4
    const quiz = [...Array.from({ length: 4 }, () => mcq()), mcq(["a"])];
    expect(() => prepareLesson(lesson({ quiz: quiz.map((q) => questionSchema.parse(q)) }), 1, ctx)).toThrow(
      /track "b" has 4 questions, needs at least 5/,
    );
  });

  it("rejects content keys and question tracks that aren't course tracks", () => {
    expect(() => prepareLesson(lesson({ content: { a: "x", wsl: "y" } }), 1, ctx)).toThrow(/content: "wsl" is not a track/);
    const quiz = [...Array.from({ length: 5 }, () => mcq()), mcq(["c"])].map((q) => questionSchema.parse(q));
    expect(() => prepareLesson(lesson({ quiz }), 1, ctx)).toThrow(/quiz\[5\]\.tracks: "c"/);
  });

  it("rejects a day/module mismatch and days outside the syllabus", () => {
    expect(() => prepareLesson(lesson(), 2, ctx)).toThrow(/does not match URL day/);
    expect(() => prepareLesson(lesson({ module: 2 }), 1, ctx)).toThrow(/belongs to module 1/);
    expect(() => prepareLesson(lesson({ day: 9 }), 9, { ...ctx, syllabusDay: null })).toThrow(/not in the course syllabus/);
  });
});

describe("appendSections", () => {
  it("appends per track with a rule, and creates missing tracks", () => {
    const out = appendSections({ a: "Lesson\n" }, { a: "## Doubts", b: "## Doubts B" }, ["a", "b"]);
    expect(out.a).toBe("Lesson\n\n---\n\n## Doubts\n");
    expect(out.b).toBe("## Doubts B\n");
  });
  it("rejects unknown tracks", () => {
    expect(() => appendSections({}, { z: "x" }, ["a"])).toThrow(IngestError);
  });
});

describe("reference seed for linux", () => {
  const c = courseSchema.parse(json("course.json"));
  const plan = planSyllabus(c, "linux");
  const trackKeys = c.tracks.map((t) => t.key);

  it("has a valid 66-day syllabus", () => {
    expect(plan.days).toHaveLength(66);
    expect(plan.modules).toHaveLength(10);
  });

  for (const f of readdirSync(SEED).filter((x) => x.startsWith("day-"))) {
    it(`${f} passes lesson validation`, () => {
      const body = lessonSchema.parse(json(f));
      const syllabusDay = plan.days.find((d) => d.day === body.day) ?? null;
      expect(() => prepareLesson(body, body.day, { trackKeys, syllabusDay })).not.toThrow();
    });
  }

  it("module-1.json passes module test validation", () => {
    expect(moduleTestSchema.parse(json("module-1.json")).quiz.length).toBeGreaterThanOrEqual(10);
  });
});
