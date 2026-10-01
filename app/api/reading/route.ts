import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { readingEvent } from "@/lib/learning/reading";

const body = z.object({ lessonId: z.string().min(1).max(40), event: z.enum(["start", "beat", "finish"]) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await readingEvent(db, { userId: session.user.id, timezone: session.user.timezone, ...parsed.data });
  return NextResponse.json(result, { status: result.status === "forbidden" ? 403 : 200 });
}
