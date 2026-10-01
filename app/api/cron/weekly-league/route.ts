import { NextResponse } from "next/server";
import { denyUnlessCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { addDays } from "@/lib/time/zoned";
import { runLeagueWeek } from "@/lib/league/service";
import { sendWeeklySummaries } from "@/lib/notify/service";

// Run every Monday 00:00 IST (Sunday 18:30 UTC). Safe to run again: finished weeks and placed users are skipped.
export async function POST(req: Request) {
  const denied = denyUnlessCron(req);
  if (denied) return denied;
  const league = await runLeagueWeek(db);
  const summaries = await sendWeeklySummaries(db, addDays(league.weekStart, -7));
  return NextResponse.json({ ok: true, league, summaries });
}
