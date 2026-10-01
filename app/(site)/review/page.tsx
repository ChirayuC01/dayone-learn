import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Quiz } from "@/components/quiz/Quiz";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/learning/learner";
import { INTERVALS, SESSION_SIZE } from "@/lib/review/leitner";
import { nextSession, queueSummary } from "@/lib/review/service";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=/review");
  const { questions, due } = await nextSession(db, viewer.id);

  if (!questions.length) {
    const q = await queueSummary(db, viewer.id);
    const next = q.next
      ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: viewer.timezone }).format(q.next)
      : null;
    return (
      <div className="col">
        <div className="eyebrow">Spaced repetition</div>
        <h1 className="h1">Nothing to review</h1>
        <p className="prose-p">
          {q.total
            ? `You're all caught up. ${q.total} question${q.total === 1 ? " is" : "s are"} in your queue; the next one comes back ${next} (your time).`
            : "Questions you miss in quizzes and module tests come back here: tomorrow, then after 2, 4, 8 and 16 days as you get them right."}
        </p>
        {q.total > 0 && (
          <div className="boxes" aria-label="Questions per box">
            {q.perBox.map((n, i) => (
              <div key={i} className="stat">
                <div className="v">{n}</div>
                <div className="l">
                  Box {i + 1} · {INTERVALS[i]}d
                </div>
              </div>
            ))}
          </div>
        )}
        <p>
          <Link className="btn ghost" href="/dashboard">
            Back to dashboard
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="col">
      <div className="eyebrow">
        <span>Spaced repetition</span>
        <span>
          <b>{due}</b> due
        </span>
      </div>
      <h1 className="h1">Review</h1>
      <p className="prose-p">
        Questions you missed, mixed from your courses. Get one right and it moves up a box and comes back later; miss it and it
        returns tomorrow. A full session of {SESSION_SIZE} earns XP.
      </p>
      <Quiz
        key={questions.map((x) => x.id).join(",")}
        scope="REVIEW"
        refId="review"
        title="Review session"
        subtitle={`${due} due`}
        questions={questions}
        best={null}
      />
    </div>
  );
}
