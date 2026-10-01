import { setQuestionHidden } from "@/app/actions/admin";
import { InlineCode } from "@/components/InlineCode";

type Q = {
  id: string;
  order: number;
  kind: string;
  tracks: string[];
  prompt: string;
  options: string[];
  answerIndex: number | null;
  accept: string[];
  caseSensitive: boolean;
  explain: string;
  hidden: boolean;
};

/** Every question with its answer, plus a hide/unhide toggle (admin only). */
export function QuestionTable({ questions }: { questions: Q[] }) {
  if (!questions.length) return <div className="empty">No questions.</div>;
  return (
    <div className="tbl">
      <table className="lb">
        <thead>
          <tr>
            <th>#</th>
            <th>Question and answer</th>
            <th>Tracks</th>
            <th>Visible</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id} style={q.hidden ? { opacity: 0.55 } : undefined}>
              <td>{q.order + 1}</td>
              <td style={{ minWidth: 280 }}>
                <div className="note">{q.kind}</div>
                <b>
                  <InlineCode text={q.prompt} />
                </b>
                {q.kind === "MCQ" ? (
                  <ol type="A" style={{ margin: "6px 0", paddingLeft: 20, listStyle: "upper-alpha" }}>
                    {q.options.map((o, i) => (
                      <li key={i} style={i === q.answerIndex ? { color: "var(--ok)", fontWeight: 700 } : undefined}>
                        <InlineCode text={o} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div style={{ margin: "6px 0" }}>
                    Accepts{q.caseSensitive ? "" : " (any case)"}:{" "}
                    {q.accept.map((a, i) => (
                      <code key={i} style={{ marginRight: 6 }}>
                        {a}
                      </code>
                    ))}
                  </div>
                )}
                <div className="note">
                  <InlineCode text={q.explain} />
                </div>
              </td>
              <td>{q.tracks.length ? q.tracks.join(", ") : "all"}</td>
              <td>
                <form action={setQuestionHidden}>
                  <input type="hidden" name="questionId" value={q.id} />
                  <input type="hidden" name="hidden" value={String(!q.hidden)} />
                  <button className={`chip ${q.hidden ? "bad" : "ok"}`} type="submit" title={q.hidden ? "Show this question again" : "Hide from quizzes and review"}>
                    {q.hidden ? "hidden · show" : "shown · hide"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
