import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ring } from "@/components/gamify/Ring";
import { accentStyle } from "@/lib/content/theme";
import { db } from "@/lib/db";
import { levelInfo } from "@/lib/gamification/levels";
import { streakToday } from "@/lib/gamification/streak";
import { getViewer } from "@/lib/learning/learner";
import { fromDateColumn, localDate } from "@/lib/time/zoned";

type Props = { params: Promise<{ displayName: string }> };

async function load(displayName: string) {
  const user = await db.user.findUnique({
    where: { displayName: displayName.toLowerCase() },
    select: { id: true, displayName: true, profilePublic: true, leagueTier: true, timezone: true, createdAt: true, streak: true },
  });
  if (!user) return null;
  const viewer = await getViewer();
  // Private profiles are visible only to their owner.
  if (!user.profilePublic && viewer?.id !== user.id) return null;
  return { user, isOwner: viewer?.id === user.id };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).displayName);
  return p ? { title: p.user.displayName ?? "Profile" } : {};
}

export default async function Profile({ params }: Props) {
  const p = await load((await params).displayName);
  if (!p) notFound();
  const { user, isOwner } = p;
  const [xp, catalogue, unlocked, enrollments] = await Promise.all([
    db.xpEvent.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
    db.achievement.findMany({ orderBy: { sortOrder: "asc" } }),
    db.userAchievement.findMany({ where: { userId: user.id } }),
    db.enrollment.findMany({
      where: { userId: user.id, OR: [{ archivedAt: null }, { completedAt: { not: null } }] },
      include: { course: { select: { slug: true, title: true, icon: true, accent: true, totalDays: true } } },
    }),
  ]);
  const level = levelInfo(xp._sum.amount ?? 0);
  const today = localDate(new Date(), user.timezone);
  const streak = user.streak
    ? streakToday({ ...user.streak, lastActiveDate: user.streak.lastActiveDate ? fromDateColumn(user.streak.lastActiveDate) : null }, today)
    : { current: 0 };
  const got = new Map(unlocked.map((u) => [u.key, u.unlockedAt]));
  const reads = await db.lessonProgress.groupBy({ by: ["courseId"], where: { userId: user.id, readAt: { not: null } }, _count: true });
  const readBy = new Map(reads.map((r) => [r.courseId, r._count]));

  return (
    <div className="col">
      <div className="eyebrow">
        <span>Profile</span>
        <span>{user.profilePublic ? "Public" : "Private (only you can see this)"}</span>
        {isOwner && <Link href="/settings">Edit</Link>}
      </div>
      <h1 className="h1">{user.displayName}</h1>

      <div className="hook">
        <section className="hook-card">
          <Ring value={level.progress}>
            <b>{level.level}</b>
            <small>level</small>
          </Ring>
          <div>
            <h2>Level {level.level}</h2>
            <p>{level.xp} XP total</p>
          </div>
        </section>
        <section className="hook-card">
          <span className={`flame${streak.current ? " lit" : ""}`} aria-hidden="true">
            🔥
          </span>
          <div>
            <h2>
              {streak.current} day{streak.current === 1 ? "" : "s"}
            </h2>
            <p>Best streak {user.streak?.longest ?? 0}</p>
          </div>
        </section>
        <section className="hook-card">
          <span className="flame lit" aria-hidden="true">
            {user.leagueTier === "DIAMOND" ? "💎" : user.leagueTier === "SAPPHIRE" ? "🔷" : user.leagueTier === "GOLD" ? "🥇" : user.leagueTier === "SILVER" ? "🥈" : "🥉"}
          </span>
          <div>
            <h2>{user.leagueTier.charAt(0) + user.leagueTier.slice(1).toLowerCase()}</h2>
            <p>League tier</p>
          </div>
        </section>
      </div>

      <h2 className="sec-h">Courses</h2>
      {enrollments.length === 0 ? (
        <div className="empty">No courses yet.</div>
      ) : (
        <div className="trophies">
          {enrollments.map((e) => (
            <Link key={e.id} href={`/courses/${e.course.slug}`} className="trophy course-theme" style={accentStyle(e.course.accent)}>
              <span className="brand-mark" aria-hidden="true">
                {e.course.icon}
              </span>
              <span>
                <b>{e.course.title}</b>
                <small className="note" style={{ display: "block" }}>
                  {e.completedAt ? "🎓 Graduated" : `${readBy.get(e.courseId) ?? 0}/${e.course.totalDays} lessons`}
                </small>
              </span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="sec-h">Trophy case</h2>
      <p className="note">
        {got.size} of {catalogue.length} unlocked
      </p>
      <div className="trophies">
        {catalogue.map((a) => (
          <div key={a.key} className={`trophy ${a.tier.toLowerCase()}${got.has(a.key) ? "" : " locked"}`} title={a.description}>
            <span aria-hidden="true">{got.has(a.key) ? a.icon : "🔒"}</span>
            <span>
              <b>{a.title}</b>
              <small className="note" style={{ display: "block" }}>
                {a.description}
              </small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
