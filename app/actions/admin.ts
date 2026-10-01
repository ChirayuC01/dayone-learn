"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/learning/learner";

async function requireAdmin() {
  const viewer = await getViewer();
  if (viewer?.role !== "ADMIN") notFound();
  return viewer;
}

export async function setCourseStatus(formData: FormData) {
  await requireAdmin();
  const input = z.object({ courseId: z.string().min(1), status: z.enum(["DRAFT", "LIVE", "ARCHIVED"]) }).safeParse({
    courseId: formData.get("courseId"),
    status: formData.get("status"),
  });
  if (!input.success) return;
  const course = await db.course.update({ where: { id: input.data.courseId }, data: { status: input.data.status } });
  await db.ingestLog.create({ data: { courseSlug: course.slug, kind: "COURSE", status: "OK", message: `status set to ${input.data.status} by admin` } });
  revalidatePath("/", "layout");
}

/** Marks a published day as freshly published (publishedAt = now) and records it in the ingest log. */
export async function republishLesson(formData: FormData) {
  const admin = await requireAdmin();
  const lessonId = z.string().min(1).safeParse(formData.get("lessonId"));
  if (!lessonId.success) return;
  const lesson = await db.lesson.update({ where: { id: lessonId.data }, data: { publishedAt: new Date() }, include: { course: { select: { slug: true } } } });
  await db.ingestLog.create({
    data: { courseSlug: lesson.course.slug, kind: "LESSON", day: lesson.day, status: "OK", message: `day ${lesson.day} re-published by ${admin.email ?? "admin"}` },
  });
  revalidatePath("/", "layout");
}

/** Hides a question from quizzes and review (or brings it back). Re-ingesting the quiz keeps the choice. */
export async function setQuestionHidden(formData: FormData) {
  await requireAdmin();
  const input = z.object({ questionId: z.string().min(1), hidden: z.enum(["true", "false"]) }).safeParse({
    questionId: formData.get("questionId"),
    hidden: formData.get("hidden"),
  });
  if (!input.success) return;
  await db.question.update({ where: { id: input.data.questionId }, data: { hidden: input.data.hidden === "true" } });
  revalidatePath("/", "layout");
}
