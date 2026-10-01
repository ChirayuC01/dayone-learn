import { notFound } from "next/navigation";
import { Sidebar } from "@/components/learn/Sidebar";
import { getCourseOutline } from "@/lib/content/queries";
import { accentStyle } from "@/lib/content/theme";
import { getCourseProgress, learnerView } from "@/lib/learning/learner";

export default async function LearnLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const course = await getCourseOutline((await params).slug);
  if (!course) notFound();
  const learner = await learnerView(course);
  const scores = learner.active ? await getCourseProgress(learner.active.userId, course.id) : null;

  return (
    <div className="app course-theme" style={accentStyle(course.accent)}>
      <Sidebar course={course} learner={learner} scores={scores} />
      <main className="main">
        <div className="col">{children}</div>
      </main>
    </div>
  );
}
