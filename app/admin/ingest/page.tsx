import Link from "next/link";
import { db } from "@/lib/db";

type Props = { searchParams: Promise<{ course?: string; status?: string }> };

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function IngestLogPage({ searchParams }: Props) {
  const { course, status } = await searchParams;
  const where = {
    ...(course ? { courseSlug: course } : {}),
    ...(status === "OK" || status === "ERROR" ? { status: status as "OK" | "ERROR" } : {}),
  };
  const [rows, slugs] = await Promise.all([
    db.ingestLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    db.ingestLog.findMany({ distinct: ["courseSlug"], select: { courseSlug: true }, orderBy: { courseSlug: "asc" } }),
  ]);
  const link = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ course, status, ...q }).filter(([, v]) => v) as [string, string][]);
    return `/admin/ingest${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <h1 className="h1">Ingest log</h1>
      <p className="row" style={{ gap: 6 }}>
        <Link className={`chip${!course ? " new" : ""}`} href={link({ course: undefined })}>
          all courses
        </Link>
        {slugs.map((s) => (
          <Link key={s.courseSlug} className={`chip${course === s.courseSlug ? " new" : ""}`} href={link({ course: s.courseSlug })}>
            {s.courseSlug}
          </Link>
        ))}
        <span style={{ width: 12 }} />
        {["OK", "ERROR"].map((st) => (
          <Link key={st} className={`chip${status === st ? " new" : ""}`} href={link({ status: status === st ? undefined : st })}>
            {st}
          </Link>
        ))}
      </p>
      <div className="tbl">
        <table className="lb">
          <thead>
            <tr>
              <th>When (IST)</th>
              <th>Course</th>
              <th>Kind</th>
              <th>Day</th>
              <th>Status</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmt.format(r.createdAt)}</td>
                <td>{r.courseSlug}</td>
                <td>{r.kind}</td>
                <td>{r.day ?? ""}</td>
                <td>
                  <span className={`chip ${r.status === "OK" ? "ok" : "bad"}`}>{r.status}</span>
                </td>
                <td style={{ minWidth: 260, overflowWrap: "anywhere" }}>{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="empty">Nothing logged yet.</div>}
    </>
  );
}
