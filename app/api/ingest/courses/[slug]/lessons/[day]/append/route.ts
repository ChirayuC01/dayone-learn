import { db } from "@/lib/db";
import { ingestRoute, intParam } from "@/lib/ingest/http";
import { appendSchema } from "@/lib/ingest/schema";
import { appendToLesson } from "@/lib/ingest/service";

type Ctx = { params: Promise<{ slug: string; day: string }> };

/** Append a section (e.g. answered doubts) to an existing lesson, per track. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { slug, day } = await params;
  const n = /^\d{1,4}$/.test(day) ? Number(day) : undefined;
  return ingestRoute(req, { courseSlug: slug, kind: "APPEND", day: n }, appendSchema, (body) =>
    appendToLesson(db, slug, intParam(day, "day"), body),
  );
}
