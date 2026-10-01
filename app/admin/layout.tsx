import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NavLink } from "@/components/NavLink";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/learning/learner";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · DayOne" } };

/** Admin area: ADMIN role only. Everyone else gets a plain 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (viewer?.role !== "ADMIN") notFound();
  return (
    <>
      <SiteHeader />
      <main className="main">
        <div className="col-wide">
          <nav className="track" style={{ maxWidth: 360 }} aria-label="Admin">
            <NavLink href="/admin" className="tab">
              Courses
            </NavLink>
            <NavLink href="/admin/ingest" className="tab">
              Ingest log
            </NavLink>
          </nav>
          {children}
        </div>
      </main>
    </>
  );
}
