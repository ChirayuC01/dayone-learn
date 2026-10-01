import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollPanel } from "@/components/EnrollPanel";
import { DayRow } from "@/components/learn/DayRow";
import { lockChip } from "@/components/learn/Sidebar";
import { TrackToggle } from "@/components/TrackToggle";
import { buildOutline, pad } from "@/lib/content/outline";
import { getCourseOutline } from "@/lib/content/queries";
import { accentStyle } from "@/lib/content/theme";
import { canRead, continueDay } from "@/lib/learning/access";
import { getCourseProgress, getReadDays, learnerView } from "@/lib/learning/learner";
import { ScoreChip } from "@/components/learn/ScoreChip";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const course = await getCourseOutline((await params).slug);
  return course ? { title: course.title, description: course.tagline } : {};
}

export default async function CourseOverview({ params }: Params) {
  const course = await getCourseOutline((await params).slug);
  if (!course) notFound();
  const learner = await learnerView(course);
  const { track } = learner;
  const outline = buildOutline(course, track, (d, p) => (p ? learner.access(d) : "upcoming"));
  const openDays = learner.published.filter((d) => canRead(learner.access(d)));
  const readDays = learner.active ? await getReadDays(learner.active.userId, course.id) : new Set<number>();
  const continueTo = continueDay(openDays, readDays);
  const scores = learner.active ? await getCourseProgress(learner.active.userId, course.id) : null;
  const questionCount = new Map(course.lessons.map((l) => [l.day, l.questionCount]));
  const published = course.lessons.length;
  const first = course.lessons[0];
  const base = `/learn/${course.slug}`;

  return (
    <div className="col course-theme" style={accentStyle(course.accent)}>
      <div className="eyebrow">
        <span>{course.totalDays}-day course</span>
        <span>
          <b>{published}</b> published
        </span>
        <span>
          {course.enrolled} {course.enrolled === 1 ? "learner" : "learners"}
        </span>
        {course.status === "ARCHIVED" && <span>Archived</span>}
      </div>
      <h1 className="h1">
        <span className="brand-mark" style={{ fontSize: "0.5em", verticalAlign: "middle", marginRight: 12 }}>
          {course.icon}
        </span>
        {course.title}
      </h1>
      {course.tagline && <p className="lead">{course.tagline}</p>}
      {course.description && <p className="prose-p">{course.description}</p>}

      <div className="stats">
        <div className="stat">
          <div className="v">
            {published}
            <small>/{course.totalDays}</small>
          </div>
          <div className="l">Lessons out</div>
          <div className="bar">
            <i style={{ width: `${(100 * published) / course.totalDays}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="v">{course.modules.length}</div>
          <div className="l">Modules</div>
        </div>
        <div className="stat">
          <div className="v">{course.modules.filter((m) => m.testQuestions > 0).length}</div>
          <div className="l">Module tests out</div>
        </div>
      </div>

      <EnrollPanel course={course} learner={learner} continueTo={continueTo} />

      {!learner.active && first && (
        <div className="next">
          <div>
            <div className="eyebrow">Free preview · Day {pad(first.day)}</div>
            <div className="t">{outline.flatMap((m) => m.days).find((d) => d.day === first.day)?.title}</div>
            {course.tracks.length > 1 && <div className="s">Showing the {course.tracks.find((t) => t.key === track)?.label} version.</div>}
          </div>
          <Link className="btn ghost" href={`${base}/day/${pad(first.day)}`}>
            Read Day {pad(first.day)}
          </Link>
        </div>
      )}
      {!learner.active && course.tracks.length > 1 && (
        <div style={{ maxWidth: 420 }}>
          <TrackToggle slug={course.slug} tracks={course.tracks} current={track} />
        </div>
      )}
      {!first && (
        <div className="empty" style={{ margin: "8px 0 32px" }}>
          The first lesson hasn&apos;t been published yet.
        </div>
      )}

      <h2 className="sec-h">Syllabus</h2>
      {outline.map((m) => (
        <section className="syl" key={m.number} aria-labelledby={`m${m.number}`}>
          <div className="mod-h" id={`m${m.number}`}>
            <span>
              M{m.number} · {m.title}
            </span>
            <span>
              {m.published}/{m.days.length}
            </span>
          </div>
          {m.days.map((d) => (
            <DayRow
              key={d.day}
              slug={course.slug}
              day={d}
              chip={lockChip(learner, d.day)}
              score={scores?.lessons.get(d.day)}
              quiz={Boolean(scores && questionCount.get(d.day))}
            />
          ))}
          {m.hasTest && (
            <Link
              className={learner.moduleAccess(course.modules.find((x) => x.number === m.number)!) === "open" ? "mtest" : "mtest locked"}
              href={`${base}/module/${m.number}`}
            >
              <span className="n">★</span>
              <span>Module {m.number} test</span>
              {scores?.modules.get(m.number) ? <ScoreChip {...scores.modules.get(m.number)!} /> : <span className="chip new">test</span>}
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
