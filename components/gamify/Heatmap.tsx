import type { HeatDay } from "@/lib/gamification/heatmap";
import { heatLevel } from "@/lib/gamification/heatmap";

const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const OPACITY = [0, 0.35, 0.55, 0.78, 1];

/** Activity calendar: one column per week, Monday at the top. Each day takes the colour of its main course. */
export function Heatmap({ weeks, courses }: { weeks: (HeatDay | null)[][]; courses: Map<string, { title: string; accent: string }> }) {
  const label = (d: HeatDay) => {
    const when = fmt.format(new Date(`${d.date}T12:00:00Z`));
    if (d.frozen && !d.xp) return `${when}: streak freeze used`;
    if (!d.xp) return `${when}: no activity`;
    const parts = d.byCourse.map((c) => `${courses.get(c.courseId)?.title ?? "Course"} ${c.xp}`);
    return `${when}: ${d.xp} XP${parts.length ? ` (${parts.join(", ")})` : ""}`;
  };
  return (
    <div className="heat-wrap">
      <div className="heat" role="img" aria-label="Activity over the last weeks">
        {weeks.map((w, i) => (
          <div className="heat-col" key={i}>
            {w.map((d, j) => {
              if (!d) return <span key={j} className="heat-cell future" />;
              const main = [...d.byCourse].sort((a, b) => b.xp - a.xp)[0];
              const color = (main && courses.get(main.courseId)?.accent) || "var(--accent)";
              const lvl = heatLevel(d.xp);
              return (
                <span
                  key={j}
                  className={`heat-cell${d.frozen && !d.xp ? " frozen" : ""}`}
                  title={label(d)}
                  style={lvl ? { background: color, opacity: OPACITY[lvl] } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="heat-legend note">
        Less <span className="heat-cell" /> {[1, 2, 3, 4].map((l) => <span key={l} className="heat-cell" style={{ background: "var(--accent)", opacity: OPACITY[l] }} />)} More ·{" "}
        <span className="heat-cell frozen" /> freeze
      </div>
    </div>
  );
}
