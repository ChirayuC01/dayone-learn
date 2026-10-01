"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { GOAL_OPTIONS } from "@/lib/gamification/goal";
import { getViewer } from "@/lib/learning/learner";
import { isValidTimeZone } from "@/lib/time/zoned";
import { isValidDisplayName } from "@/lib/users/displayName";

const checkbox = z.preprocess((v) => v === "on", z.boolean());
const settings = z.object({
  displayName: z.string().trim().toLowerCase().refine(isValidDisplayName, "3–24 lowercase letters, digits or single dashes"),
  timezone: z.string().refine(isValidTimeZone, "unknown time zone"),
  dailyGoal: z.coerce.number().refine((n) => (GOAL_OPTIONS as readonly number[]).includes(n)),
  reminderEnabled: checkbox,
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weeklySummary: checkbox,
  leagueOptOut: checkbox,
  allTimeBoardOptIn: checkbox,
  profilePublic: checkbox,
});

export async function saveSettings(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=/settings");
  const keys = Object.keys(settings.shape);
  const parsed = settings.safeParse(Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? undefined])));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    redirect(`/settings?error=${encodeURIComponent(`${String(issue?.path[0] ?? "")}: ${issue?.message ?? "invalid"}`)}`);
  }
  const { dailyGoal, ...user } = parsed.data;
  const taken = await db.user.findFirst({ where: { displayName: user.displayName, NOT: { id: viewer.id } }, select: { id: true } });
  if (taken) redirect(`/settings?error=${encodeURIComponent("displayName: that name is taken")}`);

  await db.$transaction([
    db.user.update({ where: { id: viewer.id }, data: { ...user, timezoneConfirmed: true } }),
    db.dailyGoal.upsert({ where: { userId: viewer.id }, create: { userId: viewer.id, targetXp: dailyGoal }, update: { targetXp: dailyGoal } }),
  ]);
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

/** Deletes the account and everything tied to it (every relation cascades from User). */
export async function deleteAccount(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    redirect(`/settings?error=${encodeURIComponent("Type delete to confirm account deletion")}#delete`);
  }
  await db.user.delete({ where: { id: viewer.id } });
  await signOut({ redirectTo: "/?deleted=1" });
}
