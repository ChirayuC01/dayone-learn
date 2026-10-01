import { describe, expect, it } from "vitest";
import { reminderDue, streakAtRisk } from "../notify/reminders.ts";
import { bearerMatches, unsubscribeToken, unsubscribeUrl, verifyUnsubscribe } from "../notify/unsubscribe.ts";
import { assignCohorts, nextTier, rankCohort, weekRange, weekStartOf, xpToPromotion, zoneSizes, type Tier } from "./league.ts";

describe("league weeks", () => {
  it("start on Monday 00:00 IST", () => {
    expect(weekStartOf(new Date("2026-10-01T12:00:00Z"))).toBe("2026-09-28"); // Thu
    expect(weekStartOf(new Date("2026-10-04T18:29:59Z"))).toBe("2026-09-28"); // Sun 23:59 IST
    expect(weekStartOf(new Date("2026-10-04T18:30:00Z"))).toBe("2026-10-05"); // Mon 00:00 IST
    expect(weekRange("2026-10-05")).toEqual({ start: new Date("2026-10-04T18:30:00Z"), end: new Date("2026-10-11T18:30:00Z") });
  });
});

describe("cohorts", () => {
  const players = (n: number, tier: Tier = "BRONZE") => Array.from({ length: n }, (_, i) => ({ userId: `u${String(i).padStart(3, "0")}`, tier }));

  it("keeps cohorts within a tier and at most 30, evenly sized", () => {
    const c = assignCohorts([...players(61), ...players(3, "GOLD").map((p) => ({ ...p, userId: "g" + p.userId }))], "2026-10-05");
    expect(c.filter((x) => x.tier === "BRONZE").map((x) => x.userIds.length)).toEqual([21, 20, 20]);
    expect(c.filter((x) => x.tier === "GOLD").map((x) => x.userIds.length)).toEqual([3]);
    expect(new Set(c.flatMap((x) => x.userIds)).size).toBe(64);
  });

  it("is deterministic for a week and reshuffles between weeks", () => {
    const a = assignCohorts(players(40), "2026-10-05");
    expect(assignCohorts(players(40), "2026-10-05")).toEqual(a);
    expect(assignCohorts(players(40), "2026-10-12")[0]!.userIds).not.toEqual(a[0]!.userIds);
  });
});

describe("ranking and zones", () => {
  it("uses 5 / 5 zones in a full cohort and never overlaps in small ones", () => {
    expect(zoneSizes(30, "SILVER")).toEqual({ promote: 5, demote: 5 });
    expect(zoneSizes(7, "SILVER")).toEqual({ promote: 3, demote: 2 });
    expect(zoneSizes(1, "SILVER")).toEqual({ promote: 1, demote: 0 });
    expect(zoneSizes(30, "BRONZE").demote).toBe(0);
    expect(zoneSizes(30, "DIAMOND").promote).toBe(0);
  });

  it("ranks by weekly XP and assigns outcomes", () => {
    const members = Array.from({ length: 12 }, (_, i) => ({ userId: `u${String(i).padStart(2, "0")}`, weeklyXp: 120 - i * 10 }));
    const r = rankCohort(members, "SILVER");
    expect(r.map((m) => m.zone)).toEqual(["PROMOTED", "PROMOTED", "PROMOTED", "PROMOTED", "STAYED", "STAYED", "STAYED", "STAYED", "DEMOTED", "DEMOTED", "DEMOTED", "DEMOTED"]);
    expect(r[0]).toMatchObject({ userId: "u00", rank: 1 });
  });

  it("never promotes someone with 0 XP and breaks ties by user id", () => {
    const r = rankCohort([{ userId: "b", weeklyXp: 0 }, { userId: "a", weeklyXp: 0 }], "BRONZE");
    expect(r.map((m) => [m.userId, m.zone])).toEqual([["a", "STAYED"], ["b", "STAYED"]]);
  });

  it("moves tiers within bounds", () => {
    expect(nextTier("BRONZE", "PROMOTED")).toBe("SILVER");
    expect(nextTier("SILVER", "DEMOTED")).toBe("BRONZE");
    expect(nextTier("DIAMOND", "PROMOTED")).toBe("DIAMOND");
    expect(nextTier("BRONZE", "DEMOTED")).toBe("BRONZE");
    expect(nextTier("GOLD", "STAYED")).toBe("GOLD");
  });

  it("says how much XP reaches the promotion zone", () => {
    const members = [
      { userId: "a", weeklyXp: 90 },
      { userId: "b", weeklyXp: 60 },
      { userId: "c", weeklyXp: 40 },
      { userId: "d", weeklyXp: 10 },
      { userId: "e", weeklyXp: 5 },
      { userId: "f", weeklyXp: 0 },
    ]; // promote 2
    const r = rankCohort(members, "BRONZE");
    expect(xpToPromotion(r, "a", "BRONZE")).toBe(0);
    expect(xpToPromotion(r, "c", "BRONZE")).toBe(21); // needs 61 to pass b
    expect(xpToPromotion(r, "f", "BRONZE")).toBe(61);
    expect(xpToPromotion(r, "a", "DIAMOND")).toBeNull();
  });
});

describe("reminders", () => {
  const base = {
    enabled: true,
    reminderTime: "19:00",
    localTime: "19:20",
    today: "2026-10-02",
    lastSentOn: null,
    lastActiveDate: "2026-10-01",
    hasActiveEnrollment: true,
  };
  it("sends in the window after the chosen time when the streak is at risk", () => {
    expect(reminderDue(base)).toBe(true);
    expect(reminderDue({ ...base, localTime: "20:59" })).toBe(true);
    expect(reminderDue({ ...base, localTime: "21:00" })).toBe(false);
    expect(reminderDue({ ...base, localTime: "18:59" })).toBe(false);
  });
  it("doesn't send twice, when already active, when off, or without a course", () => {
    expect(reminderDue({ ...base, lastSentOn: "2026-10-02" })).toBe(false);
    expect(reminderDue({ ...base, lastActiveDate: "2026-10-02" })).toBe(false);
    expect(reminderDue({ ...base, enabled: false })).toBe(false);
    expect(reminderDue({ ...base, hasActiveEnrollment: false })).toBe(false);
  });
  it("knows which streak is at stake", () => {
    expect(streakAtRisk(5, "2026-10-01", "2026-10-02")).toBe(5);
    expect(streakAtRisk(5, "2026-09-29", "2026-10-02")).toBe(0);
  });
});

describe("signed links and bearer tokens", () => {
  it("verifies unsubscribe tokens per user and kind", () => {
    const t = unsubscribeToken("s3cret", "user1", "reminder");
    expect(verifyUnsubscribe("s3cret", "user1", "reminder", t)).toBe(true);
    expect(verifyUnsubscribe("s3cret", "user2", "reminder", t)).toBe(false);
    expect(verifyUnsubscribe("s3cret", "user1", "weekly", t)).toBe(false);
    expect(verifyUnsubscribe("other", "user1", "reminder", t)).toBe(false);
    expect(verifyUnsubscribe("s3cret", "user1", "admin", t)).toBe(false);
    expect(unsubscribeUrl("https://x.dev", "s3cret", "user1", "weekly")).toMatch(/^https:\/\/x\.dev\/unsubscribe\?u=user1&k=weekly&t=/);
  });
  it("compares bearer tokens", () => {
    expect(bearerMatches("Bearer abc", "abc")).toBe(true);
    expect(bearerMatches("Bearer abd", "abc")).toBe(false);
    expect(bearerMatches("abc", "abc")).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches(null, "abc")).toBe(false);
    expect(bearerMatches("Bearer abc", undefined)).toBe(false);
  });
});

describe("fillCohorts", async () => {
  const { fillCohorts } = await import("./league.ts");
  it("fills the emptiest cohort of the same tier first, then opens new ones", () => {
    const existing = [
      { leagueId: "b1", tier: "BRONZE" as const, cohort: 1, size: 29 },
      { leagueId: "b2", tier: "BRONZE" as const, cohort: 2, size: 27 },
      { leagueId: "s1", tier: "SILVER" as const, cohort: 1, size: 30 },
    ];
    const r = fillCohorts(existing, [
      { userId: "x", tier: "BRONZE" },
      { userId: "y", tier: "SILVER" },
    ], "2026-10-05");
    expect(r.joins).toEqual([{ leagueId: "b2", userId: "x" }]);
    expect(r.creates).toEqual([{ tier: "SILVER", cohort: 2, userIds: ["y"] }]);
  });
  it("behaves like assignCohorts on an empty week", () => {
    const r = fillCohorts([], [{ userId: "a", tier: "GOLD" }], "2026-10-05");
    expect(r).toEqual({ joins: [], creates: [{ tier: "GOLD", cohort: 1, userIds: ["a"] }] });
  });
});
