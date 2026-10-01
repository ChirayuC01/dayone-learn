"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pad } from "@/lib/content/outline";
import { getCourseOutline } from "@/lib/content/queries";
import { db } from "@/lib/db";
import { recordActivity } from "@/lib/gamification/service";
import { enroll, unenroll, updateEnrollment } from "@/lib/learning/enrollment";
import { getViewer } from "@/lib/learning/learner";
import { localDate } from "@/lib/time/zoned";

const pace = z.enum(["DAILY", "SELF"]);

async function context(slug: string) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/signin?callbackUrl=${encodeURIComponent(`/courses/${slug}`)}`);
  const course = await getCourseOutline(slug);
  if (!course) redirect("/courses");
  return {
    viewer,
    course,
    base: {
      userId: viewer.id,
      courseId: course.id,
      published: course.lessons.map((l) => l.day),
      today: localDate(new Date(), viewer.timezone),
    },
  };
}

export async function enrollAction(formData: FormData) {
  const input = z
    .object({ slug: z.string().min(1).max(64), track: z.string().max(32).optional(), pace })
    .safeParse({ slug: formData.get("slug"), track: formData.get("track") ?? undefined, pace: formData.get("pace") });
  if (!input.success) return;
  const { course, base } = await context(input.data.slug);
  const existing = await db.enrollment.findUnique({ where: { userId_courseId: { userId: base.userId, courseId: course.id } } });
  // Archived courses accept no new learners, but past learners can come back.
  if (course.status !== "LIVE" && !existing) return;
  const track = course.tracks.some((t) => t.key === input.data.track) ? input.data.track! : course.defaultTrack;

  await enroll(db, { ...base, track, pace: input.data.pace });
  // Enrolling earns no XP but can unlock Polyglot.
  await recordActivity(db, { userId: base.userId, timezone: (await getViewer())!.timezone, awards: [] });
  revalidatePath("/", "layout");
  const first = course.lessons[0]?.day;
  redirect(first ? `/learn/${course.slug}/day/${pad(first)}` : `/courses/${course.slug}`);
}

export async function updateEnrollmentAction(formData: FormData) {
  const input = z
    .object({ slug: z.string().min(1).max(64), track: z.string().max(32).optional(), pace: pace.optional() })
    .safeParse({
      slug: formData.get("slug"),
      track: formData.get("track") ?? undefined,
      pace: formData.get("pace") ?? undefined,
    });
  if (!input.success) return;
  const { course, base } = await context(input.data.slug);
  const track = course.tracks.some((t) => t.key === input.data.track) ? input.data.track : undefined;
  await updateEnrollment(db, { ...base, track, pace: input.data.pace });
  revalidatePath("/", "layout");
}

export async function unenrollAction(formData: FormData) {
  const slug = z.string().min(1).max(64).safeParse(formData.get("slug"));
  if (!slug.success) return;
  const { base } = await context(slug.data);
  await unenroll(db, base);
  revalidatePath("/", "layout");
  redirect(`/courses/${slug.data}`);
}
