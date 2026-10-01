import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pad } from "@/lib/content/outline";
import { getCourseOutline } from "@/lib/content/queries";
import { accentStyle } from "@/lib/content/theme";
import { db } from "@/lib/db";
import { canRead, continueDay } from "@/lib/learning/access";
import { describeNextUnlock } from "@/lib/learning/format";
import { getReadDays, getViewer, learnerView } from "@/lib/learning/learner";

export const metadata: Metadata = { title: "Dashboard" };

// Phase 3: "Continue" cards. Phase 5 adds the goal ring, streak, review, league and achievements.
export default async function Dashboard() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=/dashboard");

  const enrollments = await db.enrollment.findMany({
    where: { userId: viewer.id, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { course: { select: { slug: true } } },
  });
  const cards = (
    await Promise.all(
      enrollments.map(async ({ course: { slug } }) => {
        const course = await getCourseOutline(slug);
        if (!course) return null;
        const learner = await learnerView(course);
        const read = await getReadDays(viewer.id, course.id);
        const open = learner.published.filter((d) => canRead(learner.access(d)));
        const day = continueDay(open, read);
        const lesson = course.lessons.find((l) => l.day === day);
        const title = lesson ? ((lesson.trackTitles as Record<string, string> | null)?.[learner.track] ?? lesson.title) : null;
        return { course, learner, day, title, readCount: read.size };
      }),
    )
  ).filter((c) => c !== null);

  return (
    <div className="col">
      <div className="eyebrow">
        <span>Signed in as {viewer.displayName ?? viewer.email}</span>
      </div>
      <h1 className="h1">Your courses</h1>
      {cards.length === 0 ? (
        <div className="empty">
          You haven&apos;t enrolled in a course yet. <Link href="/courses">Browse courses</Link>
        </div>
      ) : (
        cards.map(({ course, learner, day, title, readCount }) => (
          <div key={course.slug} className="next course-theme" style={{ ...accentStyle(course.accent), marginBottom: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">
                <span>{course.title}</span>
                {day && <span>Day {pad(day)}</span>}
              </div>
              <div className="t">{title ?? "No lessons yet"}</div>
              <div className="s">
                {readCount}/{course.totalDays} read
                {learner.next ? ` · ${describeNextUnlock(learner.next, learner.today, learner.tz)}` : ""}
              </div>
            </div>
            {day && (
              <Link className="btn" href={`/learn/${course.slug}/day/${pad(day)}`}>
                Continue
              </Link>
            )}
          </div>
        ))
      )}
      <p className="note" style={{ marginTop: 24 }}>
        <Link href="/courses">Browse all courses</Link>
      </p>
    </div>
  );
}
