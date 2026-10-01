import Link from "next/link";
import { notFound } from "next/navigation";
import { QuestionTable } from "@/components/admin/QuestionTable";
import { Markdown } from "@/components/Markdown";
import { lessonMarkdown, lessonTitle, pad, parseDayParam, resolveTrack } from "@/lib/content/outline";
import { accentStyle } from "@/lib/content/theme";
import { db } from "@/lib/db";
import type { TrackDef } from "@/lib/ingest/normalize";

type Props = { params: Promise<{ slug: string; nn: string }>; searchParams: Promise<{ track?: string }> };

/** Admin preview of a lesson on any track (works for DRAFT courses too), with every question and its answer. */
export default async function AdminLesson({ params, searchParams }: Props) {
  const { slug, nn } = await params;
  const day = parseDayParam(nn);
  const course = await db.course.findUnique({ where: { slug } });
  if (!course || !day) notFound();
  const lesson = await db.lesson.findUnique({ where: { courseId_day: { courseId: course.id, day } }, include: { questions: { orderBy: { order: "asc" } } } });
  if (!lesson) notFound();
  const tracks = course.tracks as TrackDef[];
  const track = resolveTrack(tracks, course.defaultTrack, (await searchParams).track);
  const md = lessonMarkdown(lesson.content, track, course.defaultTrack);
  const hasTrack = Boolean((lesson.content as Record<string, string>)[track]);

  return (
    <div className="course-theme" style={accentStyle(course.accent)}>
      <div className="eyebrow">
        <Link href={`/admin/courses/${slug}`}>← {course.title}</Link>
        <span>Day {pad(day)}</span>
      </div>
      <h1 className="h1">{lessonTitle(lesson, track)}</h1>
      <nav className="track" style={{ maxWidth: 420 }} aria-label="Track">
        {tracks.map((t) => (
          <Link key={t.key} href={`?track=${t.key}`} className="tab" aria-current={t.key === track ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {!hasTrack && <p className="fb-err">This lesson has no {track} version; learners on it see the {course.defaultTrack} text.</p>}

      <h2 className="sec-h">Quiz</h2>
      <QuestionTable questions={lesson.questions} />

      <h2 className="sec-h">Preview</h2>
      <div className="col" style={{ margin: 0 }}>
        <article className="lesson">
          <Markdown>{md}</Markdown>
        </article>
      </div>
    </div>
  );
}
