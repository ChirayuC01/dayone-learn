import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "../ingest/normalize.ts";
import { questionSchema } from "../ingest/schema.ts";
import { gradeQuestion, gradeQuiz, normalizeAnswer, percent, scoreTone, type GradableQuestion } from "./grade.ts";
import { applyAttempt, MODULE_PASS_RATIO } from "./progress.ts";

const cmd = (accept: string[], caseSensitive = true): GradableQuestion => ({
  id: "c",
  kind: "CMD",
  options: [],
  answerIndex: null,
  accept,
  caseSensitive,
  explain: "why",
});
const text = (accept: string[], caseSensitive = true): GradableQuestion => ({ ...cmd(accept, caseSensitive), id: "t", kind: "TEXT_EXACT" });
const mcq: GradableQuestion = { id: "m", kind: "MCQ", options: ["a", "b", "c"], answerIndex: 2, accept: [], caseSensitive: true, explain: "" };

describe("normalizeAnswer", () => {
  it("trims, collapses whitespace and strips trailing semicolons", () => {
    expect(normalizeAnswer("  mkdir   -p   a/b  ", "CMD")).toBe("mkdir -p a/b");
    expect(normalizeAnswer("ls -la;", "CMD")).toBe("ls -la");
    expect(normalizeAnswer("ls -la ;;  ", "CMD")).toBe("ls -la");
    expect(normalizeAnswer("ls\t-la\n", "CMD")).toBe("ls -la");
  });

  it('strips a leading "$ " for commands only', () => {
    expect(normalizeAnswer("$ pwd", "CMD")).toBe("pwd");
    expect(normalizeAnswer("$   pwd", "CMD")).toBe("pwd");
    expect(normalizeAnswer("$ pwd", "TEXT_EXACT")).toBe("$ pwd");
  });

  it('keeps a "$" that is part of the answer', () => {
    expect(normalizeAnswer("$HOME", "CMD")).toBe("$HOME");
    expect(normalizeAnswer("echo $PATH;", "CMD")).toBe("echo $PATH");
  });
});

describe("gradeQuestion", () => {
  it("grades MCQ by index and reports the right option", () => {
    expect(gradeQuestion(mcq, 2)).toMatchObject({ correct: true, answer: 2, skipped: false });
    expect(gradeQuestion(mcq, 1)).toMatchObject({ correct: false, answer: 2 });
    expect(gradeQuestion(mcq, null)).toMatchObject({ correct: false, skipped: true });
    expect(gradeQuestion(mcq, "2")).toMatchObject({ correct: false, skipped: true }); // wrong type
    expect(gradeQuestion(mcq, 2.5)).toMatchObject({ correct: false, skipped: true });
  });

  it("accepts any listed form of a command", () => {
    const q = cmd(["mkdir -p app/src/utils", "mkdir --parents app/src/utils"]);
    expect(gradeQuestion(q, "mkdir --parents app/src/utils").correct).toBe(true);
    expect(gradeQuestion(q, "$ mkdir  -p app/src/utils;").correct).toBe(true);
    expect(gradeQuestion(q, "mkdir app/src/utils")).toMatchObject({ correct: false, answer: "mkdir -p app/src/utils", explain: "why" });
  });

  it("normalises the accept list too", () => {
    expect(gradeQuestion(cmd(["$ ls  -a"]), "ls -a").correct).toBe(true);
  });

  it("is case-sensitive by default and flags a case-only miss", () => {
    const q = cmd(["cd ~/Documents"]);
    expect(gradeQuestion(q, "cd ~/documents")).toMatchObject({ correct: false, caseMiss: true });
    expect(gradeQuestion(q, "cd ~/docs")).toMatchObject({ correct: false, caseMiss: false });
  });

  it("ignores case when caseSensitive is false, with no case-miss flag", () => {
    expect(gradeQuestion(text(["Kernel"], false), "kernel")).toMatchObject({ correct: true, caseMiss: false });
    expect(gradeQuestion(text(["Kernel"]), "kernel")).toMatchObject({ correct: false, caseMiss: true });
  });

  it("treats empty input as skipped, never correct", () => {
    expect(gradeQuestion(cmd(["ls"]), "   ")).toMatchObject({ correct: false, skipped: true, caseMiss: false });
    expect(gradeQuestion(cmd(["ls"]), null)).toMatchObject({ correct: false, skipped: true });
    expect(gradeQuestion(cmd(["ls"]), 3)).toMatchObject({ correct: false, skipped: true });
  });
});

describe("gradeQuiz", () => {
  it("scores in question order and ignores unknown answers", () => {
    const g = gradeQuiz([mcq, cmd(["pwd"])], new Map<string, number | string>([["m", 2], ["c", "pwd"], ["zzz", "x"]]));
    expect(g).toMatchObject({ score: 2, total: 2 });
    expect(g.results.map((r) => r.questionId)).toEqual(["m", "c"]);
  });

  it("computes percentages and tones like the prototype", () => {
    expect(percent(5, 6)).toBe(83);
    expect(scoreTone(5, 6)).toBe("ok");
    expect(scoreTone(3, 6)).toBe("mid");
    expect(scoreTone(2, 6)).toBe("bad");
    expect(percent(0, 0)).toBe(0);
  });
});

describe("Linux seed questions", () => {
  const dir = join(import.meta.dirname, "..", "..", "reference", "seed", "linux");
  const all = readdirSync(dir)
    .filter((f) => /^(day|module)-/.test(f))
    .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), "utf8")) as { quiz: unknown[] }).quiz.map((q, i) => ({ f, i, q })));

  it("every typed question accepts each of its own accept forms, with or without a $ prompt", () => {
    for (const { f, i, q } of all) {
      const n = normalizeQuestion(questionSchema.parse(q), i);
      if (n.kind === "MCQ") continue;
      const g: GradableQuestion = { ...n, id: `${f}#${i}` };
      for (const a of n.accept) {
        expect(gradeQuestion(g, a).correct, `${f} q${i}: ${a}`).toBe(true);
        if (n.kind === "CMD") expect(gradeQuestion(g, `$ ${a}`).correct, `${f} q${i}: $ ${a}`).toBe(true);
      }
    }
  });

  it("every MCQ is answerable", () => {
    for (const { f, i, q } of all) {
      const n = normalizeQuestion(questionSchema.parse(q), i);
      if (n.kind !== "MCQ") continue;
      expect(gradeQuestion({ ...n, id: "x" }, n.answerIndex).correct, `${f} q${i}`).toBe(true);
    }
  });
});

describe("applyAttempt", () => {
  const at = new Date("2026-10-01T10:00:00Z");
  const later = new Date("2026-10-02T10:00:00Z");

  it("starts a record and counts attempts", () => {
    const r = applyAttempt(null, { score: 4, total: 6, at });
    expect(r).toMatchObject({ bestScore: 4, total: 6, attempts: 1, firstPerfectAt: null, improved: true, firstPerfect: false });
    expect(r).not.toHaveProperty("passedAt");
  });

  it("keeps the best score and the first perfect time", () => {
    const one = applyAttempt(null, { score: 6, total: 6, at });
    expect(one).toMatchObject({ firstPerfectAt: at, firstPerfect: true });
    const two = applyAttempt(one, { score: 3, total: 6, at: later });
    expect(two).toMatchObject({ bestScore: 6, attempts: 2, firstPerfectAt: at, improved: false, firstPerfect: false });
  });

  it("compares by ratio when a quiz changes length", () => {
    const prev = { bestScore: 5, total: 6, attempts: 1, firstPerfectAt: null };
    expect(applyAttempt(prev, { score: 4, total: 5, at })).toMatchObject({ bestScore: 5, total: 6, improved: false }); // 80% < 83%
    expect(applyAttempt(prev, { score: 6, total: 7, at })).toMatchObject({ bestScore: 6, total: 7, improved: true }); // 86%
  });

  it("passes a module test at 70% once", () => {
    const fail = applyAttempt(null, { score: 8, total: 12, at }, MODULE_PASS_RATIO); // 67%
    expect(fail).toMatchObject({ passedAt: null, firstPass: false });
    const pass = applyAttempt(fail, { score: 9, total: 12, at: later }, MODULE_PASS_RATIO); // 75%
    expect(pass).toMatchObject({ passedAt: later, firstPass: true });
    expect(applyAttempt(pass, { score: 12, total: 12, at }, MODULE_PASS_RATIO)).toMatchObject({ passedAt: later, firstPass: false });
  });
});
