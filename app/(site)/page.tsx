import Link from "next/link";
import { CourseCard } from "@/components/CourseCard";
import { getCatalogue } from "@/lib/content/queries";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const courses = await getCatalogue();
  return (
    <div className="col-wide">
      <div className="eyebrow">
        <span>
          <b>{courses.length}</b> {courses.length === 1 ? "course" : "courses"}
        </span>
        <span>15 minutes a day</span>
      </div>
      <h1 className="h1" style={{ maxWidth: "18ch" }}>
        Learn one lesson a day, then prove it.
      </h1>
      <p className="lead">
        Short daily lessons on developer tools, each ending with a quiz. Pick a course, keep your streak, and come back
        tomorrow for the next one.
      </p>
      <p>
        <Link className="btn" href="/courses">
          Browse courses
        </Link>
      </p>

      <h2 className="sec-h">Courses</h2>
      {courses.length ? (
        <div className="cards">
          {courses.map((c) => (
            <CourseCard key={c.slug} {...c} />
          ))}
        </div>
      ) : (
        <div className="empty">No courses are live yet.</div>
      )}

      <h2 className="sec-h">How it works</h2>
      <ol className="steps">
        <li>
          <b>Enroll</b>
          <span>Start any course whenever you like, and pick the track that matches your setup.</span>
        </li>
        <li>
          <b>One lesson a day</b>
          <span>A new lesson unlocks each day, or go at your own pace and open everything that&apos;s published.</span>
        </li>
        <li>
          <b>Prove it</b>
          <span>Every lesson ends with a quiz, and every module ends with a test. Questions you miss come back for review.</span>
        </li>
        <li>
          <b>Build the habit</b>
          <span>Earn XP, keep your streak alive, hit your daily goal and climb the weekly league.</span>
        </li>
      </ol>
    </div>
  );
}
