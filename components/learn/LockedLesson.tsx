import Link from "next/link";
import { pad } from "@/lib/content/outline";
import { describeLockedDay } from "@/lib/learning/format";
import type { LearnerView } from "@/lib/learning/learner";
import { unlocksOn } from "@/lib/learning/unlock";

/** Shown instead of lesson content when the viewer can't open a published day. Content never reaches the page. */
export function LockedLesson({ slug, day, learner }: { slug: string; day: number; learner: LearnerView }) {
  if (learner.unlock) {
    return (
      <div className="lockbox">
        <div className="t">{describeLockedDay(unlocksOn(learner.unlock, day), learner.today)}</div>
        <p className="prose-p">
          You&apos;re on daily pace: one new lesson opens each day at midnight your time. Want to go faster? Switch to
          self-paced in course settings.
        </p>
        <Link className="btn ghost" href={`/courses/${slug}#enroll`}>
          Course settings
        </Link>
      </div>
    );
  }
  const signIn = `/signin?callbackUrl=${encodeURIComponent(`/courses/${slug}`)}`;
  return (
    <div className="lockbox">
      <div className="t">Enroll to read Day {pad(day)}</div>
      <p className="prose-p">Day 01 is a free preview. Enroll to unlock the rest of the course, take the quizzes and track your progress.</p>
      <Link className="btn" href={learner.viewer ? `/courses/${slug}#enroll` : signIn}>
        {learner.viewer ? "Enroll" : "Sign in to enroll"}
      </Link>
    </div>
  );
}
