import Link from "next/link";
import { setCourseStatus } from "@/app/actions/admin";
import { db } from "@/lib/db";

export default async function AdminHome() {
  const since = new Date(Date.now() - 86_400_000);
  const [courses, users, errors] = await Promise.all([
    db.course.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { lessons: true, enrollments: { where: { archivedAt: null } } } } },
    }),
    db.user.count(),
    db.ingestLog.count({ where: { status: "ERROR", createdAt: { gte: since } } }),
  ]);
  return (
    <>
      <h1 className="h1">Courses</h1>
      <p className="prose-p">
        {users} users · {errors ? <Link href="/admin/ingest?status=ERROR">{errors} ingest errors in the last 24 h</Link> : "no ingest errors in the last 24 h"}
      </p>
      <div className="tbl">
        <table className="lb">
          <thead>
            <tr>
              <th>Course</th>
              <th>Published</th>
              <th>Learners</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/courses/${c.slug}`}>
                    <b>{c.title}</b>
                  </Link>
                  <div className="note">{c.slug}</div>
                </td>
                <td>
                  {c._count.lessons}/{c.totalDays}
                </td>
                <td>{c._count.enrollments}</td>
                <td>
                  <form action={setCourseStatus} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <input type="hidden" name="courseId" value={c.id} />
                    <select name="status" defaultValue={c.status} aria-label={`Status of ${c.title}`} className="mini">
                      <option>DRAFT</option>
                      <option>LIVE</option>
                      <option>ARCHIVED</option>
                    </select>
                    <button className="chip" type="submit">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {courses.length === 0 && <div className="empty">No courses yet. Register one with PUT /api/ingest/courses/&lt;slug&gt; (see docs/INGEST.md).</div>}
    </>
  );
}
