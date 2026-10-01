"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getCourseOutline } from "@/lib/content/queries";
import { trackCookieName } from "@/lib/content/track";

const input = z.object({ slug: z.string().min(1).max(64), track: z.string().min(1).max(32) });

/** Form action for the track toggle. Works without JavaScript. */
export async function setTrack(formData: FormData) {
  const parsed = input.safeParse({ slug: formData.get("slug"), track: formData.get("track") });
  if (!parsed.success) return;
  const course = await getCourseOutline(parsed.data.slug);
  if (!course || !course.tracks.some((t) => t.key === parsed.data.track)) return;
  (await cookies()).set(trackCookieName(course.slug), parsed.data.track, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
