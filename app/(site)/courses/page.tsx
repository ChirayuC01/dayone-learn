import type { Metadata } from "next";
import { CourseCard } from "@/components/CourseCard";
import { getCatalogue } from "@/lib/content/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Courses" };

export default async function Catalogue() {
  const courses = await getCatalogue();
  return (
    <div className="col-wide">
      <div className="eyebrow">
        <span>Catalogue</span>
      </div>
      <h1 className="h1">Courses</h1>
      <p className="lead">Each course is a short lesson a day with a quiz at the end. New lessons are published every morning.</p>
      {courses.length ? (
        <div className="cards">
          {courses.map((c) => (
            <CourseCard key={c.slug} {...c} />
          ))}
        </div>
      ) : (
        <div className="empty">No courses are live yet.</div>
      )}
    </div>
  );
}
