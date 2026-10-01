import { describe, expect, it } from "vitest";
import { meets, newlyUnlocked, type Stats } from "./achievements.ts";
import { ACHIEVEMENTS } from "./catalog.ts";
import { crossesGoal, goalProgress, isGoalOption } from "./goal.ts";
import { levelInfo, xpForLevel } from "./levels.ts";
import { beatCounts, finishPlausible, isStale } from "./reading.ts";
import { applyActivity, newStreak, streakToday, type StreakState } from "./streak.ts";
import {
  courseCompletedAward,
  dailyGoalAward,
  isCourseComplete,
  lessonQuizAwards,
  lessonReadAwards,
  moduleTestAwards,
  streakMilestoneAwards,
} from "./xp.ts";

const sum = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0);

describe("XP awards", () => {
  const quiz = { userId: "u", lessonId: "l", courseId: "c", attemptId: "a1", total: 6, prevBest: null, retakesRewardedToday: 0 };

  it("gives 10 XP for reading, keyed per lesson", () => {
    expect(lessonReadAwards("u", "l", "c")).toEqual([{ reason: "LESSON_READ", amount: 10, refKey: "read:u:l", courseId: "c" }]);
  });

  it("gives 2 per correct answer on the first attempt, +10 if perfect", () => {
    expect(sum(lessonQuizAwards({ ...quiz, firstAttempt: true, score: 4 }))).toBe(8);
    const perfect = lessonQuizAwards({ ...quiz, firstAttempt: true, score: 6 });
    expect(perfect.map((a) => [a.reason, a.amount, a.refKey])).toEqual([
      ["QUIZ_CORRECT", 12, "quiz-first:u:l"],
      ["QUIZ_PERFECT", 10, "quiz-perfect:u:l"],
    ]);
    expect(lessonQuizAwards({ ...quiz, firstAttempt: true, score: 0 })).toEqual([]);
  });

  it("gives 1 per newly correct answer on an improving retake, with a per-attempt key", () => {
    const r = lessonQuizAwards({ ...quiz, firstAttempt: false, score: 6, prevBest: { score: 4, total: 6 } });
    expect(r).toEqual([{ reason: "RETAKE_IMPROVEMENT", amount: 2, refKey: "retake:u:a1", courseId: "c" }]);
    expect(lessonQuizAwards({ ...quiz, firstAttempt: false, score: 4, prevBest: { score: 4, total: 6 } })).toEqual([]);
    expect(lessonQuizAwards({ ...quiz, firstAttempt: false, score: 3, prevBest: { score: 4, total: 6 } })).toEqual([]);
  });

  it("gives no perfect bonus on a retake", () => {
    const r = lessonQuizAwards({ ...quiz, firstAttempt: false, score: 6, prevBest: { score: 5, total: 6 } });
    expect(r.map((a) => a.reason)).toEqual(["RETAKE_IMPROVEMENT"]);
  });

  it("caps rewarded retakes at 3 a day", () => {
    const base = { ...quiz, firstAttempt: false, score: 6, prevBest: { score: 2, total: 6 } };
    expect(sum(lessonQuizAwards({ ...base, retakesRewardedToday: 2 }))).toBe(4);
    expect(lessonQuizAwards({ ...base, retakesRewardedToday: 3 })).toEqual([]);
  });

  it("scales the previous best when a quiz changed length", () => {
    // best 3/5 (60%) ≈ 4 of 7 now; 6/7 is 2 newly correct
    expect(sum(lessonQuizAwards({ ...quiz, total: 7, firstAttempt: false, score: 6, prevBest: { score: 3, total: 5 } }))).toBe(2);
  });

  it("gives module pass and perfect awards once each", () => {
    const m = { userId: "u", moduleId: "m", courseId: "c" };
    expect(sum(moduleTestAwards({ ...m, firstPass: true, firstPerfect: true }))).toBe(75);
    expect(moduleTestAwards({ ...m, firstPass: true, firstPerfect: false }).map((a) => a.refKey)).toEqual(["module-pass:u:m"]);
    expect(moduleTestAwards({ ...m, firstPass: false, firstPerfect: false })).toEqual([]);
  });

  it("pays streak milestones and bonuses with stable keys", () => {
    expect(streakMilestoneAwards("u", [7]).map((a) => [a.amount, a.refKey])).toEqual([[25, "streak:u:7"]]);
    expect(streakMilestoneAwards("u", [30, 100]).map((a) => a.amount)).toEqual([100, 300]);
    expect(streakMilestoneAwards("u", [8])).toEqual([]);
    expect(dailyGoalAward("u", "2026-10-01")).toMatchObject({ amount: 5, refKey: "goal:u:2026-10-01" });
    expect(courseCompletedAward("u", "c")).toMatchObject({ amount: 200, refKey: "course:u:c" });
  });

  it("detects course completion", () => {
    const base = { totalDays: 3, readDays: new Set([1, 2, 3]), modulesWithTests: ["m1"], passedModules: new Set(["m1"]) };
    expect(isCourseComplete(base)).toBe(true);
    expect(isCourseComplete({ ...base, readDays: new Set([1, 3]) })).toBe(false);
    expect(isCourseComplete({ ...base, passedModules: new Set<string>() })).toBe(false);
  });
});

describe("levels", () => {
  it("follows xpForLevel(n) = 50 n (n + 1) / 2", () => {
    expect([1, 2, 3, 10].map(xpForLevel)).toEqual([50, 150, 300, 2750]);
  });

  it("maps XP to a level and progress", () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, floor: 0, next: 50, progress: 0, toNext: 50 });
    expect(levelInfo(49)).toMatchObject({ level: 1, toNext: 1 });
    expect(levelInfo(50)).toMatchObject({ level: 2, floor: 50, next: 150, progress: 0 });
    expect(levelInfo(100)).toMatchObject({ level: 2, progress: 0.5 });
    expect(levelInfo(300)).toMatchObject({ level: 4 });
    expect(levelInfo(2750)).toMatchObject({ level: 11 });
    expect(levelInfo(-5)).toMatchObject({ level: 1, xp: 0 });
  });

  it("is consistent at every boundary up to level 200", () => {
    for (let n = 0; n < 200; n++) {
      expect(levelInfo(xpForLevel(n)).level).toBe(n + 1);
      if (n > 0) expect(levelInfo(xpForLevel(n) - 1).level).toBe(n);
    }
  });
});

describe("streak", () => {
  const s = (over: Partial<StreakState> = {}): StreakState => ({ ...newStreak(), ...over });

  it("starts at 1 with one freeze", () => {
    expect(newStreak().freezes).toBe(1);
    expect(applyActivity(newStreak(), "2026-10-01")).toMatchObject({ next: { current: 1, longest: 1, lastActiveDate: "2026-10-01" }, counted: true });
  });

  it("counts a day once", () => {
    const st = s({ current: 3, longest: 3, lastActiveDate: "2026-10-01" });
    expect(applyActivity(st, "2026-10-01")).toMatchObject({ counted: false, next: st });
  });

  it("extends on consecutive days", () => {
    expect(applyActivity(s({ current: 3, longest: 5, lastActiveDate: "2026-10-01" }), "2026-10-02").next).toMatchObject({ current: 4, longest: 5 });
  });

  it("uses freezes automatically for missed days", () => {
    const u = applyActivity(s({ current: 4, longest: 4, lastActiveDate: "2026-10-01", freezes: 2 }), "2026-10-04");
    expect(u.next).toMatchObject({ current: 5, freezes: 0 });
    expect(u.frozenDates).toEqual(["2026-10-02", "2026-10-03"]);
    expect(u.broken).toBe(false);
  });

  it("breaks when missed days exceed freezes, without spending them", () => {
    const u = applyActivity(s({ current: 9, longest: 9, lastActiveDate: "2026-10-01", freezes: 1 }), "2026-10-04");
    expect(u.next).toMatchObject({ current: 1, longest: 9, freezes: 1 });
    expect(u).toMatchObject({ broken: true, gapDays: 3, frozenDates: [] });
  });

  it("earns a freeze every 7 streak days, up to 2", () => {
    const u = applyActivity(s({ current: 6, longest: 6, lastActiveDate: "2026-10-01", freezes: 1 }), "2026-10-02");
    expect(u).toMatchObject({ freezeEarned: true, milestones: [7], next: { current: 7, freezes: 2 } });
    const full = applyActivity(s({ current: 13, lastActiveDate: "2026-10-01", freezes: 2 }), "2026-10-02");
    expect(full).toMatchObject({ freezeEarned: false, next: { current: 14, freezes: 2 } });
  });

  it("reports milestones 7, 30 and 100", () => {
    expect(applyActivity(s({ current: 29, lastActiveDate: "2026-10-01" }), "2026-10-02").milestones).toEqual([30]);
    expect(applyActivity(s({ current: 99, lastActiveDate: "2026-10-01" }), "2026-10-02").milestones).toEqual([100]);
    expect(applyActivity(s({ current: 30, lastActiveDate: "2026-10-01" }), "2026-10-02").milestones).toEqual([]);
  });

  it("ignores a date earlier than the last active day (time-zone change)", () => {
    expect(applyActivity(s({ current: 2, lastActiveDate: "2026-10-02" }), "2026-10-01").counted).toBe(false);
  });

  it("shows today's standing before any activity", () => {
    const st = s({ current: 5, lastActiveDate: "2026-10-01", freezes: 1 });
    expect(streakToday(st, "2026-10-01")).toEqual({ current: 5, activeToday: true, freezesNeeded: 0 });
    expect(streakToday(st, "2026-10-02")).toEqual({ current: 5, activeToday: false, freezesNeeded: 0 });
    expect(streakToday(st, "2026-10-03")).toMatchObject({ current: 5, freezesNeeded: 1 });
    expect(streakToday(st, "2026-10-04")).toMatchObject({ current: 0, freezesNeeded: 2 });
    expect(streakToday(newStreak(), "2026-10-01").current).toBe(0);
  });
});

describe("daily goal", () => {
  it("fires only when crossing the target", () => {
    expect(crossesGoal(25, 31, 30)).toBe(true);
    expect(crossesGoal(30, 40, 30)).toBe(false);
    expect(crossesGoal(0, 29, 30)).toBe(false);
    expect(goalProgress(15, 30)).toBe(0.5);
    expect(goalProgress(90, 30)).toBe(1);
    expect(isGoalOption(50)).toBe(true);
    expect(isGoalOption(40)).toBe(false);
  });
});

describe("achievements", () => {
  const zero: Stats = {
    lessonsRead: 0,
    perfectQuizzes: 0,
    modulesPassed: 0,
    perfectModules: 0,
    streak: 0,
    enrollments: 0,
    coursesCompleted: 0,
    reviewAnswers: 0,
    totalXp: 0,
    level: 1,
  };
  const keys = (stats: Partial<Stats>, event = {}, unlocked: string[] = []) =>
    newlyUnlocked(ACHIEVEMENTS, new Set(unlocked), { ...zero, ...stats }, event).map((a) => a.key);

  it("seeds every achievement the spec asks for", () => {
    expect(ACHIEVEMENTS.map((a) => a.key).sort()).toEqual(
      ["comeback", "early-bird", "first-lesson", "first-perfect", "flawless-module", "graduate", "module-master", "night-owl", "polyglot", "reviewer", "streak-30", "streak-7"].sort(),
    );
  });

  it("unlocks threshold achievements once", () => {
    expect(keys({ lessonsRead: 1 })).toEqual(["first-lesson"]);
    expect(keys({ lessonsRead: 3 }, {}, ["first-lesson"])).toEqual([]);
    expect(keys({ streak: 30 })).toEqual(["streak-7", "streak-30"]);
    expect(keys({ enrollments: 3, reviewAnswers: 50, coursesCompleted: 1 }).sort()).toEqual(["graduate", "polyglot", "reviewer"]);
    expect(keys({ modulesPassed: 1, perfectModules: 1, perfectQuizzes: 1 }).sort()).toEqual(["first-perfect", "flawless-module", "module-master"]);
  });

  it("unlocks Night Owl and Early Bird from the local hour of a finished lesson", () => {
    expect(keys({}, { lessonReadAtHour: 22 })).toEqual(["night-owl"]);
    expect(keys({}, { lessonReadAtHour: 23 })).toEqual(["night-owl"]);
    expect(keys({}, { lessonReadAtHour: 6 })).toEqual(["early-bird"]);
    expect(keys({}, { lessonReadAtHour: 7 })).toEqual([]);
    expect(keys({}, { lessonReadAtHour: 21 })).toEqual([]);
  });

  it("unlocks Comeback after 7 or more missed days", () => {
    expect(keys({}, { missedDays: 7 })).toEqual(["comeback"]);
    expect(keys({}, { missedDays: 6 })).toEqual([]);
  });

  it("never unlocks unknown criteria", () => {
    expect(meets({ type: "mystery", gte: 0 }, zero, {})).toBe(false);
    expect(meets(null, zero, {})).toBe(false);
  });
});

describe("reading heartbeat", () => {
  const t0 = new Date("2026-10-01T10:00:00Z");
  const at = (s: number) => new Date(t0.getTime() + s * 1000);

  it("counts beats at most every 10 s", () => {
    expect(beatCounts({ startedAt: t0, lastBeatAt: null, beats: 0 }, at(5))).toBe(true);
    expect(beatCounts({ startedAt: t0, lastBeatAt: at(5), beats: 1 }, at(12))).toBe(false);
    expect(beatCounts({ startedAt: t0, lastBeatAt: at(5), beats: 1 }, at(15))).toBe(true);
    expect(beatCounts({ startedAt: null, lastBeatAt: null, beats: 0 }, at(15))).toBe(false);
  });

  it("accepts a finish after 60 s with 3 beats and a recent beat", () => {
    expect(finishPlausible({ startedAt: t0, lastBeatAt: at(60), beats: 4 }, at(65))).toBe(true);
    expect(finishPlausible({ startedAt: t0, lastBeatAt: at(50), beats: 4 }, at(55))).toBe(false); // too soon
    expect(finishPlausible({ startedAt: t0, lastBeatAt: at(60), beats: 2 }, at(65))).toBe(false); // too few beats
    expect(finishPlausible({ startedAt: t0, lastBeatAt: at(60), beats: 4 }, at(300))).toBe(false); // went silent
    expect(finishPlausible({ startedAt: null, lastBeatAt: null, beats: 9 }, at(300))).toBe(false);
  });

  it("restarts stale sessions", () => {
    expect(isStale({ startedAt: null, lastBeatAt: null, beats: 0 }, t0)).toBe(true);
    expect(isStale({ startedAt: t0, lastBeatAt: null, beats: 0 }, at(3600))).toBe(false);
    expect(isStale({ startedAt: t0, lastBeatAt: null, beats: 0 }, at(7 * 3600))).toBe(true);
  });
});

describe("heatmap", async () => {
  const { heatmapWeeks, heatLevel } = await import("./heatmap.ts");

  it("lays out Monday-first weeks ending today, with future days empty", () => {
    // 2026-10-01 is a Thursday
    const w = heatmapWeeks("2026-10-01", 2, new Map([["2026-09-28", { xp: 12, byCourse: [{ courseId: "c", xp: 12 }], frozen: false }]]));
    expect(w).toHaveLength(2);
    expect(w[0]![0]!.date).toBe("2026-09-21");
    expect(w[1]![0]).toMatchObject({ date: "2026-09-28", xp: 12 });
    expect(w[1]![3]!.date).toBe("2026-10-01");
    expect(w[1]![4]).toBeNull();
  });

  it("buckets XP", () => {
    expect([0, 5, 10, 30, 60].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});
