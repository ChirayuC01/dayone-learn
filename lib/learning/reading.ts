// Reading sessions: start → heartbeats → finish. The server decides whether a finish is plausible
// (lib/gamification/reading.ts) before marking the lesson read and awarding XP.
import type { PrismaClient } from "@prisma/client";
import { beatCounts, finishPlausible, isStale } from "../gamification/reading.ts";
import { recordActivity, type Rewards } from "../gamification/service.ts";
import { lessonReadAwards } from "../gamification/xp.ts";
import { localDate } from "../time/zoned.ts";
import { canRead, dayAccess } from "./access.ts";
import { unlockStateOf } from "./enrollment.ts";

export type ReadingEvent = "start" | "beat" | "finish";
export type ReadingResult =
  | { status: "ok" }
  | { status: "read"; rewards: Rewards }
  | { status: "already-read" }
  | { status: "too-soon" }
  | { status: "forbidden" };

export async function readingEvent(
  db: PrismaClient,
  input: { userId: string; timezone: string; lessonId: string; event: ReadingEvent; now?: Date },
): Promise<ReadingResult> {
  const now = input.now ?? new Date();
  const lesson = await db.lesson.findUnique({ where: { id: input.lessonId }, select: { id: true, day: true, courseId: true } });
  if (!lesson) return { status: "forbidden" };
  const enrollment = await db.enrollment.findUnique({ where: { userId_courseId: { userId: input.userId, courseId: lesson.courseId } } });
  if (!enrollment || enrollment.archivedAt) return { status: "forbidden" };
  const published = (await db.lesson.findMany({ where: { courseId: lesson.courseId }, select: { day: true } })).map((l) => l.day);
  if (!canRead(dayAccess(lesson.day, published, unlockStateOf(enrollment), localDate(now, input.timezone)))) return { status: "forbidden" };

  const key = { userId_lessonId: { userId: input.userId, lessonId: lesson.id } };
  const p = await db.lessonProgress.findUnique({ where: key });
  if (p?.readAt) return { status: "already-read" };
  const session = { startedAt: p?.readingStartedAt ?? null, lastBeatAt: p?.lastHeartbeatAt ?? null, beats: p?.heartbeats ?? 0 };

  if (input.event === "start") {
    if (isStale(session, now)) {
      const data = { readingStartedAt: now, lastHeartbeatAt: null, heartbeats: 0 };
      await db.lessonProgress.upsert({ where: key, create: { userId: input.userId, lessonId: lesson.id, courseId: lesson.courseId, ...data }, update: data });
    }
    return { status: "ok" };
  }

  if (input.event === "beat") {
    if (beatCounts(session, now)) {
      await db.lessonProgress.update({ where: key, data: { lastHeartbeatAt: now, heartbeats: { increment: 1 } } });
    }
    return { status: "ok" };
  }

  if (!finishPlausible(session, now)) return { status: "too-soon" };
  // Only the request that flips readAt from null awards XP.
  const flipped = await db.lessonProgress.updateMany({ where: { userId: input.userId, lessonId: lesson.id, readAt: null }, data: { readAt: now } });
  if (!flipped.count) return { status: "already-read" };
  const rewards = await recordActivity(db, {
    userId: input.userId,
    timezone: input.timezone,
    now,
    awards: lessonReadAwards(input.userId, lesson.id, lesson.courseId),
    counts: { lessons: 1 },
    lessonFinished: true,
    completionCourseId: lesson.courseId,
  });
  return { status: "read", rewards };
}
