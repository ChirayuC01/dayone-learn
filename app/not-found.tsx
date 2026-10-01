import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="main">
        <div className="col">
          <div className="eyebrow">404</div>
          <h1 className="h1">Page not found</h1>
          <p className="prose-p">That page doesn&apos;t exist, or the course isn&apos;t published.</p>
          <Link className="btn" href="/courses">
            Browse courses
          </Link>
        </div>
      </main>
    </>
  );
}
