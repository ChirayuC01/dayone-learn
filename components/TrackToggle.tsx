import { setTrack } from "@/app/actions/track";
import type { TrackDef } from "@/lib/ingest/normalize";

/** Segmented control from the prototype; a plain form so it works without JavaScript. */
export function TrackToggle({ slug, tracks, current }: { slug: string; tracks: TrackDef[]; current: string }) {
  if (tracks.length < 2) return null;
  return (
    <form action={setTrack} className="track" role="group" aria-label="Track">
      <input type="hidden" name="slug" value={slug} />
      {tracks.map((t) => (
        <button key={t.key} type="submit" name="track" value={t.key} aria-pressed={t.key === current}>
          {t.label}
        </button>
      ))}
    </form>
  );
}
