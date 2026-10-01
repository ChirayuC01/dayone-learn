import { db } from "@/lib/db";
import { ingestRoute, intParam } from "@/lib/ingest/http";
import { lessonSchema } from "@/lib/ingest/schema";
import { upsertLesson } from "@/lib/ingest/service";

type Ctx = { params: Promise<{ slug: string; day: string }> };

/** Publish (or re-publish) one day's lesson and replace its quiz. */
export async function PUT(req: Request, { params }: Ctx) {
  const { slug, day } = await params;
  const n = /^\d{1,4}$/.test(day) ? Number(day) : undefined;
  return ingestRoute(req, { courseSlug: slug, kind: "LESSON", day: n }, lessonSchema, (body) =>
    upsertLesson(db, slug, intParam(day, "day"), body),
  );
}
