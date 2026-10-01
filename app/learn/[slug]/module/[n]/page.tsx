import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pad, parseDayParam } from "@/lib/content/outline";
import { getCourseOutline, getModuleTest } from "@/lib/content/queries";
import Link from "next/link";
import { learnerView } from "@/lib/learning/learner";

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
            often as you like: your best score counts. You need 70% to pass.
          </p>
          <section className="quiz" aria-labelledby="quiz-h">
            <div className="quiz-h">
              <h2 id="quiz-h">Module {mod.number} test</h2>
              <p>Covers the whole module · {questions} questions</p>
            </div>
            <div className="quiz-f">
              <span className="note">Tests arrive in the next update.</span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
