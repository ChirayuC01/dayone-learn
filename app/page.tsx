import { db } from "@/lib/db";

// Phase 1 placeholder: proves the schema, seed and design tokens are wired up. Replaced by the catalogue in phase 2.
export const dynamic = "force-dynamic";

export default async function Home() {
  const courses = await db.course.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { lessons: true, questions: true } } },
  });

  return (
    <main className="mx-auto max-w-[72ch] px-4 py-8 sm:px-6">
      <div className="font-mono text-xs font-semibold uppercase tracking-[.08em] text-muted">Phase 1 · scaffold</div>
      <h1 className="mt-2.5 mb-4 font-display text-[clamp(28px,5vw,42px)] leading-[1.08] font-extrabold tracking-[-.02em]">
        DayOne
      </h1>
      <p>Database connected. Seeded courses:</p>
      <ul className="mt-4 grid gap-2 p-0">
        {courses.map((c) => (
          <li key={c.id} className="flex list-none items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3.5 py-2.5">
            <span>
              <span className="mr-2 rounded px-1.5 py-0.5 font-mono text-[13px] font-semibold" style={{ background: c.accent, color: "var(--accent-ink)" }}>
                {c.icon}
              </span>
              <b>{c.title}</b> <span className="text-sm text-muted">· {c.status}</span>
            </span>
            <span className="rounded-full border border-line px-2 font-mono text-[11px] font-semibold text-muted tabular-nums">
              {c._count.lessons}/{c.totalDays} days · {c._count.questions} questions
            </span>
          </li>
        ))}
        {courses.length === 0 && (
          <li className="list-none rounded-[10px] border border-dashed border-line p-4 text-muted">No courses yet. Run npm run db:seed.</li>
        )}
      </ul>
    </main>
  );
}
