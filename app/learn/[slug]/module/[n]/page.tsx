import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pad, parseDayParam } from "@/lib/content/outline";
import { getCourseOutline, getModuleTest } from "@/lib/content/queries";
import Link from "next/link";
import { Quiz } from "@/components/quiz/Quiz";
import { db } from "@/lib/db";
import { learnerView } from "@/lib/learning/learner";
import { MODULE_PASS_RATIO } from "@/lib/quiz/progress";
import { publicQuestions } from "@/lib/quiz/service";

type Params = { params: Promise<{ slug: string; n: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, n } = await params;
  const course = await getCourseOutline(slug);
  const mod = course?.modules.find((m) => String(m.number) === n);
  return course && mod ? { title: `Module ${mod.number} test · ${course.title}` } : {};
}

export default async function ModuleTestPage({ params }: Params) {
  const { slug, n } = await params;
  const course = await getCourseOutline(slug);
  const number = parseDayParam(n);
  if (!course || !number) notFound();
  const mod = await getModuleTest(course.id, number);
  if (!mod) notFound();
  const learner = await learnerView(course);
  const questions = mod.questionCount(learner.track);
  const outlineMod = course.modules.find((m) => m.number === mod.number)!;
  const access = learner.moduleAccess(outlineMod);
  const progress = learner.active
    ? await db.moduleProgress.findUnique({ where: { userId_moduleId: { userId: learner.active.userId, moduleId: mod.id } } })
    : null;

  return (
    <>
      <div className="eyebrow">
        <span>Module test</span>
        <span>
          Days {pad(mod.dayFrom)}–{pad(mod.dayTo)}
        </span>
      </div>
      <h1 className="h1">
        Module {mod.number}: {mod.title}
      </h1>
      {access === "upcoming" || questions === 0 ? (
        <div className="empty">This test unlocks when the module&apos;s review lesson is published.</div>
      ) : access === "enroll" ? (
        <div className="lockbox">
          <div className="t">Enroll to take this test</div>
          <p className="prose-p">Module tests are part of the course. Enroll to take them and earn XP.</p>
          <Link
            className="btn"
            href={learner.viewer ? `/courses/${slug}#enroll` : `/signin?callbackUrl=${encodeURIComponent(`/courses/${slug}`)}`}
          >
            {learner.viewer ? "Enroll" : "Sign in to enroll"}
          </Link>
        </div>
      ) : access === "locked" ? (
        <div className="lockbox">
          <div className="t">Opens with Day {pad(mod.dayTo)}</div>
          <p className="prose-p">Take this test after the module&apos;s review day. It covers every lesson in the module.</p>
        </div>
      ) : (
        <>
          <p className="prose-p">
            This test mixes questions from every lesson in the module. Take it after the review day, and retake it as
            often as you like: your best score counts. You need {Math.round(MODULE_PASS_RATIO * 100)}% to pass.
          </p>
          <Quiz
            scope="MODULE"
            refId={mod.id}
            title={`Module ${mod.number} test`}
            subtitle="Covers the whole module"
            questions={await publicQuestions(db, "MODULE", mod.id, learner.track)}
            best={progress && progress.attempts > 0 ? { score: progress.bestScore, total: progress.total } : null}
            passRatio={MODULE_PASS_RATIO}
          />
          {progress?.passedAt && <p className="note">Passed. Your best score counts.</p>}
        </>
      )}
    </>
  );
}
