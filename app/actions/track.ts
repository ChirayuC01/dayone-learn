"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getCourseOutline } from "@/lib/content/queries";
import { trackCookieName } from "@/lib/content/track";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/learning/learner";

const input = z.object({ slug: z.string().min(1).max(64), track: z.string().min(1).max(32) });

/** Form action for the track toggle (works without JavaScript). Enrolled: saved on the enrollment; otherwise a cookie. */
export async function setTrack(formData: FormData) {
  const parsed = input.safeParse({ slug: formData.get("slug"), track: formData.get("track") });
  if (!parsed.success) return;
  const course = await getCourseOutline(parsed.data.slug);
  if (!course || !course.tracks.some((t) => t.key === parsed.data.track)) return;

  const viewer = await getViewer();
  if (viewer) {
    const updated = await db.enrollment.updateMany({
      where: { userId: viewer.id, courseId: course.id, archivedAt: null },
      data: { track: parsed.data.track },
    });
    if (updated.count) {
      revalidatePath("/", "layout");
      return;
    }
  }
  (await cookies()).set(trackCookieName(course.slug), parsed.data.track, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
