import { db } from "@/lib/db";
import { ingestRoute, slugOk } from "@/lib/ingest/http";
import { IngestError } from "@/lib/ingest/normalize";
import { courseSchema } from "@/lib/ingest/schema";
import { upsertCourse } from "@/lib/ingest/service";

type Ctx = { params: Promise<{ slug: string }> };

/** Create or update a course and its full syllabus. Never deletes published lessons. */
export async function PUT(req: Request, { params }: Ctx) {
  const { slug } = await params;
  return ingestRoute(req, { courseSlug: slug, kind: "COURSE" }, courseSchema, (body) => {
    if (!slugOk(slug)) throw new IngestError(400, "slug must be lowercase letters, digits and dashes");
    return upsertCourse(db, slug, body);
  });
}
