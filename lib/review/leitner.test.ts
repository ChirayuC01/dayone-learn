import { describe, expect, it } from "vitest";
import { reviewSessionAwards } from "../gamification/xp.ts";
import { afterReview, dueFor, enterQueue, INTERVALS, pickSession, type DueItem } from "./leitner.ts";

const IST = "Asia/Kolkata";

describe("Leitner boxes", () => {
  it("uses 1 / 2 / 4 / 8 / 16 day intervals", () => {
    expect([...INTERVALS]).toEqual([1, 2, 4, 8, 16]);
  });

  it("schedules at local midnight in the learner's zone", () => {
    // box 1 answered on Oct 1 → due at 00:00 IST on Oct 2 = 18:30Z on Oct 1
    expect(dueFor(1, "2026-10-01", IST).toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(dueFor(3, "2026-10-01", IST).toISOString()).toBe("2026-10-04T18:30:00.000Z");
    expect(dueFor(5, "2026-10-01", "UTC").toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });

  it("keeps local midnight across DST", () => {
    // New York falls back on 2026-11-01; 8 days after Oct 28 is Nov 5, midnight EST = 05:00Z
    expect(dueFor(4, "2026-10-28", "America/New_York").toISOString()).toBe("2026-11-05T05:00:00.000Z");
    expect(dueFor(1, "2026-10-28", "America/New_York").toISOString()).toBe("2026-10-29T04:00:00.000Z"); // EDT
  });

  it("puts a missed question in box 1, due tomorrow", () => {
    expect(enterQueue("2026-10-01", "UTC")).toEqual({ box: 1, dueAt: new Date("2026-10-02T00:00:00Z") });
  });

  it("moves up a box when correct and back to box 1 when wrong", () => {
    expect(afterReview({ box: 1 }, true, "2026-10-02", "UTC")).toEqual({ box: 2, dueAt: new Date("2026-10-04T00:00:00Z") });
    expect(afterReview({ box: 4 }, true, "2026-10-02", "UTC")).toEqual({ box: 5, dueAt: new Date("2026-10-18T00:00:00Z") });
    expect(afterReview({ box: 4 }, false, "2026-10-02", "UTC")).toEqual({ box: 1, dueAt: new Date("2026-10-03T00:00:00Z") });
  });

  it("stays in box 5 when correct again", () => {
    expect(afterReview({ box: 5 }, true, "2026-10-02", "UTC").box).toBe(5);
  });
});

describe("pickSession", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const item = (questionId: string, courseId: string, dueIso: string, box = 1): DueItem => ({ questionId, courseId, box, dueAt: new Date(dueIso) });

  it("takes only due items, most overdue first", () => {
    const s = pickSession([item("late", "a", "2026-10-09T00:00:00Z"), item("future", "a", "2026-10-11T00:00:00Z"), item("old", "a", "2026-10-01T00:00:00Z")], now);
    expect(s.map((i) => i.questionId)).toEqual(["old", "late"]);
  });

  it("caps the session at 5", () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`q${i}`, "a", `2026-10-0${i + 1}T00:00:00Z`));
    expect(pickSession(many, now)).toHaveLength(5);
  });

  it("mixes courses in turn", () => {
    const items = [
      item("a1", "linux", "2026-10-01T00:00:00Z"),
      item("a2", "linux", "2026-10-02T00:00:00Z"),
      item("a3", "linux", "2026-10-03T00:00:00Z"),
      item("a4", "linux", "2026-10-04T00:00:00Z"),
      item("b1", "git", "2026-10-05T00:00:00Z"),
      item("b2", "git", "2026-10-06T00:00:00Z"),
    ];
    expect(pickSession(items, now).map((i) => i.questionId)).toEqual(["a1", "b1", "a2", "b2", "a3"]);
  });

  it("prefers lower boxes when equally due", () => {
    const s = pickSession([item("x", "a", "2026-10-01T00:00:00Z", 3), item("y", "a", "2026-10-01T00:00:00Z", 1)], now, 1);
    expect(s[0]!.questionId).toBe("y");
  });
});

describe("review XP", () => {
  const base = { userId: "u", date: "2026-10-02", answered: 5, sessionsRewardedToday: 0 };
  it("pays 5 XP for a full session, keyed by the day's slot", () => {
    expect(reviewSessionAwards(base)).toEqual([{ reason: "REVIEW_SESSION", amount: 5, refKey: "review:u:2026-10-02:1" }]);
    expect(reviewSessionAwards({ ...base, sessionsRewardedToday: 3 })[0]!.refKey).toBe("review:u:2026-10-02:4");
  });
  it("pays nothing for short sessions or after 4 sessions a day", () => {
    expect(reviewSessionAwards({ ...base, answered: 4 })).toEqual([]);
    expect(reviewSessionAwards({ ...base, sessionsRewardedToday: 4 })).toEqual([]);
  });
});
