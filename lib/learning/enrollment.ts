// Enrollment writes. Rules live in unlock.ts; this maps them onto Enrollment rows.
import type { Enrollment, PrismaClient } from "@prisma/client";
import { dateColumn, fromDateColumn, type LocalDate } from "../time/zoned.ts";
import { changePace, newEnrollmentUnlock, type Pace, type Published, type UnlockState } from "./unlock.ts";

export const unlockStateOf = (e: Pick<Enrollment, "pace" | "dailyAnchorDate" | "dailyAnchorDay">): UnlockState => ({
  pace: e.pace,
  dailyAnchorDate: fromDateColumn(e.dailyAnchorDate),
  dailyAnchorDay: e.dailyAnchorDay,
});

const unlockColumns = (s: UnlockState) => ({
  pace: s.pace,
  dailyAnchorDate: dateColumn(s.dailyAnchorDate),
  dailyAnchorDay: s.dailyAnchorDay,
});

type Ctx = { userId: string; courseId: string; published: Published; today: LocalDate };

/** Enrolls, or restores an unenrolled (archived) enrollment with its progress. Idempotent. */
export async function enroll(db: PrismaClient, ctx: Ctx & { track: string; pace: Pace }) {
  const existing = await db.enrollment.findUnique({ where: { userId_courseId: { userId: ctx.userId, courseId: ctx.courseId } } });
  if (!existing) {
    return db.enrollment.create({
      data: { userId: ctx.userId, courseId: ctx.courseId, track: ctx.track, ...unlockColumns(newEnrollmentUnlock(ctx.pace, ctx.today)) },
    });
  }
  if (!existing.archivedAt) return existing;
  const state = changePace(unlockStateOf(existing), ctx.pace, ctx.published, ctx.today);
  return db.enrollment.update({
    where: { id: existing.id },
    data: { archivedAt: null, track: ctx.track, ...unlockColumns(state) },
  });
}

/** Changes track and/or pace on an active enrollment. Switching pace never re-locks an open day. */
export async function updateEnrollment(db: PrismaClient, ctx: Ctx & { track?: string; pace?: Pace }) {
  const e = await db.enrollment.findUnique({ where: { userId_courseId: { userId: ctx.userId, courseId: ctx.courseId } } });
  if (!e || e.archivedAt) return null;
  const state = ctx.pace ? changePace(unlockStateOf(e), ctx.pace, ctx.published, ctx.today) : unlockStateOf(e);
  return db.enrollment.update({
    where: { id: e.id },
    data: { ...(ctx.track ? { track: ctx.track } : {}), ...unlockColumns(state) },
  });
}

/** Hides the course from the dashboard. Progress, XP and history are kept. */
export async function unenroll(db: PrismaClient, ctx: { userId: string; courseId: string }) {
  await db.enrollment.updateMany({
    where: { userId: ctx.userId, courseId: ctx.courseId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
}
