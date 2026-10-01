import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { TrackToggle } from "@/components/TrackToggle";
import { buildOutline } from "@/lib/content/outline";
import type { CourseOutline } from "@/lib/content/queries";
import { relativeDay } from "@/lib/learning/format";
import type { LearnerView, Score } from "@/lib/learning/learner";
import { unlocksOn } from "@/lib/learning/unlock";
import { DayRow } from "./DayRow";
import { Drawer } from "./Drawer";
import { ScoreChip } from "./ScoreChip";

export function CourseBrand({ course }: { course: Pick<CourseOutline, "slug" | "title" | "icon"> }) {
  return (
    <Link className="brand" href={`/courses/${course.slug}`}>
      <span className="brand-mark">{course.icon}</span>
      <span className="brand-name">{course.title}</span>
    </Link>
  );
}

/** Chip text for a locked day, e.g. "tomorrow" or "Mon 5 Oct". */
export function lockChip(learner: LearnerView, day: number) {
  return learner.unlock ? relativeDay(unlocksOn(learner.unlock, day), learner.today).replace(/^on /, "") : undefined;
}

export type CourseScores = { lessons: Map<number, Score>; modules: Map<number, Score & { passed: boolean }> };

export function Sidebar({ course, learner, scores }: { course: CourseOutline; learner: LearnerView; scores: CourseScores | null }) {
  const questionCount = new Map(course.lessons.map((l) => [l.day, l.questionCount]));
  const outline = buildOutline(course, learner.track, (d, p) => (p ? learner.access(d) : "upcoming"));
  const base = `/learn/${course.slug}`;

  return (
    <Drawer brand={<CourseBrand course={course} />}>
      <CourseBrand course={course} />
      <TrackToggle slug={course.slug} tracks={course.tracks} current={learner.track} />
      {learner.viewer ? (
        <NavLink className="nav-home" href="/dashboard">
          Dashboard
        </NavLink>
      ) : (
        <NavLink className="nav-home" href={`/signin?callbackUrl=${encodeURIComponent(`/courses/${course.slug}`)}`}>
          Sign in
        </NavLink>
      )}
      <NavLink className="nav-home" href={`/courses/${course.slug}`}>
        Course overview
      </NavLink>
      {outline.map((m) => (
        <div className="mod" key={m.number}>
          <div className="mod-h">
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
              nav
            />
          ))}
          {m.hasTest && (
            <NavLink className={learner.moduleAccess(course.modules.find((x) => x.number === m.number)!) === "open" ? "mtest" : "mtest locked"} href={`${base}/module/${m.number}`}>
              <span className="n">★</span>
              <span>Module {m.number} test</span>
              {scores?.modules.get(m.number) ? <ScoreChip {...scores.modules.get(m.number)!} /> : <span className="chip new">test</span>}
            </NavLink>
          )}
        </div>
      ))}
    </Drawer>
  );
}
