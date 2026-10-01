import { describe, expect, it } from "vitest";
import {
  addDays,
  dateColumn,
  daysBetween,
  fromDateColumn,
  isValidTimeZone,
  localDate,
  nextDailyTime,
  tzOffsetMinutes,
  zonedTimeToUtc,
} from "./zoned.ts";

const at = (iso: string) => new Date(iso);

describe("localDate", () => {
  it("gives different calendar days for the same instant in different zones", () => {
    const instant = at("2026-10-01T20:00:00Z");
    expect(localDate(instant, "UTC")).toBe("2026-10-01");
    expect(localDate(instant, "Asia/Kolkata")).toBe("2026-10-02"); // 01:30 next day
    expect(localDate(instant, "America/Los_Angeles")).toBe("2026-10-01"); // 13:00
    expect(localDate(instant, "Pacific/Kiritimati")).toBe("2026-10-02"); // UTC+14
    expect(localDate(instant, "Pacific/Pago_Pago")).toBe("2026-10-01"); // UTC-11
  });

  it("handles a half-hour zone at the midnight boundary", () => {
    expect(localDate(at("2026-10-01T18:29:59Z"), "Asia/Kolkata")).toBe("2026-10-01");
    expect(localDate(at("2026-10-01T18:30:00Z"), "Asia/Kolkata")).toBe("2026-10-02");
  });

  it("is right on both sides of a DST change", () => {
    // New York springs forward 2026-03-08 at 02:00 local (07:00Z)
    expect(localDate(at("2026-03-08T04:59:00Z"), "America/New_York")).toBe("2026-03-07"); // 23:59 EST
    expect(localDate(at("2026-03-08T05:00:00Z"), "America/New_York")).toBe("2026-03-08"); // 00:00 EST
    expect(localDate(at("2026-03-09T03:59:00Z"), "America/New_York")).toBe("2026-03-08"); // 23:59 EDT
    expect(localDate(at("2026-03-09T04:00:00Z"), "America/New_York")).toBe("2026-03-09"); // 00:00 EDT
  });
});

describe("calendar arithmetic", () => {
  it("counts calendar days, not 24-hour blocks, across DST", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // 47 hours in New York
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2); // 49 hours in New York
    expect(daysBetween("2026-10-05", "2026-10-01")).toBe(-4);
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2028-02-01", "2028-03-01")).toBe(29);
  });

  it("round-trips @db.Date columns", () => {
    expect(fromDateColumn(dateColumn("2026-10-01"))).toBe("2026-10-01");
  });

  it("validates time zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("zoned times", () => {
  it("knows offsets including DST", () => {
    expect(tzOffsetMinutes(at("2026-01-15T12:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(tzOffsetMinutes(at("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(tzOffsetMinutes(at("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
  });

  it("converts a wall-clock time to an instant", () => {
    expect(zonedTimeToUtc("2026-10-02", "04:30", "Asia/Kolkata").toISOString()).toBe("2026-10-01T23:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-01", "09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-01", "09:00", "Europe/London").toISOString()).toBe("2026-01-01T09:00:00.000Z");
  });

  it("moves a time skipped by spring-forward to after the gap", () => {
    // London skips 01:00–02:00 on 2026-03-29
    expect(zonedTimeToUtc("2026-03-29", "01:30", "Europe/London").toISOString()).toBe("2026-03-29T01:30:00.000Z"); // = 02:30 BST
  });

  it("uses the first occurrence of a repeated fall-back time", () => {
    // New York repeats 01:00–02:00 on 2026-11-01; first 01:30 is EDT (05:30Z)
    expect(zonedTimeToUtc("2026-11-01", "01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("finds the next daily ingest time", () => {
    const ist = "Asia/Kolkata";
    // 03:00 IST → today 04:30 IST
    expect(nextDailyTime(at("2026-10-01T21:30:00Z"), "04:30", ist).toISOString()).toBe("2026-10-01T23:00:00.000Z");
    // 05:00 IST → tomorrow 04:30 IST
    expect(nextDailyTime(at("2026-10-01T23:30:00Z"), "04:30", ist).toISOString()).toBe("2026-10-02T23:00:00.000Z");
    // exactly at the time → the next day (strictly after)
    expect(nextDailyTime(at("2026-10-01T23:00:00Z"), "04:30", ist).toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });
});
