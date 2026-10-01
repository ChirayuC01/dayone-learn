import { describe, expect, it } from "vitest";
import { clientIp, retryAfter, windowStart } from "./limit.ts";

describe("rate limit windows", () => {
  it("aligns windows to their size", () => {
    expect(windowStart(new Date("2026-10-01T10:00:42.500Z"), 60).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(windowStart(new Date("2026-10-01T10:14:59Z"), 900).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(windowStart(new Date("2026-10-01T10:15:00Z"), 900).toISOString()).toBe("2026-10-01T10:15:00.000Z");
  });
  it("computes Retry-After", () => {
    expect(retryAfter(new Date("2026-10-01T10:00:42.500Z"), 60)).toBe(18);
    expect(retryAfter(new Date("2026-10-01T10:00:59.999Z"), 60)).toBe(1);
  });
  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
