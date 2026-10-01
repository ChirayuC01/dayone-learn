// Loads every course in reference/seed/<slug>/ through the same service functions the ingest API uses.
// Run: npm run db:seed   (Node ≥ 22.18 runs TypeScript directly; no build step)
// Layout per course: course.json, day-NN.json, module-N.json
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import prismaPkg from "@prisma/client";
import { IngestError } from "../lib/ingest/normalize.ts";
import { courseSchema, lessonSchema, moduleTestSchema, type CourseInput } from "../lib/ingest/schema.ts";
import { upsertCourse, upsertLesson, upsertModuleTest, withIngestLog } from "../lib/ingest/service.ts";

const SEED_DIR = join(import.meta.dirname, "..", "reference", "seed");

// Presentation fields the exported course.json doesn't carry. Values in course.json win.
const COURSE_DEFAULTS: Record<string, Partial<CourseInput>> = {
  linux: {
    status: "LIVE",
    description:
      "A 66-day course that takes you from your first terminal window to writing shell scripts, " +
      "managing processes and connecting to servers. Each lesson takes 15–20 minutes and ends with a short quiz. " +
      "Follow along on Ubuntu under WSL or on any native Linux distribution.",
    accent: "#f0b44c",
    icon: "$_",
    caseMissMessage: "Close: Linux is case-sensitive.",
    ingestTime: "04:30",
    ingestTimezone: "Asia/Kolkata",
  },
};

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, "utf8"));
const fileNumber = (name: string) => Number(/(\d+)\.json$/.exec(name)?.[1]);

async function seedCourse(db: InstanceType<typeof prismaPkg.PrismaClient>, slug: string) {
  const dir = join(SEED_DIR, slug);
  const files = await readdir(dir);

  const raw = (await readJson(join(dir, "course.json"))) as Record<string, unknown>;
  const course = courseSchema.parse({ ...COURSE_DEFAULTS[slug], ...raw });
  const c = await withIngestLog(db, { courseSlug: slug, kind: "COURSE" }, () => upsertCourse(db, slug, course));
  console.log(`  ${c.message}`);

  const days = files.filter((f) => /^day-\d+\.json$/.test(f)).sort((a, b) => fileNumber(a) - fileNumber(b));
  for (const f of days) {
    const day = fileNumber(f);
    const body = lessonSchema.parse(await readJson(join(dir, f)));
    const r = await withIngestLog(db, { courseSlug: slug, kind: "LESSON", day }, () => upsertLesson(db, slug, day, body));
    console.log(`  ${r.message}`);
  }

  const mods = files.filter((f) => /^module-\d+\.json$/.test(f)).sort((a, b) => fileNumber(a) - fileNumber(b));
  for (const f of mods) {
    const n = fileNumber(f);
    const body = moduleTestSchema.parse(await readJson(join(dir, f)));
    const r = await withIngestLog(db, { courseSlug: slug, kind: "MODULE" }, () => upsertModuleTest(db, slug, n, body));
    console.log(`  ${r.message}`);
  }
}

async function main() {
  const db = new prismaPkg.PrismaClient();
  const only = process.argv[2];
  try {
    const slugs = only ? [only] : (await readdir(SEED_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    for (const slug of slugs) {
      console.log(`Seeding ${slug}`);
      await seedCourse(db, slug);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof IngestError ? `IngestError ${err.status}: ${err.message}` : err);
  process.exit(1);
});
