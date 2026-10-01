import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { submitReview } from "@/lib/review/service";
import { QuizError } from "@/lib/quiz/errors";

const body = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(40),
        value: z.union([z.number().int().min(0).max(9), z.string().max(500), z.null()]),
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in to review." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  try {
    return NextResponse.json(await submitReview(db, { userId: session.user.id, timezone: session.user.timezone, ...parsed.data }));
  } catch (err) {
    if (err instanceof QuizError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
