import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { TrackToggle } from "@/components/TrackToggle";
import { buildOutline, pad } from "@/lib/content/outline";
import type { CourseOutline } from "@/lib/content/queries";
import { Drawer } from "./Drawer";

export function CourseBrand({ course }: { course: Pick<CourseOutline, "slug" | "title" | "icon"> }) {
  return (
    <Link className="brand" href={`/courses/${course.slug}`}>
      <span className="brand-mark">{course.icon}</span>
      <span className="brand-name">{course.title}</span>
    </Link>
  );
}

export function Sidebar({ course, track }: { course: CourseOutline; track: string }) {
  const outline = buildOutline({ modules: course.modules, syllabus: course.syllabus, lessons: course.lessons }, track);
  const base = `/learn/${course.slug}`;

  return (
    <Drawer brand={<CourseBrand course={course} />}>
      <CourseBrand course={course} />
      <TrackToggle slug={course.slug} tracks={course.tracks} current={track} />
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
          {m.days.map((d) =>
            d.state === "published" ? (
              <NavLink key={d.day} className="day" href={`${base}/day/${pad(d.day)}`}>
                <span className="n">{pad(d.day)}</span>
                <span>{d.title}</span>
              </NavLink>
            ) : (
              <span key={d.day} className="day locked" aria-disabled="true" title="Not published yet">
                <span className="n">{pad(d.day)}</span>
                <span>{d.title}</span>
              </span>
            ),
          )}
          {m.hasTest && (
            <NavLink className="mtest" href={`${base}/module/${m.number}`}>
              <span className="n">★</span>
              <span>Module {m.number} test</span>
              <span className="chip new">test</span>
            </NavLink>
          )}
        </div>
      ))}
    </Drawer>
  );
}
