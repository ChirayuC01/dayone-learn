import { NextResponse } from "next/server";
import { denyUnlessCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { sendReminders } from "@/lib/notify/service";
import { prune } from "@/lib/ratelimit/limit";

// Run hourly. Each learner gets at most one reminder a day, in the two hours after their chosen time.
export async function POST(req: Request) {
  const denied = await denyUnlessCron(req);
  if (denied) return denied;
  const reminders = await sendReminders(db);
  const pruned = await prune(db); // housekeeping: old rate-limit windows
  return NextResponse.json({ ok: true, reminders, rateLimitRowsPruned: pruned.count });
}

// Vercel Cron and some schedulers send GET (with the same Bearer header).
export const GET = POST;
