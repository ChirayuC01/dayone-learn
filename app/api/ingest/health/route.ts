import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeIngest } from "@/lib/ingest/http";

/** Token check plus a summary of every course, so a scheduled job can see where each course is. */
export async function GET(req: Request) {
  const denied = await authorizeIngest(req);
  if (denied) return denied;
  const courses = await db.course.findMany({
    orderBy: { slug: "asc" },
    select: { slug: true, status: true, totalDays: true, lessons: { select: { day: true }, orderBy: { day: "desc" } } },
  });
  const logs = await db.ingestLog.groupBy({ by: ["courseSlug"], _max: { createdAt: true } });
  const last = new Map(logs.map((l) => [l.courseSlug, l._max.createdAt]));
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    courses: courses.map((c) => ({
      slug: c.slug,
      status: c.status,
      totalDays: c.totalDays,
      published: c.lessons.length,
      latestDay: c.lessons[0]?.day ?? null,
      lastIngestAt: last.get(c.slug) ?? null,
    })),
  });
}
