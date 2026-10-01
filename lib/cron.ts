import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/notify/unsubscribe";

/** Returns a 401 response unless the request carries `Authorization: Bearer $CRON_SECRET`. */
export function denyUnlessCron(req: Request): NextResponse | null {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  return bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
