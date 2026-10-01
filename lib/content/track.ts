// The reader's track choice. Until sign-in exists (phase 3) it lives in a per-course cookie;
// after that, an enrolled learner's track comes from their Enrollment.
import { cookies } from "next/headers";
import type { TrackDef } from "@/lib/ingest/normalize";
import { resolveTrack } from "./outline";

export const trackCookieName = (slug: string) => `track.${slug}`;

export async function currentTrack(course: { slug: string; tracks: TrackDef[]; defaultTrack: string }) {
  const jar = await cookies();
  return resolveTrack(course.tracks, course.defaultTrack, jar.get(trackCookieName(course.slug))?.value);
}
