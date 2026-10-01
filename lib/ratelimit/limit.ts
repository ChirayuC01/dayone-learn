// Fixed-window rate limiting backed by Postgres, so limits hold across every app instance.
import type { PrismaClient } from "@prisma/client";

export type Rule = { limit: number; windowSeconds: number };

export const RULES = {
  ingest: { limit: 120, windowSeconds: 60 }, // per token
  cron: { limit: 30, windowSeconds: 60 },
  emailSignIn: { limit: 5, windowSeconds: 15 * 60 }, // per email address
  emailSignInIp: { limit: 20, windowSeconds: 15 * 60 }, // per client IP (offices and campuses share one)
  reading: { limit: 40, windowSeconds: 60 }, // heartbeats every 15 s leave plenty of headroom
  review: { limit: 10, windowSeconds: 60 },
  admin: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, Rule>;

/** Start of the window containing `now`. */
export function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** Seconds until the window containing `now` ends (for Retry-After). */
export function retryAfter(now: Date, windowSeconds: number): number {
  return Math.max(1, Math.ceil((windowStart(now, windowSeconds).getTime() + windowSeconds * 1000 - now.getTime()) / 1000));
}

/** Counts this request and says whether it is allowed. One atomic upsert per call. */
export async function hit(db: PrismaClient, key: string, rule: Rule, now = new Date()) {
  const start = windowStart(now, rule.windowSeconds);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${start}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return { allowed: count <= rule.limit, count, retryAfter: retryAfter(now, rule.windowSeconds) };
}

/** Drops windows older than a day. Called from the hourly cron. */
export async function prune(db: PrismaClient, now = new Date()) {
  return db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } });
}

/** The client IP behind a proxy (first X-Forwarded-For entry), for keys of anonymous requests. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
