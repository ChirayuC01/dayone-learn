import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { lessonMarkdown, lessonTitle, neighbours, pad, parseDayParam, readingMinutes } from "@/lib/content/outline";
import { getCourseOutline, getLesson } from "@/lib/content/queries";
import { currentTrack } from "@/lib/content/track";

type Params = { params: Promise<{ slug: string; nn: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, nn } = await params;
  const course = await getCourseOutline(slug);
  const day = parseDayParam(nn);
  if (!course || !day) return {};
  const title = course.lessons.find((l) => l.day === day)?.title ?? course.syllabus.find((s) => s.day === day)?.title;
  return { title: `Day ${pad(day)}: ${title ?? ""} · ${course.title}` };
}

export default async function LessonPage({ params }: Params) {
  const { slug, nn } = await params;
  const course = await getCourseOutline(slug);
  const day = parseDayParam(nn);
  if (!course || !day || day > course.totalDays) notFound();
  if (nn !== pad(day)) redirect(`/learn/${slug}/day/${pad(day)}`);

  const track = await currentTrack(course);
  const planned = course.syllabus.find((s) => s.day === day);
  const mod = course.modules.find((m) => m.number === planned?.moduleNumber);
  const trackLabel = course.tracks.find((t) => t.key === track)?.label;
  const lesson = await getLesson(course.id, day);

  const eyebrow = (minutes?: number) => (
    <div className="eyebrow">
      <span>
        Day <b>{pad(day)}</b> of {course.totalDays}
      </span>
      {mod && (
        <span>
          Module {mod.number} · {mod.title}
        </span>
      )}
      {course.tracks.length > 1 && <span>{trackLabel}</span>}
      {minutes && <span>~{minutes} min</span>}
    </div>
  );

  if (!lesson) {
    return (
      <>
        {eyebrow()}
        <h1 className="h1">{planned?.title}</h1>
        <div className="empty">This lesson hasn&apos;t been published yet. It arrives on its scheduled morning.</div>
      </>
    );
  }

  const md = lessonMarkdown(lesson.content, track, course.defaultTrack);
  const questions = lesson.questionCount(track);
  const { prev, next } = neighbours(
    course.lessons.map((l) => l.day),
    day,
  );
  const titleOf = (d: number) => {
    const l = course.lessons.find((x) => x.day === d);
    return l ? lessonTitle(l, track) : "";
  };
  const isReviewDay = mod?.dayTo === day && mod.testQuestions > 0;
  const base = `/learn/${slug}`;

  return (
    <>
      {eyebrow(readingMinutes(md))}
      <h1 className="h1">{lessonTitle(lesson, track)}</h1>
      <article className="lesson">
        <Markdown>{md}</Markdown>
      </article>

      <section className="quiz" id="quiz" aria-labelledby="quiz-h">
        <div className="quiz-h">
          <h2 id="quiz-h">Check yourself</h2>
          <p>
            Day {pad(day)} quiz · {questions} {questions === 1 ? "question" : "questions"}
          </p>
        </div>
        <div className="quiz-f">
          <span className="note">Sign in to take the quiz and save your score.</span>
        </div>
      </section>

      {isReviewDay && mod && (
        <div className="next" style={{ marginTop: 24 }}>
          <div>
            <div className="eyebrow">Module {mod.number} complete</div>
            <div className="t">Take the Module {mod.number} test</div>
            <div className="s">Questions from every lesson in {mod.title}.</div>
          </div>
          <Link className="btn" href={`${base}/module/${mod.number}`}>
            Start test
          </Link>
        </div>
      )}

      <nav className="pager" aria-label="Lessons">
        {prev ? (
          <Link href={`${base}/day/${pad(prev)}`}>
            <span>← Day {pad(prev)}</span>
            {titleOf(prev)}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`${base}/day/${pad(next)}`} style={{ textAlign: "right" }}>
            <span>Day {pad(next)} →</span>
            {titleOf(next)}
          </Link>
        )}
      </nav>
    </>
  );
}
