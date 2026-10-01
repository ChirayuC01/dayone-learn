import { db } from "@/lib/db";
import { ingestRoute, intParam } from "@/lib/ingest/http";
import { moduleTestSchema } from "@/lib/ingest/schema";
import { upsertModuleTest } from "@/lib/ingest/service";

type Ctx = { params: Promise<{ slug: string; n: string }> };

/** Create or replace a module test. */
export async function PUT(req: Request, { params }: Ctx) {
  const { slug, n } = await params;
  return ingestRoute(req, { courseSlug: slug, kind: "MODULE" }, moduleTestSchema, (body) =>
    upsertModuleTest(db, slug, intParam(n, "module"), body),
  );
}
