import { NextResponse } from "next/server";
import { denyUnlessCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { sendReminders } from "@/lib/notify/service";

// Run hourly. Each learner gets at most one reminder a day, in the two hours after their chosen time.
export async function POST(req: Request) {
  const denied = denyUnlessCron(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, reminders: await sendReminders(db) });
}
