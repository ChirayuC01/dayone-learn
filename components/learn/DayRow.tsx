import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { pad, type OutlineDay } from "@/lib/content/outline";
import type { Score } from "@/lib/learning/learner";
import { ScoreChip } from "./ScoreChip";

/**
 * One syllabus row. `chip` is shown for locked days (e.g. when it unlocks), `score` for attempted
 * quizzes, and `quiz` marks an open day whose quiz the learner hasn't tried. `nav` marks the current page.
 */
export function DayRow({
  slug,
  day,
  chip,
  score,
  quiz = false,
  nav = false,
}: {
  slug: string;
  day: OutlineDay;
  chip?: string;
  score?: Score;
  quiz?: boolean;
  nav?: boolean;
}) {
  const inner = (
    <>
      <span className="n">{pad(day.day)}</span>
      <span>{day.title}</span>
      {day.access === "preview" && <span className="chip">preview</span>}
      {day.access === "open" && (score ? <ScoreChip {...score} /> : quiz && <span className="chip new">quiz</span>)}
      {day.access === "locked" && chip && <span className="chip">{chip}</span>}
      {day.access === "enroll" && <span className="chip" aria-label="Enroll to unlock">🔒</span>}
      {day.access === "upcoming" && !nav && <span className="chip">upcoming</span>}
    </>
  );
  if (day.access === "upcoming") {
    return (
      <span className="day locked" title="Not published yet">
        {inner}
      </span>
    );
  }
  const href = `/learn/${slug}/day/${pad(day.day)}`;
  const className = day.access === "open" || day.access === "preview" ? "day" : "day locked";
  return nav ? (
    <NavLink className={className} href={href}>
      {inner}
    </NavLink>
  ) : (
    <Link className={className} href={href}>
      {inner}
    </Link>
  );
}
