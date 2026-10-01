import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pad, parseDayParam } from "@/lib/content/outline";
import { getCourseOutline, getModuleTest } from "@/lib/content/queries";
import { currentTrack } from "@/lib/content/track";

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
  const track = await currentTrack(course);
  const questions = mod.questionCount(track);

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
      {questions === 0 ? (
        <div className="empty">This test unlocks when the module&apos;s review lesson is published.</div>
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
              <span className="note">Sign in to take the test and save your score.</span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
