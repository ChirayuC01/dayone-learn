"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useCelebrate } from "@/components/gamify/Celebrate";
import { RewardsLine } from "@/components/gamify/RewardsLine";
import { InlineCode } from "@/components/InlineCode";
import type { AttemptResult, PublicQuestion, Scope } from "@/lib/quiz/service";
import type { ReviewQuestion, ReviewResult } from "@/lib/review/service";

type Props = {
  /** REVIEW: a spaced-repetition session; questions carry their course and box. */
  scope: Scope | "REVIEW";
  refId: string;
  title: string;
  subtitle: string;
  questions: (PublicQuestion | ReviewQuestion)[];
  best: { score: number; total: number } | null;
  /** Module tests: the pass mark as a ratio. */
  passRatio?: number;
};

const KEYS = "ABCDEF";
const pct = (s: number, t: number) => (t ? Math.round((100 * s) / t) : 0);
const tone = (p: number) => (p >= 80 ? "var(--ok)" : p >= 50 ? "var(--accent)" : "var(--bad)");

type Result = AttemptResult | ReviewResult;
type ResultRow = Result["results"][number] & { box?: ReviewResult["results"][number]["box"] };

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
function boxNote(box: NonNullable<ResultRow["box"]>) {
  const when = dayFmt.format(new Date(box.dueAt));
  return box.to > box.from ? `Box ${box.from} → ${box.to}. Next review ${when}.` : `Back to box 1. Next review ${when}.`;
}

async function submit({ endpoint, body }: { endpoint: string; body: unknown }): Promise<Result> {
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Couldn't check your answers. Try again.");
  return json as Result;
}

export function Quiz({ scope, refId, title, subtitle, questions, best: initialBest, passRatio }: Props) {
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const review = scope === "REVIEW";
  const [best, setBest] = useState(initialBest);
  const celebrate = useCelebrate();

  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: (r) => {
      setResult(r);
      if ("best" in r) setBest({ score: r.best.score, total: r.best.total });
      celebrate(r.rewards);
      if (!review) router.refresh(); // sidebar score chips are server-rendered; review waits for "Next"
    },
  });

  const byId = new Map<string, ResultRow>(result?.results.map((r) => [r.questionId, r]));
  const graded = result !== null;

  function check() {
    const answers = questions.map((q) => ({ questionId: q.id, value: q.kind === "MCQ" ? (picks[q.id] ?? null) : (texts[q.id] ?? "") }));
    mutation.mutate(review ? { endpoint: "/api/review", body: { answers } } : { endpoint: "/api/attempts", body: { scope, refId, answers } });
  }

  function reset() {
    setPicks({});
    setTexts({});
    setResult(null);
    mutation.reset();
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(".q input, .q .opt")?.focus());
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = [...(root.current?.querySelectorAll<HTMLInputElement>(".term input") ?? [])];
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    (next ?? root.current?.querySelector<HTMLButtonElement>('[data-act="check"]'))?.focus();
  }

  if (!questions.length) {
    return (
      <section className="quiz" id="quiz">
        <div className="quiz-h">
          <h2>{title}</h2>
          <p>Questions for this lesson haven&apos;t been added yet.</p>
        </div>
      </section>
    );
  }

  const p = result ? pct(result.score, result.total) : 0;

  return (
    <section className="quiz" id="quiz" ref={root} aria-labelledby={`${refId}-h`}>
      <div className="quiz-h">
        <h2 id={`${refId}-h`}>{title}</h2>
        <p>
          {subtitle} · {questions.length} questions
          {best ? ` · best ${best.score}/${best.total}` : ""}
        </p>
      </div>

      {questions.map((q, i) => {
        const r = byId.get(q.id);
        const qid = `${refId}-q${i}`;
        return (
          <div className="q" key={q.id}>
            <div className="q-num">
              Q{i + 1} · {q.kind === "MCQ" ? "choose one" : q.kind === "CMD" ? "type the command" : "type the answer"}
              {"course" in q && (
                <>
                  {" · "}
                  <span className="q-course">{q.course.title}</span> · box {q.box}
                </>
              )}
            </div>
            <p className="q-text" id={`${qid}-t`}>
              <InlineCode text={q.prompt} />
            </p>

            {q.kind === "MCQ" ? (
              <div className="opts" role="group" aria-labelledby={`${qid}-t`}>
                {q.options.map((o, j) => {
                  const cls = r ? (j === r.answer ? " right" : j === picks[q.id] ? " wrong" : "") : "";
                  return (
                    <button
                      key={j}
                      type="button"
                      className={`opt${cls}`}
                      aria-pressed={picks[q.id] === j}
                      disabled={graded}
                      onClick={() => setPicks((s) => ({ ...s, [q.id]: j }))}
                    >
                      <span className="k">{KEYS[j]}</span>
                      <span>
                        <InlineCode text={o} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <label className={`term${r ? (r.correct ? " right" : " wrong") : ""}`} htmlFor={qid}>
                <span aria-hidden="true">{q.kind === "CMD" ? "$" : "›"}</span>
                <input
                  id={qid}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-labelledby={`${qid}-t`}
                  value={texts[q.id] ?? ""}
                  readOnly={graded}
                  onChange={(e) => setTexts((s) => ({ ...s, [q.id]: e.target.value }))}
                  onKeyDown={onEnter}
                />
              </label>
            )}

            {r && (
              <div className="fb" role="status">
                <b className={r.correct ? "ok" : "bad"}>{r.correct ? "Correct." : r.skipped ? "No answer given." : "Not quite."}</b>
                {r.caseMissMessage && <> {r.caseMissMessage}</>}{" "}
                {!r.correct && q.kind !== "MCQ" && (
                  <>
                    Answer: <code>{String(r.answer)}</code>.{" "}
                  </>
                )}
                <InlineCode text={r.explain} />
                {r.box && <span className="note"> {boxNote(r.box)}</span>}
              </div>
            )}
          </div>
        );
      })}

      {result && <RewardsLine r={result.rewards} />}
      <div className="quiz-f">
        <span className="note" role={mutation.isError ? "alert" : undefined} style={mutation.isError ? { color: "var(--bad)" } : undefined}>
          {mutation.isError
            ? mutation.error.message
            : result && "fullSession" in result
              ? result.fullSession
                ? result.rewards.xp > 0
                  ? "Session complete."
                  : "Session complete. Review XP is capped at 4 sessions a day."
                : "Short session: full sessions of 5 questions earn XP."
              : result && "passed" in result && result.passed !== undefined
              ? result.passed
                ? result.firstPass
                  ? "Passed! Module complete."
                  : "Passed."
                : `You need ${Math.round((passRatio ?? 0.7) * 100)}% to pass. Retake it any time.`
              : review
                ? "Correct answers move up a box; misses come back tomorrow."
                : "Your best score is saved to your progress."}
        </span>
        <span className="result" aria-live="polite" style={result ? { color: tone(p) } : undefined}>
          {result ? `${result.score}/${result.total} · ${p}%` : ""}
        </span>
        <div className="row" style={{ gap: 8 }}>
          {graded && review ? (
            <button className="btn" type="button" data-act="next" onClick={() => router.refresh()}>
              Next
            </button>
          ) : graded ? (
            <button className="btn ghost" type="button" data-act="reset" onClick={reset}>
              Try again
            </button>
          ) : (
            <button className="btn" type="button" data-act="check" onClick={check} disabled={mutation.isPending}>
              {mutation.isPending ? "Checking…" : "Check answers"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
