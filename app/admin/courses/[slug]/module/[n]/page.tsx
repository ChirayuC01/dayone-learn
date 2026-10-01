import Link from "next/link";
import { notFound } from "next/navigation";
import { QuestionTable } from "@/components/admin/QuestionTable";
import { parseDayParam } from "@/lib/content/outline";
import { db } from "@/lib/db";

export default async function AdminModule({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const number = parseDayParam(n);
  const course = await db.course.findUnique({ where: { slug } });
  if (!course || !number) notFound();
  const mod = await db.module.findUnique({
    where: { courseId_number: { courseId: course.id, number } },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!mod) notFound();
  return (
    <>
      <div className="eyebrow">
        <Link href={`/admin/courses/${slug}`}>← {course.title}</Link>
      </div>
      <h1 className="h1">
        Module {mod.number} test: {mod.title}
      </h1>
      <QuestionTable questions={mod.questions} />
    </>
  );
}
