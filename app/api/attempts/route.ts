import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { QuizError, submitAttempt } from "@/lib/quiz/service";

const body = z.object({
  scope: z.enum(["LESSON", "MODULE"]),
  refId: z.string().min(1).max(40),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(40),
        value: z.union([z.number().int().min(0).max(9), z.string().max(500), z.null()]),
      }),
    )
    .max(50),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in to take quizzes." }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });

  try {
    const result = await submitAttempt(db, { userId: session.user.id, timezone: session.user.timezone, ...parsed.data });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof QuizError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
