// Read-side queries for content pages. Wrapped in React cache() so a layout and its page share one query.
import { cache } from "react";
import { db } from "@/lib/db";
import type { TrackDef } from "@/lib/ingest/normalize";
import { questionsForTrack } from "@/lib/ingest/normalize";

/** LIVE courses for the catalogue. */
export const getCatalogue = cache(async () => {
  const courses = await db.course.findMany({
    where: { status: "LIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      slug: true,
      title: true,
      tagline: true,
      accent: true,
      icon: true,
      totalDays: true,
      _count: { select: { lessons: true, enrollments: { where: { archivedAt: null } } } },
    },
  });
  return courses.map(({ _count, ...c }) => ({ ...c, published: _count.lessons, enrolled: _count.enrollments }));
});

/**
 * A course with its syllabus and published-lesson index (no lesson bodies, no answers).
 * DRAFT courses are hidden; ARCHIVED stay readable for existing learners.
 */
export const getCourseOutline = cache(async (slug: string) => {
  const course = await db.course.findUnique({
    where: { slug },
    include: {
      modules: {
        orderBy: { number: "asc" },
        include: { _count: { select: { questions: { where: { hidden: false } } } } },
      },
      syllabus: { orderBy: { day: "asc" } },
      lessons: {
        orderBy: { day: "asc" },
        select: {
          id: true,
          day: true,
          title: true,
          trackTitles: true,
          moduleNumber: true,
          _count: { select: { questions: { where: { hidden: false } } } },
        },
      },
      _count: { select: { enrollments: { where: { archivedAt: null } } } },
    },
  });
  if (!course || course.status === "DRAFT") return null;
  const { _count, modules, lessons, ...rest } = course;
  return {
    ...rest,
    lessons: lessons.map(({ _count: l, ...lesson }) => ({ ...lesson, questionCount: l.questions })),
    tracks: course.tracks as TrackDef[],
    enrolled: _count.enrollments,
    modules: modules.map(({ _count: m, ...mod }) => ({ ...mod, testQuestions: m.questions })),
  };
});
export type CourseOutline = NonNullable<Awaited<ReturnType<typeof getCourseOutline>>>;

/** One lesson body plus how many quiz questions each track sees. Answers are never selected here. */
export const getLesson = cache(async (courseId: string, day: number) => {
  const lesson = await db.lesson.findUnique({
    where: { courseId_day: { courseId, day } },
    select: {
      id: true,
      day: true,
      moduleNumber: true,
      title: true,
      trackTitles: true,
      content: true,
      publishedAt: true,
      updatedAt: true,
      questions: { where: { hidden: false }, select: { tracks: true } },
    },
  });
  if (!lesson) return null;
  const { questions, ...rest } = lesson;
  return { ...rest, questionCount: (track: string) => questionsForTrack(questions, track).length };
});

export const getModuleTest = cache(async (courseId: string, number: number) => {
  const mod = await db.module.findUnique({
    where: { courseId_number: { courseId, number } },
    select: { id: true, number: true, title: true, dayFrom: true, dayTo: true, questions: { where: { hidden: false }, select: { tracks: true } } },
  });
  if (!mod) return null;
  const { questions, ...rest } = mod;
  return { ...rest, questionCount: (track: string) => questionsForTrack(questions, track).length };
});
