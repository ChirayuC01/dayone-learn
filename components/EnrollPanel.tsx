import Link from "next/link";
import { enrollAction, unenrollAction, updateEnrollmentAction } from "@/app/actions/enrollment";
import { pad } from "@/lib/content/outline";
import type { CourseOutline } from "@/lib/content/queries";
import { describeNextUnlock } from "@/lib/learning/format";
import type { LearnerView } from "@/lib/learning/learner";

const PACES = [
  { key: "DAILY", label: "Daily", hint: "One new lesson unlocks each day. Best for building the habit." },
  { key: "SELF", label: "Self-paced", hint: "Every published lesson is open. Go as fast as you like." },
] as const;

function TrackChoices({ course, current }: { course: CourseOutline; current: string }) {
  if (course.tracks.length < 2) return <input type="hidden" name="track" value={course.defaultTrack} />;
  return (
    <fieldset className="choices">
      <legend>Track</legend>
      {course.tracks.map((t) => (
        <label key={t.key} className="choice">
          <input type="radio" name="track" value={t.key} defaultChecked={t.key === current} />
          <span>{t.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function PaceChoices({ current }: { current: "DAILY" | "SELF" }) {
  return (
    <fieldset className="choices">
      <legend>Pace</legend>
      {PACES.map((p) => (
        <label key={p.key} className="choice">
          <input type="radio" name="pace" value={p.key} defaultChecked={p.key === current} />
          <span>
            {p.label}
            <small>{p.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function EnrollPanel({ course, learner, continueTo }: { course: CourseOutline; learner: LearnerView; continueTo: number | null }) {
  const { viewer, enrollment, active } = learner;
  const callback = `/courses/${course.slug}`;

  if (!viewer) {
    return (
      <section className="panel" id="enroll">
        <h2>Start this course</h2>
        <p className="prose-p">Sign in to enroll, unlock a lesson a day and keep your progress on every device. Day 01 is free to preview.</p>
        <Link className="btn" href={`/signin?callbackUrl=${encodeURIComponent(callback)}`}>
          Sign in to enroll
        </Link>
      </section>
    );
  }

  if (!active) {
    if (course.status !== "LIVE" && !enrollment) {
      return (
        <section className="panel" id="enroll">
          <h2>Closed to new learners</h2>
          <p className="prose-p" style={{ margin: 0 }}>This course is archived. Learners who already enrolled can still finish it.</p>
        </section>
      );
    }
    return (
      <section className="panel" id="enroll">
        <h2>{enrollment ? "Pick up where you left off" : "Enroll"}</h2>
        <p className="prose-p">
          {enrollment
            ? "Your progress was kept when you unenrolled. Re-enroll to see this course on your dashboard again."
            : "Choose your setup and how fast lessons unlock. You can change both later."}
        </p>
        <form action={enrollAction}>
          <input type="hidden" name="slug" value={course.slug} />
          <TrackChoices course={course} current={enrollment?.track ?? learner.track} />
          <PaceChoices current={enrollment?.pace ?? "DAILY"} />
          <button className="btn" type="submit">
            {enrollment ? "Re-enroll" : "Enroll"}
          </button>
        </form>
      </section>
    );
  }

  const trackLabel = course.tracks.find((t) => t.key === learner.track)?.label;
  const started = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: learner.tz }).format(
    active.startedAt,
  );

  return (
    <section className="panel" id="enroll">
      <div className="eyebrow">
        <span>Enrolled {started}</span>
        <span>{active.pace === "DAILY" ? "Daily pace" : "Self-paced"}</span>
        {course.tracks.length > 1 && <span>{trackLabel}</span>}
      </div>
      <div className="row" style={{ justifyContent: "space-between", margin: "10px 0 4px" }}>
        <p className="prose-p" style={{ margin: 0 }}>
          {learner.next ? describeNextUnlock(learner.next, learner.today, learner.tz) : null}
        </p>
        {continueTo && (
          <Link className="btn" href={`/learn/${course.slug}/day/${pad(continueTo)}`}>
            Continue Day {pad(continueTo)}
          </Link>
        )}
      </div>

      <details style={{ marginTop: 14 }}>
        <summary className="note" style={{ cursor: "pointer", fontWeight: 700 }}>
          Course settings
        </summary>
        <form action={updateEnrollmentAction} style={{ marginTop: 12 }}>
          <input type="hidden" name="slug" value={course.slug} />
          <TrackChoices course={course} current={learner.track} />
          <PaceChoices current={active.pace} />
          <p className="note" style={{ marginTop: 0 }}>
            Switching to daily pace keeps every lesson that is open now; the next one unlocks tomorrow.
          </p>
          <button className="btn" type="submit">
            Save
          </button>
        </form>
        <form action={unenrollAction} style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <input type="hidden" name="slug" value={course.slug} />
          <p className="note" style={{ marginTop: 0 }}>
            Unenrolling hides the course from your dashboard. Your progress and XP are kept, and you can re-enroll any time.
          </p>
          <button className="btn ghost" type="submit">
            Unenroll
          </button>
        </form>
      </details>
    </section>
  );
}
