import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bearerMatches } from "@/lib/notify/unsubscribe";
import { hit, RULES } from "@/lib/ratelimit/limit";

/** Returns an error response unless the request carries `Authorization: Bearer $CRON_SECRET` (and isn't flooding). */
export async function denyUnlessCron(req: Request): Promise<NextResponse | null> {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await hit(db, `cron:${new URL(req.url).pathname}`, RULES.cron);
  return rl.allowed ? null : NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
}
