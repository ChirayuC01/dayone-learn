// Achievements are data: each catalogue row has a `criteria` object evaluated here. New achievements
// can be added to the catalogue without code as long as they use a known criteria type.

export type Criteria =
  | { type: "lessonsRead"; gte: number }
  | { type: "perfectQuizzes"; gte: number }
  | { type: "modulesPassed"; gte: number }
  | { type: "perfectModules"; gte: number }
  | { type: "streak"; gte: number }
  | { type: "enrollments"; gte: number }
  | { type: "coursesCompleted"; gte: number }
  | { type: "reviewAnswers"; gte: number }
  | { type: "totalXp"; gte: number }
  | { type: "level"; gte: number }
  /** A lesson finished at a local hour in [from, to). */
  | { type: "lessonAtHour"; from: number; to: number }
  /** Activity after at least `days` days without any. */
  | { type: "comeback"; days: number };

export type Stats = {
  lessonsRead: number;
  perfectQuizzes: number;
  modulesPassed: number;
  perfectModules: number;
  streak: number;
  enrollments: number;
  coursesCompleted: number;
  reviewAnswers: number;
  totalXp: number;
  level: number;
};

/** What just happened, for event-shaped achievements. */
export type ActivityEvent = { lessonReadAtHour?: number; missedDays?: number };

export function meets(criteria: unknown, stats: Stats, event: ActivityEvent): boolean {
  const c = criteria as Criteria;
  switch (c?.type) {
    case "lessonsRead":
    case "perfectQuizzes":
    case "modulesPassed":
    case "perfectModules":
    case "streak":
    case "enrollments":
    case "coursesCompleted":
    case "reviewAnswers":
    case "totalXp":
    case "level":
      return stats[c.type] >= c.gte;
    case "lessonAtHour":
      return event.lessonReadAtHour !== undefined && event.lessonReadAtHour >= c.from && event.lessonReadAtHour < c.to;
    case "comeback":
      return event.missedDays !== undefined && event.missedDays >= c.days;
    default:
      return false; // unknown criteria never unlock
  }
}

export function newlyUnlocked<T extends { key: string; criteria: unknown }>(
  catalogue: T[],
  unlocked: ReadonlySet<string>,
  stats: Stats,
  event: ActivityEvent = {},
): T[] {
  return catalogue.filter((a) => !unlocked.has(a.key) && meets(a.criteria, stats, event));
}
