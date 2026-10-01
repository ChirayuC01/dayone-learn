// Best-score bookkeeping for lessons and module tests. Pure.

export const MODULE_PASS_RATIO = 0.7;

export type ProgressRecord = {
  bestScore: number;
  total: number;
  attempts: number;
  firstPerfectAt: Date | null;
  passedAt?: Date | null;
};

const ratio = (score: number, total: number) => (total ? score / total : 0);

/**
 * Applies one graded attempt. The best attempt is kept by ratio (a re-ingested quiz can change its
 * length); a tie keeps the newer total. `passRatio` is set for module tests only.
 */
export function applyAttempt(
  prev: ProgressRecord | null,
  attempt: { score: number; total: number; at: Date },
  passRatio?: number,
): ProgressRecord & { improved: boolean; firstPerfect: boolean; firstPass: boolean } {
  const p = prev ?? { bestScore: 0, total: 0, attempts: 0, firstPerfectAt: null, passedAt: null };
  const improved = !prev || ratio(attempt.score, attempt.total) > ratio(p.bestScore, p.total);
  const better = improved || ratio(attempt.score, attempt.total) === ratio(p.bestScore, p.total);
  const perfect = attempt.total > 0 && attempt.score === attempt.total;
  const passed = passRatio !== undefined && attempt.total > 0 && ratio(attempt.score, attempt.total) >= passRatio;
  return {
    bestScore: better ? attempt.score : p.bestScore,
    total: better ? attempt.total : p.total,
    attempts: p.attempts + 1,
    firstPerfectAt: p.firstPerfectAt ?? (perfect ? attempt.at : null),
    ...(passRatio !== undefined ? { passedAt: p.passedAt ?? (passed ? attempt.at : null) } : {}),
    improved,
    firstPerfect: perfect && !p.firstPerfectAt,
    firstPass: passed && !p.passedAt,
  };
}

/** Attempts per user allowed in a rolling minute, across all quizzes. */
export const ATTEMPTS_PER_MINUTE = 6;
