import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LockedLesson } from "@/components/learn/LockedLesson";
import { Markdown } from "@/components/Markdown";
import { Quiz } from "@/components/quiz/Quiz";
import { lessonMarkdown, lessonTitle, neighbours, pad, parseDayParam, readingMinutes } from "@/lib/content/outline";
import { getCourseOutline, getLesson } from "@/lib/content/queries";
import { db } from "@/lib/db";
import { canRead } from "@/lib/learning/access";
import { describeNextUnlock } from "@/lib/learning/format";
import { learnerView } from "@/lib/learning/learner";
import { publicQuestions } from "@/lib/quiz/service";

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

  const learner = await learnerView(course);
  const { track } = learner;
  const access = learner.access(day);
  const planned = course.syllabus.find((s) => s.day === day);
  const mod = course.modules.find((m) => m.number === planned?.moduleNumber);
  const trackLabel = course.tracks.find((t) => t.key === track)?.label;
  const summary = course.lessons.find((l) => l.day === day);
  const base = `/learn/${slug}`;

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

  if (access === "upcoming") {
    return (
      <>
        {eyebrow()}
        <h1 className="h1">{planned?.title}</h1>
        <div className="empty">This lesson hasn&apos;t been published yet. It arrives on its scheduled morning.</div>
      </>
    );
  }

  if (!canRead(access)) {
    return (
      <>
        {eyebrow()}
        <h1 className="h1">{summary ? lessonTitle(summary, track) : planned?.title}</h1>
        <LockedLesson slug={slug} day={day} learner={learner} />
      </>
    );
  }

  const lesson = await getLesson(course.id, day);
  if (!lesson) notFound();
  if (learner.active && learner.active.currentDay !== day) {
    await db.enrollment.update({ where: { id: learner.active.id }, data: { currentDay: day } });
  }

  const progress = learner.active
    ? await db.lessonProgress.findUnique({ where: { userId_lessonId: { userId: learner.active.userId, lessonId: lesson.id } } })
    : null;
  const md = lessonMarkdown(lesson.content, track, course.defaultTrack);
  const questions = lesson.questionCount(track);
  // The pager only links days this viewer can open.
  const readable = course.lessons.map((l) => l.day).filter((d) => canRead(learner.access(d)));
  const { prev, next } = neighbours(readable, day);
  const titleOf = (d: number) => {
    const l = course.lessons.find((x) => x.day === d);
    return l ? lessonTitle(l, track) : "";
  };
  const isReviewDay = mod?.dayTo === day && mod.testQuestions > 0 && learner.moduleAccess(mod) === "open";

  return (
    <>
      {eyebrow(readingMinutes(md))}
      <h1 className="h1">{lessonTitle(lesson, track)}</h1>
      <article className="lesson">
        <Markdown>{md}</Markdown>
      </article>

      {learner.active ? (
        <Quiz
          scope="LESSON"
          refId={lesson.id}
          title="Check yourself"
          subtitle={`Day ${pad(day)} quiz`}
          questions={await publicQuestions(db, "LESSON", lesson.id, track)}
          best={progress && progress.attempts > 0 ? { score: progress.bestScore, total: progress.total } : null}
        />
      ) : (
        <section className="quiz" id="quiz" aria-labelledby="quiz-h">
          <div className="quiz-h">
            <h2 id="quiz-h">Check yourself</h2>
            <p>
              Day {pad(day)} quiz · {questions} {questions === 1 ? "question" : "questions"}
            </p>
          </div>
          <div className="quiz-f">
            <span className="note">Enroll to take the quiz and save your score.</span>
            <Link
              className="btn"
              href={learner.viewer ? `/courses/${slug}#enroll` : `/signin?callbackUrl=${encodeURIComponent(`/courses/${slug}`)}`}
            >
              {learner.viewer ? "Enroll" : "Sign in to enroll"}
            </Link>
          </div>
        </section>
      )}

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
      {learner.next && learner.next.kind !== "complete" && !next && (
        <p className="note" style={{ textAlign: "right" }}>
          {describeNextUnlock(learner.next, learner.today, learner.tz)}
        </p>
      )}
    </>
  );
}
