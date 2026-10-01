"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/learning/learner";
import { isValidTimeZone } from "@/lib/time/zoned";

/** Only same-site paths are allowed as a post-sign-in destination. */
const safeCallback = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";

export async function signInWithProvider(formData: FormData) {
  const provider = z.enum(["github", "google"]).safeParse(formData.get("provider"));
  if (!provider.success) return;
  await signIn(provider.data, { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signInWithEmail(formData: FormData) {
  const email = z.email().max(254).safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  if (!email.success) redirect(`/signin?error=InvalidEmail&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  try {
    await signIn("resend", { email: email.data, redirectTo: callbackUrl, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) redirect(`/signin?error=${err.type}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    throw err;
  }
  redirect("/signin/check-email");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

/** Called once after first sign-in with the browser's zone; later changes go through settings. */
export async function confirmTimezone(tz: string) {
  const viewer = await getViewer();
  if (!viewer || viewer.timezoneConfirmed) return;
  await db.user.update({
    where: { id: viewer.id },
    data: { timezoneConfirmed: true, ...(isValidTimeZone(tz) ? { timezone: tz } : {}) },
  });
}
