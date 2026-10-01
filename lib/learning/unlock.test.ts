import { describe, expect, it } from "vitest";
import { localDate } from "../time/zoned.ts";
import {
  changePace,
  isUnlocked,
  newEnrollmentUnlock,
  nextUnlock,
  unlockedThrough,
  unlocksOn,
  type UnlockState,
} from "./unlock.ts";

const days = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const daily = (anchorDate: string, anchorDay = 1): UnlockState => ({ pace: "DAILY", dailyAnchorDate: anchorDate, dailyAnchorDay: anchorDay });
const INGEST = { time: "04:30", timezone: "Asia/Kolkata" };

describe("daily pace", () => {
  const s = newEnrollmentUnlock("DAILY", "2026-10-01");

  it("opens Day 1 on enrollment and one more day per calendar day", () => {
    expect(unlockedThrough(s, days(30), "2026-10-01")).toBe(1);
    expect(unlockedThrough(s, days(30), "2026-10-02")).toBe(2);
    expect(unlockedThrough(s, days(30), "2026-10-31")).toBe(30);
  });

  it("is capped at the latest published day", () => {
    expect(unlockedThrough(s, days(7), "2026-10-20")).toBe(7);
    expect(unlockedThrough(s, [], "2026-10-20")).toBe(0);
  });

  it("opens a backlog at once when lessons are published after the learner caught up", () => {
    // enrolled with 7 published; on day 20 lessons 8–12 arrive together
    expect(unlockedThrough(s, days(12), "2026-10-20")).toBe(12);
  });

  it("never goes below the anchor if the clock is earlier than the anchor date", () => {
    expect(unlockedThrough(s, days(30), "2026-09-30")).toBe(1);
  });

  it("only opens published days, even below the allowance", () => {
    const published = [1, 2, 4];
    expect(isUnlocked(s, published, "2026-10-05", 3)).toBe(false);
    expect(isUnlocked(s, published, "2026-10-05", 4)).toBe(true);
    expect(isUnlocked(s, published, "2026-10-03", 4)).toBe(false); // allowance 3
  });

  it("counts calendar days across a DST change", () => {
    // Enrolled the Saturday before New York springs forward; Monday is +2 days, not +1.96
    const ny = newEnrollmentUnlock("DAILY", "2026-03-07");
    const mondayMorning = localDate(new Date("2026-03-09T04:30:00Z"), "America/New_York"); // 00:30 EDT
    expect(mondayMorning).toBe("2026-03-09");
    expect(unlockedThrough(ny, days(30), mondayMorning)).toBe(3);
    // Sunday 23:30 EDT is still Sunday
    expect(unlockedThrough(ny, days(30), localDate(new Date("2026-03-09T03:30:00Z"), "America/New_York"))).toBe(2);
    // and back again in November (25-hour day)
    const fall = newEnrollmentUnlock("DAILY", "2026-10-31");
    expect(unlockedThrough(fall, days(30), localDate(new Date("2026-11-02T04:59:00Z"), "America/New_York"))).toBe(2); // Sun 23:59 EST
    expect(unlockedThrough(fall, days(30), localDate(new Date("2026-11-02T05:00:00Z"), "America/New_York"))).toBe(3); // Mon 00:00 EST
  });

  it("unlocks by the learner's own midnight, not UTC's", () => {
    const now = new Date("2026-10-02T12:30:00Z"); // Oct 3 in Kiritimati (+14), Oct 2 in Pago Pago (-11 → 01:30)
    const enrolledOct1 = newEnrollmentUnlock("DAILY", "2026-10-01");
    expect(unlockedThrough(enrolledOct1, days(30), localDate(now, "Pacific/Kiritimati"))).toBe(3);
    expect(unlockedThrough(enrolledOct1, days(30), localDate(now, "Pacific/Pago_Pago"))).toBe(2);
    expect(unlockedThrough(enrolledOct1, days(30), localDate(now, "Asia/Kolkata"))).toBe(2); // 18:00 IST
  });

  it("dates each locked day", () => {
    expect(unlocksOn(s, 1)).toBe("2026-10-01");
    expect(unlocksOn(s, 5)).toBe("2026-10-05");
    expect(unlocksOn(daily("2026-10-10", 7), 9)).toBe("2026-10-12");
  });
});

describe("self pace", () => {
  it("opens every published lesson", () => {
    const s = newEnrollmentUnlock("SELF", "2026-10-01");
    expect(unlockedThrough(s, days(7), "2026-10-01")).toBe(7);
    expect(isUnlocked(s, days(7), "2026-10-01", 7)).toBe(true);
    expect(isUnlocked(s, days(7), "2026-10-01", 8)).toBe(false);
  });
});

describe("switching pace", () => {
  it("SELF → DAILY keeps everything open and adds one day per day from tomorrow", () => {
    const self = newEnrollmentUnlock("SELF", "2026-10-01");
    const switched = changePace(self, "DAILY", days(7), "2026-10-03");
    expect(switched).toEqual({ pace: "DAILY", dailyAnchorDate: "2026-10-03", dailyAnchorDay: 7 });
    expect(unlockedThrough(switched, days(20), "2026-10-03")).toBe(7);
    expect(unlockedThrough(switched, days(20), "2026-10-04")).toBe(8);
  });

  it("DAILY → SELF opens all published; DAILY again re-anchors at what was open", () => {
    const d = newEnrollmentUnlock("DAILY", "2026-10-01");
    const self = changePace(d, "SELF", days(10), "2026-10-03");
    expect(unlockedThrough(self, days(10), "2026-10-03")).toBe(10);
    const back = changePace(self, "DAILY", days(10), "2026-10-03");
    expect(unlockedThrough(back, days(10), "2026-10-03")).toBe(10);
    expect(unlockedThrough(back, days(12), "2026-10-04")).toBe(11);
  });

  it("is a no-op when the pace doesn't change", () => {
    const d = daily("2026-10-01", 3);
    expect(changePace(d, "DAILY", days(10), "2026-10-09")).toBe(d);
  });

  it("anchors at Day 1 when nothing is published yet", () => {
    const self = newEnrollmentUnlock("SELF", "2026-10-01");
    expect(changePace(self, "DAILY", [], "2026-10-01").dailyAnchorDay).toBe(1);
  });
});

describe("nextUnlock", () => {
  const now = new Date("2026-10-02T06:30:00Z"); // 12:00 IST on Oct 2

  it("points at tomorrow's day under daily pace", () => {
    const s = newEnrollmentUnlock("DAILY", "2026-10-01");
    expect(nextUnlock(s, days(7), 66, "2026-10-02", now, INGEST)).toEqual({ kind: "daily", day: 3, on: "2026-10-03" });
  });

  it("points at the next ingest when the learner has caught up with what's published", () => {
    const s = newEnrollmentUnlock("SELF", "2026-10-01");
    expect(nextUnlock(s, days(7), 66, "2026-10-02", now, INGEST)).toEqual({
      kind: "ingest",
      day: 8,
      at: new Date("2026-10-02T23:00:00Z"), // 04:30 IST Oct 3
    });
  });

  it("reports completion when every syllabus day is published and open", () => {
    const s = newEnrollmentUnlock("SELF", "2026-10-01");
    expect(nextUnlock(s, days(66), 66, "2026-10-02", now, INGEST)).toEqual({ kind: "complete" });
  });
});

describe("access", async () => {
  const { dayAccess, moduleTestAccess, canRead } = await import("./access.ts");
  const enrolled = newEnrollmentUnlock("DAILY", "2026-10-01");

  it("lets anyone preview Day 1 and asks them to enroll for the rest", () => {
    expect(dayAccess(1, days(7), null, "2026-10-05")).toBe("preview");
    expect(dayAccess(2, days(7), null, "2026-10-05")).toBe("enroll");
    expect(dayAccess(8, days(7), null, "2026-10-05")).toBe("upcoming");
    expect(canRead("preview")).toBe(true);
    expect(canRead("enroll")).toBe(false);
  });

  it("follows the unlock schedule for enrolled learners", () => {
    expect(dayAccess(2, days(7), enrolled, "2026-10-01")).toBe("locked");
    expect(dayAccess(2, days(7), enrolled, "2026-10-02")).toBe("open");
    expect(dayAccess(9, days(7), enrolled, "2026-10-20")).toBe("upcoming");
  });

  it("opens a module test with its review day", () => {
    const mod = { dayTo: 6, testQuestions: 12 };
    expect(moduleTestAccess(mod, days(7), null, "2026-10-01")).toBe("enroll");
    expect(moduleTestAccess(mod, days(7), enrolled, "2026-10-05")).toBe("locked");
    expect(moduleTestAccess(mod, days(7), enrolled, "2026-10-06")).toBe("open");
    expect(moduleTestAccess({ dayTo: 6, testQuestions: 0 }, days(7), enrolled, "2026-10-06")).toBe("upcoming");
  });
});
