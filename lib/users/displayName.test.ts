import { describe, expect, it } from "vitest";
import { baseDisplayName, displayNameCandidates, isValidDisplayName } from "./displayName.ts";

describe("display names", () => {
  it("derives a slug from the name, then the email", () => {
    expect(baseDisplayName("Chirayu Chawande", "x@y.z")).toBe("chirayu-chawande");
    expect(baseDisplayName(null, "dev.ops+news@example.com")).toBe("dev-ops-news");
    expect(baseDisplayName("Zoë O'Brien")).toBe("zoe-o-brien");
    expect(baseDisplayName("李", null)).toBe("learner");
    expect(baseDisplayName("ab", null)).toBe("learner");
    expect(baseDisplayName("A very long name that keeps going")).toBe("a-very-long-name-t");
  });

  it("produces valid candidates with numeric suffixes", () => {
    const c = displayNameCandidates("chirayu", [42, 123456]);
    expect(c).toEqual(["chirayu", "chirayu-0042", "chirayu-3456"]);
    expect(c.every(isValidDisplayName)).toBe(true);
  });

  it("validates", () => {
    expect(isValidDisplayName("ok-name")).toBe(true);
    expect(isValidDisplayName("No-Caps")).toBe(false);
    expect(isValidDisplayName("-dash")).toBe(false);
    expect(isValidDisplayName("double--dash")).toBe(false);
    expect(isValidDisplayName("ab")).toBe(false);
    expect(isValidDisplayName("a".repeat(25))).toBe(false);
  });
});
