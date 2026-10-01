// Zod schemas for the content ingest API bodies. Shared by the API routes and scripts/seed.ts.
// Unknown keys are stripped, so the scheduled jobs can send extra fields without breaking ingest.
import { z } from "zod";

export const trackKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,31}$/, "track keys are lowercase letters, digits and dashes");

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM (24h)");

const ianaZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "unknown IANA time zone");

// ───────────── Questions ─────────────

const questionBase = {
  q: z.string().trim().min(1),
  explain: z.string().default(""),
  tracks: z.array(trackKeySchema).optional(),
};

const mcqSchema = z
  .object({
    ...questionBase,
    type: z.literal("mcq"),
    options: z.array(z.string().trim().min(1)).min(2).max(6),
    answer: z.number().int().min(0),
  })
  .refine((q) => q.answer < q.options.length, {
    message: "answer must be a 0-based index into options",
    path: ["answer"],
  });

const cmdSchema = z.object({
  ...questionBase,
  type: z.literal("cmd"),
  accept: z.array(z.string().trim().min(1)).min(1),
  caseSensitive: z.boolean().optional(),
});

const textSchema = z.object({
  ...questionBase,
  type: z.literal("text"),
  accept: z.array(z.string().trim().min(1)).min(1),
  caseSensitive: z.boolean().optional(),
});

export const questionSchema = z.discriminatedUnion("type", [mcqSchema, cmdSchema, textSchema]);
export type QuestionInput = z.infer<typeof questionSchema>;

// ───────────── Course + syllabus ─────────────

export const courseSchema = z.object({
  slug: z.string().optional(), // must match the URL when present
  title: z.string().trim().min(1).max(120),
  tagline: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "accent is a #rrggbb colour")
    .optional(),
  icon: z.string().min(1).max(8).optional(),
  status: z.enum(["DRAFT", "LIVE", "ARCHIVED"]).optional(),
  tracks: z
    .array(z.object({ key: trackKeySchema, label: z.string().trim().min(1).max(60) }))
    .min(1),
  defaultTrack: trackKeySchema,
  totalDays: z.number().int().min(1).max(1000),
  caseMissMessage: z.string().max(200).optional(),
  ingestTime: hhmm.optional(),
  ingestTimezone: ianaZone.optional(),
  notionPageId: z.string().max(100).optional(),
  modules: z
    .array(
      z.object({
        number: z.number().int().min(1),
        title: z.string().trim().min(1).max(120),
        days: z
          .array(z.object({ day: z.number().int().min(1), title: z.string().trim().min(1).max(200) }))
          .min(1),
      }),
    )
    .min(1),
});
export type CourseInput = z.infer<typeof courseSchema>;

// ───────────── Lessons + module tests ─────────────

export const lessonSchema = z.object({
  day: z.number().int().min(1),
  module: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  trackTitles: z.record(z.string(), z.string().trim().min(1).max(200)).optional(),
  content: z.record(z.string(), z.string().min(1)).refine((c) => Object.keys(c).length > 0, {
    message: "content needs at least one track",
  }),
  quiz: z.array(questionSchema),
});
export type LessonInput = z.infer<typeof lessonSchema>;

export const appendSchema = z.object({
  section: z.record(z.string(), z.string().min(1)).refine((s) => Object.keys(s).length > 0, {
    message: "section needs at least one track",
  }),
});
export type AppendInput = z.infer<typeof appendSchema>;

export const moduleTestSchema = z.object({
  module: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  quiz: z.array(questionSchema).min(1),
});
export type ModuleTestInput = z.infer<typeof moduleTestSchema>;
