import { notFound } from "next/navigation";
import { Sidebar } from "@/components/learn/Sidebar";
import { getCourseOutline } from "@/lib/content/queries";
import { accentStyle } from "@/lib/content/theme";
import { currentTrack } from "@/lib/content/track";

export default async function LearnLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const course = await getCourseOutline((await params).slug);
  if (!course) notFound();
  const track = await currentTrack(course);

  return (
    <div className="app course-theme" style={accentStyle(course.accent)}>
      <Sidebar course={course} track={track} />
      <main className="main">
        <div className="col">{children}</div>
      </main>
    </div>
  );
}
