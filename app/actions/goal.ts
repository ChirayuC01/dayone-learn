"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { GOAL_OPTIONS } from "@/lib/gamification/goal";
import { getViewer } from "@/lib/learning/learner";

const target = z.coerce.number().refine((n) => (GOAL_OPTIONS as readonly number[]).includes(n));

export async function setDailyGoal(formData: FormData) {
  const viewer = await getViewer();
  const parsed = target.safeParse(formData.get("target"));
  if (!viewer || !parsed.success) return;
  await db.dailyGoal.upsert({ where: { userId: viewer.id }, create: { userId: viewer.id, targetXp: parsed.data }, update: { targetXp: parsed.data } });
  revalidatePath("/dashboard");
}
