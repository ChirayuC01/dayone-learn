import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackToggle } from "@/components/TrackToggle";
import { buildOutline, pad } from "@/lib/content/outline";
import { getCourseOutline } from "@/lib/content/queries";
import { accentStyle } from "@/lib/content/theme";
import { currentTrack } from "@/lib/content/track";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const course = await getCourseOutline((await params).slug);
  return course ? { title: course.title, description: course.tagline } : {};
}

export default async function CourseOverview({ params }: Params) {
  const course = await getCourseOutline((await params).slug);
  if (!course) notFound();
  const track = await currentTrack(course);
  const outline = buildOutline({ modules: course.modules, syllabus: course.syllabus, lessons: course.lessons }, track);
  const published = course.lessons.length;
  const first = course.lessons[0];
  const latest = course.lessons.at(-1);
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

      {course.tracks.length > 1 && (
        <>
          <h2 className="sec-h">Track</h2>
          <p className="prose-p">Every lesson comes in {course.tracks.length} versions. Pick the one that matches your setup; you can switch any time.</p>
          <div style={{ maxWidth: 420 }}>
            <TrackToggle slug={course.slug} tracks={course.tracks} current={track} />
          </div>
        </>
      )}

      {first ? (
        <div className="next">
          <div>
            <div className="eyebrow">Start here · Day {pad(first.day)}</div>
            <div className="t">{outline.flatMap((m) => m.days).find((d) => d.day === first.day)?.title}</div>
            {latest && latest.day !== first.day && <div className="s">Latest: Day {pad(latest.day)}</div>}
          </div>
          <Link className="btn" href={`${base}/day/${pad(first.day)}`}>
            Open lesson
          </Link>
        </div>
      ) : (
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
          {m.days.map((d) =>
            d.state === "published" ? (
              <Link key={d.day} className="day" href={`${base}/day/${pad(d.day)}`}>
                <span className="n">{pad(d.day)}</span>
                <span>{d.title}</span>
              </Link>
            ) : (
              <span key={d.day} className="day locked">
                <span className="n">{pad(d.day)}</span>
                <span>{d.title}</span>
                <span className="chip">upcoming</span>
              </span>
            ),
          )}
          {m.hasTest && (
            <Link className="mtest" href={`${base}/module/${m.number}`}>
              <span className="n">★</span>
              <span>Module {m.number} test</span>
              <span className="chip new">test</span>
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
