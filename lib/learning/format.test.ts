import { describe, expect, it } from "vitest";
import { continueDay } from "./access.ts";
import { clockTime, describeLockedDay, describeNextUnlock, relativeDay } from "./format.ts";

describe("unlock messages", () => {
  it("says today / tomorrow / a date", () => {
    expect(relativeDay("2026-10-01", "2026-10-01")).toBe("today");
    expect(relativeDay("2026-10-02", "2026-10-01")).toBe("tomorrow");
    expect(relativeDay("2026-10-05", "2026-10-01")).toBe("on Mon 5 Oct");
    expect(describeLockedDay("2026-10-02", "2026-10-01")).toBe("Unlocks tomorrow");
  });

  it("describes daily unlocks and completion", () => {
    expect(describeNextUnlock({ kind: "daily", day: 3, on: "2026-10-02" }, "2026-10-01", "UTC")).toBe("Day 03 unlocks tomorrow.");
    expect(describeNextUnlock({ kind: "complete" }, "2026-10-01", "UTC")).toBe("Every lesson is open.");
  });

  it("shows the next ingest in the learner's own time zone", () => {
    const at = new Date("2026-10-02T23:00:00Z"); // 04:30 IST on Oct 3
    expect(describeNextUnlock({ kind: "ingest", day: 8, at }, "2026-10-02", "Asia/Kolkata")).toBe(
      "Next lesson arrives tomorrow at 4:30 AM.",
    );
    // the same ingest is 7:00 PM on Oct 2 in New York (EDT)
    expect(describeNextUnlock({ kind: "ingest", day: 8, at }, "2026-10-02", "America/New_York")).toBe(
      "Next lesson arrives today at 7:00 PM.",
    );
    // in winter New York is EST, so the same 04:30 IST is 6:00 PM
    expect(clockTime(new Date("2026-12-01T23:00:00Z"), "America/New_York")).toBe("6:00 PM");
  });
});

describe("continueDay", () => {
  it("picks the first unread open day, else the last open day", () => {
    expect(continueDay([1, 2, 3], new Set([1]))).toBe(2);
    expect(continueDay([3, 1, 2], new Set([1, 2, 3]))).toBe(3);
    expect(continueDay([], new Set())).toBeNull();
  });
});
