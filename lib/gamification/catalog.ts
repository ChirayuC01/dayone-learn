// The seeded achievement catalogue (scripts/seed.ts upserts it). Add rows here or straight into the
// Achievement table; `criteria` must use a type from achievements.ts.
import type { Criteria } from "./achievements.ts";

export type CatalogueEntry = { key: string; title: string; description: string; icon: string; tier: "BRONZE" | "SILVER" | "GOLD"; criteria: Criteria };

export const ACHIEVEMENTS: CatalogueEntry[] = [
  { key: "first-lesson", title: "First Lesson", description: "Finish reading your first lesson.", icon: "📖", tier: "BRONZE", criteria: { type: "lessonsRead", gte: 1 } },
  { key: "first-perfect", title: "First Perfect Quiz", description: "Get every question right on a lesson quiz.", icon: "🎯", tier: "BRONZE", criteria: { type: "perfectQuizzes", gte: 1 } },
  { key: "module-master", title: "Module Master", description: "Pass a module test.", icon: "🏅", tier: "SILVER", criteria: { type: "modulesPassed", gte: 1 } },
  { key: "flawless-module", title: "Flawless Module", description: "Score 100% on a module test.", icon: "💎", tier: "GOLD", criteria: { type: "perfectModules", gte: 1 } },
  { key: "streak-7", title: "7-Day Streak", description: "Learn seven days in a row.", icon: "🔥", tier: "SILVER", criteria: { type: "streak", gte: 7 } },
  { key: "streak-30", title: "30-Day Streak", description: "Learn thirty days in a row.", icon: "☄️", tier: "GOLD", criteria: { type: "streak", gte: 30 } },
  { key: "night-owl", title: "Night Owl", description: "Finish a lesson after 22:00.", icon: "🦉", tier: "BRONZE", criteria: { type: "lessonAtHour", from: 22, to: 24 } },
  { key: "early-bird", title: "Early Bird", description: "Finish a lesson before 07:00.", icon: "🐦", tier: "BRONZE", criteria: { type: "lessonAtHour", from: 0, to: 7 } },
  { key: "comeback", title: "Comeback", description: "Come back after a week or more away.", icon: "🔁", tier: "BRONZE", criteria: { type: "comeback", days: 7 } },
  { key: "polyglot", title: "Polyglot", description: "Enroll in three courses.", icon: "🧭", tier: "SILVER", criteria: { type: "enrollments", gte: 3 } },
  { key: "graduate", title: "Course Graduate", description: "Complete every lesson and module test in a course.", icon: "🎓", tier: "GOLD", criteria: { type: "coursesCompleted", gte: 1 } },
  { key: "reviewer", title: "Reviewer", description: "Answer 50 review questions.", icon: "🗂️", tier: "SILVER", criteria: { type: "reviewAnswers", gte: 50 } },
];
