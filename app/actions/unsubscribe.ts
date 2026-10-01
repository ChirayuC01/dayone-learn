"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/notify/unsubscribe";

export async function confirmUnsubscribe(formData: FormData) {
  const [u, k, t] = ["u", "k", "t"].map((x) => String(formData.get(x) ?? ""));
  if (!verifyUnsubscribe(process.env.AUTH_SECRET ?? "", u!, k!, t!)) redirect("/unsubscribe?invalid=1");
  await db.user.updateMany({ where: { id: u }, data: k === "reminder" ? { reminderEnabled: false } : { weeklySummary: false } });
  redirect(`/unsubscribe?done=${k}`);
}
