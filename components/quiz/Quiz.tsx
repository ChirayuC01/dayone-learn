"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useCelebrate } from "@/components/gamify/Celebrate";
import { RewardsLine } from "@/components/gamify/RewardsLine";
import { InlineCode } from "@/components/InlineCode";
import type { AttemptResult, PublicQuestion, Scope } from "@/lib/quiz/service";

type Props = {
  scope: Scope;
  refId: string;
  title: string;
  subtitle: string;
  questions: PublicQuestion[];
  best: { score: number; total: number } | null;
  /** Module tests: the pass mark as a ratio. */
  passRatio?: number;
};

const KEYS = "ABCDEF";
const pct = (s: number, t: number) => (t ? Math.round((100 * s) / t) : 0);
const tone = (p: number) => (p >= 80 ? "var(--ok)" : p >= 50 ? "var(--accent)" : "var(--bad)");

async function submit(body: unknown): Promise<AttemptResult> {
  const res = await fetch("/api/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Couldn't check your answers. Try again.");
  return json as AttemptResult;
}

export function Quiz({ scope, refId, title, subtitle, questions, best: initialBest, passRatio }: Props) {
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [best, setBest] = useState(initialBest);
  const celebrate = useCelebrate();

  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: (r) => {
      setResult(r);
      setBest({ score: r.best.score, total: r.best.total });
      celebrate(r.rewards);
      router.refresh(); // sidebar score chips are server-rendered
    },
  });

  const byId = new Map(result?.results.map((r) => [r.questionId, r]));
  const graded = result !== null;

  function check() {
    mutation.mutate({
      scope,
      refId,
      answers: questions.map((q) => ({ questionId: q.id, value: q.kind === "MCQ" ? (picks[q.id] ?? null) : (texts[q.id] ?? "") })),
    });
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
            : result?.passed !== undefined
              ? result.passed
                ? result.firstPass
                  ? "Passed! Module complete."
                  : "Passed."
                : `You need ${Math.round((passRatio ?? 0.7) * 100)}% to pass. Retake it any time.`
              : "Your best score is saved to your progress."}
        </span>
        <span className="result" aria-live="polite" style={result ? { color: tone(p) } : undefined}>
          {result ? `${result.score}/${result.total} · ${p}%` : ""}
        </span>
        <div className="row" style={{ gap: 8 }}>
          {graded ? (
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
