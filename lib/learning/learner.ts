// Per-request view of the signed-in learner in one course: enrollment, today's date in their zone,
// track, and what they can open. Server-only.
import { cache } from "react";
import { auth } from "@/auth";
import { resolveTrack } from "@/lib/content/outline";
import type { CourseOutline } from "@/lib/content/queries";
import { cookieTrack } from "@/lib/content/track";
import { db } from "@/lib/db";
import { localDate } from "@/lib/time/zoned";
import { dayAccess, moduleTestAccess } from "./access";
import { unlockStateOf } from "./enrollment";
import { nextUnlock } from "./unlock";

export const getViewer = cache(async () => (await auth())?.user ?? null);

export const getEnrollment = cache((userId: string, courseId: string) =>
  db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
);

export async function learnerView(course: CourseOutline) {
  const viewer = await getViewer();
  const tz = viewer?.timezone ?? "UTC";
  const now = new Date();
  const today = localDate(now, tz);
  const enrollment = viewer ? await getEnrollment(viewer.id, course.id) : null;
  const active = enrollment && !enrollment.archivedAt ? enrollment : null;
  const unlock = active ? unlockStateOf(active) : null;
  const published = course.lessons.map((l) => l.day);
  const track = active
    ? resolveTrack(course.tracks, course.defaultTrack, active.track)
    : await cookieTrack(course);

  return {
    viewer,
    enrollment,
    active,
    unlock,
    today,
    tz,
    published,
    track,
    access: (day: number) => dayAccess(day, published, unlock, today),
    moduleAccess: (mod: { dayTo: number; testQuestions: number }) => moduleTestAccess(mod, published, unlock, today),
    next: unlock
      ? nextUnlock(unlock, published, course.totalDays, today, now, { time: course.ingestTime, timezone: course.ingestTimezone })
      : null,
  };
}
export type LearnerView = Awaited<ReturnType<typeof learnerView>>;

/** Day numbers the learner has finished reading in a course. */
export const getReadDays = cache(async (userId: string, courseId: string) => {
  const rows = await db.lessonProgress.findMany({
    where: { userId, courseId, readAt: { not: null } },
    select: { lesson: { select: { day: true } } },
  });
  return new Set(rows.map((r) => r.lesson.day));
});
