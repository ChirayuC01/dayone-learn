// Reading XP anti-abuse. The reader sends a heartbeat every ~15 s while the page is visible; the
// server counts a beat only if it is at least MIN_BEAT_GAP after the last one. "Finished" is only
// accepted after MIN_SECONDS on the page with enough beats, and while beats are still recent.

export const READING = {
  minSeconds: 60,
  minBeatGapSeconds: 10,
  minBeats: 3,
  /** A finish must arrive within this long of the last beat. */
  maxSilenceSeconds: 120,
  /** A reading session older than this restarts from zero. */
  staleAfterSeconds: 6 * 60 * 60,
} as const;

export type ReadingSession = { startedAt: Date | null; lastBeatAt: Date | null; beats: number };

/** Should a `start` restart the session? */
export const isStale = (s: ReadingSession, now: Date) =>
  !s.startedAt || (now.getTime() - s.startedAt.getTime()) / 1000 > READING.staleAfterSeconds;

/** Does a heartbeat count? */
export const beatCounts = (s: ReadingSession, now: Date) =>
  !!s.startedAt && (!s.lastBeatAt || (now.getTime() - s.lastBeatAt.getTime()) / 1000 >= READING.minBeatGapSeconds);

export function finishPlausible(s: ReadingSession, now: Date): boolean {
  if (!s.startedAt || !s.lastBeatAt) return false;
  const elapsed = (now.getTime() - s.startedAt.getTime()) / 1000;
  const silence = (now.getTime() - s.lastBeatAt.getTime()) / 1000;
  return elapsed >= READING.minSeconds && s.beats >= READING.minBeats && silence <= READING.maxSilenceSeconds;
}
