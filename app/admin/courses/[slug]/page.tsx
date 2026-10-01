import Link from "next/link";
import { notFound } from "next/navigation";
import { republishLesson } from "@/app/actions/admin";
import { pad } from "@/lib/content/outline";
import { db } from "@/lib/db";
import type { TrackDef } from "@/lib/ingest/normalize";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function AdminCourse({ params }: { params: Promise<{ slug: string }> }) {
  const course = await db.course.findUnique({
    where: { slug: (await params).slug },
    include: {
      lessons: { orderBy: { day: "asc" }, include: { questions: { select: { hidden: true } } } },
      modules: { orderBy: { number: "asc" }, include: { questions: { select: { hidden: true } } } },
    },
  });
  if (!course) notFound();
  const tracks = course.tracks as TrackDef[];
  const base = `/admin/courses/${course.slug}`;

  return (
    <>
      <div className="eyebrow">
        <span>{course.slug}</span>
        <span>{course.status}</span>
        <span>
          {course.lessons.length}/{course.totalDays} published
        </span>
        {course.status !== "DRAFT" && <Link href={`/courses/${course.slug}`}>Public page</Link>}
      </div>
      <h1 className="h1">{course.title}</h1>

      <h2 className="sec-h">Lessons</h2>
      <div className="tbl">
        <table className="lb">
          <thead>
            <tr>
              <th>Day</th>
              <th>Title</th>
              <th>Published (IST)</th>
              <th>Questions</th>
              <th>Preview</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {course.lessons.map((l) => {
              const hidden = l.questions.filter((q) => q.hidden).length;
              return (
                <tr key={l.id}>
                  <td>{pad(l.day)}</td>
                  <td style={{ minWidth: 200 }}>{l.title}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {fmt.format(l.publishedAt)}
                    {l.updatedAt.getTime() - l.publishedAt.getTime() > 60_000 && <div className="note">updated {fmt.format(l.updatedAt)}</div>}
                  </td>
                  <td>
                    <Link href={`${base}/day/${pad(l.day)}`}>
                      {l.questions.length - hidden}
                      {hidden ? ` (+${hidden} hidden)` : ""}
                    </Link>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {tracks.map((t) => (
                      <Link key={t.key} className="chip" style={{ marginRight: 4 }} href={`${base}/day/${pad(l.day)}?track=${t.key}`}>
                        {t.key}
                      </Link>
                    ))}
                  </td>
                  <td>
                    <form action={republishLesson}>
                      <input type="hidden" name="lessonId" value={l.id} />
                      <button className="chip" type="submit" title="Set the publish time to now and log it">
                        Re-publish
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {course.lessons.length === 0 && <div className="empty">No lessons published yet.</div>}

      <h2 className="sec-h">Module tests</h2>
      <div className="tbl">
        <table className="lb">
          <thead>
            <tr>
              <th>Module</th>
              <th>Days</th>
              <th>Questions</th>
            </tr>
          </thead>
          <tbody>
            {course.modules.map((m) => {
              const hidden = m.questions.filter((q) => q.hidden).length;
              return (
                <tr key={m.id}>
                  <td>
                    M{m.number} · {m.title}
                  </td>
                  <td>
                    {pad(m.dayFrom)}–{pad(m.dayTo)}
                  </td>
                  <td>
                    {m.questions.length ? (
                      <Link href={`${base}/module/${m.number}`}>
                        {m.questions.length - hidden}
                        {hidden ? ` (+${hidden} hidden)` : ""}
                      </Link>
                    ) : (
                      <span className="note">none yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
