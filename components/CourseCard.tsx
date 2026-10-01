import Link from "next/link";
import { accentStyle } from "@/lib/content/theme";

type Props = {
  slug: string;
  title: string;
  tagline: string;
  accent: string;
  icon: string;
  totalDays: number;
  published: number;
  enrolled: number;
};

export function CourseCard(c: Props) {
  return (
    <Link href={`/courses/${c.slug}`} className="card course-theme" style={accentStyle(c.accent)}>
      <span className="brand" style={{ padding: 0 }}>
        <span className="brand-mark">{c.icon}</span>
      </span>
      <span className="t">{c.title}</span>
      <span className="s">{c.tagline}</span>
      <span className="meta">
        <span>
          {c.published}/{c.totalDays} days published
        </span>
        <span>
          {c.enrolled} {c.enrolled === 1 ? "learner" : "learners"}
        </span>
      </span>
      <span className="bar" aria-hidden="true">
        <i style={{ width: `${(100 * c.published) / c.totalDays}%` }} />
      </span>
      <span className="btn" style={{ alignSelf: "flex-start", marginTop: 4 }}>
        View course
      </span>
    </Link>
  );
}
