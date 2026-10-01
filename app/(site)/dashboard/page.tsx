import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setDailyGoal } from "@/app/actions/goal";
import { Heatmap } from "@/components/gamify/Heatmap";
import { Ring } from "@/components/gamify/Ring";
import { pad } from "@/lib/content/outline";
import { getCourseOutline } from "@/lib/content/queries";
import { accentStyle } from "@/lib/content/theme";
import { db } from "@/lib/db";
import { courseProgress, getHookLoop } from "@/lib/gamification/dashboard";
import { GOAL_OPTIONS } from "@/lib/gamification/goal";
import { canRead, continueDay } from "@/lib/learning/access";
import { describeNextUnlock } from "@/lib/learning/format";
import { getReadDays, getViewer, learnerView } from "@/lib/learning/learner";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=/dashboard");
  const loop = await getHookLoop(viewer.id, viewer.timezone);

  const enrollments = await db.enrollment.findMany({
    where: { userId: viewer.id, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { completedAt: true, course: { select: { slug: true } } },
  });
  const cards = (
    await Promise.all(
      enrollments.map(async ({ course: { slug }, completedAt }) => {
        const course = await getCourseOutline(slug);
        if (!course) return null;
        const learner = await learnerView(course);
        const read = await getReadDays(viewer.id, course.id);
        const open = learner.published.filter((d) => canRead(learner.access(d)));
        const day = continueDay(open, read);
        const lesson = course.lessons.find((l) => l.day === day);
        const title = lesson ? ((lesson.trackTitles as Record<string, string> | null)?.[learner.track] ?? lesson.title) : null;
        return { course, learner, day, title, done: read.has(day ?? -1), completedAt, progress: await courseProgress(viewer.id, course.id) };
      }),
    )
  ).filter((c) => c !== null);
  const allCourses = await db.course.findMany({ select: { id: true, title: true, accent: true } });
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));

  const { goal, streak, level } = loop;
  const goalLeft = Math.max(0, goal.target - goal.xpToday);

  return (
    <div className="col-wide">
      <div className="eyebrow">
        <span>{viewer.displayName ?? viewer.email}</span>
        <span>
          Level <b>{level.level}</b>
        </span>
        <span>{level.xp} XP total</span>
      </div>
      <h1 className="h1">Today</h1>

      <div className="hook">
        <section className="hook-card" aria-labelledby="goal-h">
          <Ring value={goal.xpToday / goal.target}>
            <b>{goal.xpToday}</b>
            <small>/{goal.target}</small>
          </Ring>
          <div>
            <h2 id="goal-h">Daily goal</h2>
            <p>{goalLeft ? `${goalLeft} XP to go today.` : "Goal hit. Nice work!"}</p>
            <details>
              <summary className="note">Change goal</summary>
              <form action={setDailyGoal} className="row" style={{ gap: 6, marginTop: 8 }}>
                {GOAL_OPTIONS.map((g) => (
                  <button key={g} name="target" value={g} className={`chip${g === goal.target ? " new" : ""}`} type="submit" aria-pressed={g === goal.target}>
                    {g} XP
                  </button>
                ))}
              </form>
            </details>
          </div>
        </section>

        <section className="hook-card" aria-labelledby="streak-h">
          <span className={`flame${streak.activeToday ? " lit" : ""}`} aria-hidden="true">
            🔥
          </span>
          <div>
            <h2 id="streak-h">
              {streak.current} day{streak.current === 1 ? "" : "s"}
            </h2>
            <p>
              {streak.activeToday
                ? "Streak safe for today."
                : streak.current
                  ? streak.freezesNeeded
                    ? `A freeze will cover ${streak.freezesNeeded} missed day${streak.freezesNeeded > 1 ? "s" : ""} when you learn today.`
                    : "Learn today to keep your streak."
                  : "Learn today to start a streak."}
            </p>
            <p className="note">
              {"❄".repeat(streak.freezes) || "No"} freeze{streak.freezes === 1 ? "" : "s"} · best {streak.longest}
            </p>
          </div>
        </section>

        <section className="hook-card" aria-labelledby="level-h">
          <Ring value={level.progress}>
            <b>{level.level}</b>
            <small>level</small>
          </Ring>
          <div>
            <h2 id="level-h">Level {level.level}</h2>
            <p>
              {level.toNext} XP to level {level.level + 1}.
            </p>
            <p className="note">{level.xp} XP total</p>
          </div>
        </section>
      </div>

      {loop.reviewDue > 0 && (
        <p>
          <Link className="chip new review-chip" href="/review">
            Review {loop.reviewDue} due
          </Link>
        </p>
      )}

      <h2 className="sec-h">Continue</h2>
      {cards.length === 0 ? (
        <div className="empty">
          You haven&apos;t enrolled in a course yet. <Link href="/courses">Browse courses</Link>
        </div>
      ) : (
        cards.map(({ course, learner, day, title, done, completedAt, progress }) => (
          <div key={course.slug} className="next course-theme" style={{ ...accentStyle(course.accent), marginBottom: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">
                <span>{course.title}</span>
                {day && <span>Day {pad(day)}</span>}
                {completedAt && <span>🎓 Completed</span>}
              </div>
              <div className="t">{title ?? "No lessons yet"}</div>
              <div className="s">
                {progress.read}/{learner.published.length} read
                {progress.avgBest !== null && ` · avg best ${progress.avgBest}%`}
                {progress.modulesWithTests > 0 && ` · module tests ${progress.modulesPassed}/${progress.modulesWithTests}`}
              </div>
              {learner.next && done && <div className="s">{describeNextUnlock(learner.next, learner.today, learner.tz)}</div>}
            </div>
            {day && (
              <Link className={done ? "btn ghost" : "btn"} href={`/learn/${course.slug}/day/${pad(day)}`}>
                {done ? "Review lesson" : "Continue"}
              </Link>
            )}
          </div>
        ))
      )}

      <h2 className="sec-h">Achievements</h2>
      {loop.achievements.count === 0 ? (
        <div className="empty">Finish your first lesson to unlock your first achievement.</div>
      ) : (
        <>
          <div className="trophies">
            {loop.achievements.recent.map((a) => (
              <div key={a.key} className={`trophy ${a.tier.toLowerCase()}`} title={a.description}>
                <span aria-hidden="true">{a.icon}</span>
                <b>{a.title}</b>
              </div>
            ))}
          </div>
          <p className="note">{loop.achievements.count} unlocked so far.</p>
        </>
      )}

      <h2 className="sec-h">Activity</h2>
      <Heatmap weeks={loop.heatmap} courses={courseMap} />
    </div>
  );
}
