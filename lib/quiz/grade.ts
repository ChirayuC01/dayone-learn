// Quiz grading, ported from reference/prototype.html. Pure; runs on the server only.

export type QuestionKind = "MCQ" | "CMD" | "TEXT_EXACT";

/** A question as stored, including the answer. Never sent to the browser before grading. */
export type GradableQuestion = {
  id: string;
  kind: QuestionKind;
  options: string[];
  answerIndex: number | null;
  accept: string[];
  caseSensitive: boolean;
  explain: string;
};

/** What the learner submitted: an option index for MCQ, typed text otherwise, null if skipped. */
export type GivenAnswer = number | string | null;

export type QuestionResult = {
  questionId: string;
  correct: boolean;
  given: GivenAnswer;
  /** The answer to show when wrong: the option index for MCQ, accept[0] otherwise. */
  answer: number | string;
  explain: string;
  /** True when only letter case was wrong (shown as the course's caseMissMessage). */
  caseMiss: boolean;
  /** True when nothing was answered. */
  skipped: boolean;
};

/**
 * Normalises typed answers: trim, strip a leading "$ " (CMD only), strip trailing ";",
 * collapse runs of whitespace. Case is handled by the caller.
 */
export function normalizeAnswer(raw: string, kind: QuestionKind): string {
  let s = raw.trim();
  if (kind === "CMD") s = s.replace(/^\$\s+/, "");
  return s
    .replace(/;+\s*$/, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function gradeQuestion(q: GradableQuestion, given: GivenAnswer): QuestionResult {
  const base = { questionId: q.id, given, explain: q.explain, caseMiss: false };

  if (q.kind === "MCQ") {
    const picked = typeof given === "number" && Number.isInteger(given) ? given : null;
    return { ...base, correct: picked !== null && picked === q.answerIndex, answer: q.answerIndex ?? -1, skipped: picked === null };
  }

  const text = typeof given === "string" ? normalizeAnswer(given, q.kind) : "";
  const accepted = q.accept.map((a) => normalizeAnswer(a, q.kind));
  const fold = (s: string) => s.toLowerCase();
  const correct = text !== "" && (q.caseSensitive ? accepted.includes(text) : accepted.map(fold).includes(fold(text)));
  const caseMiss = !correct && text !== "" && q.caseSensitive && accepted.map(fold).includes(fold(text));
  return { ...base, correct, caseMiss, answer: q.accept[0] ?? "", skipped: text === "" };
}

export type QuizGrade = { score: number; total: number; results: QuestionResult[] };

/** Grades every question in order. Answers for questions not in the quiz are ignored. */
export function gradeQuiz(questions: GradableQuestion[], answers: ReadonlyMap<string, GivenAnswer>): QuizGrade {
  const results = questions.map((q) => gradeQuestion(q, answers.get(q.id) ?? null));
  return { score: results.filter((r) => r.correct).length, total: questions.length, results };
}

export const percent = (score: number, total: number) => (total ? Math.round((100 * score) / total) : 0);

/** The prototype's score colours: ≥ 80 % ok, ≥ 50 % mid, else bad. */
export const scoreTone = (score: number, total: number) => {
  const p = percent(score, total);
  return p >= 80 ? "ok" : p >= 50 ? "mid" : "bad";
};
