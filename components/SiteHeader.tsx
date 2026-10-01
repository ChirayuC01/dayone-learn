import Link from "next/link";
import { signOutAction } from "@/app/actions/account";
import { getViewer } from "@/lib/learning/learner";
import { NavLink } from "./NavLink";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="sitebar">
      <Link className="brand" href={viewer ? "/dashboard" : "/"}>
        <span className="brand-mark">d1</span>
        <span className="brand-name">DayOne</span>
      </Link>
      <nav aria-label="Site">
        {viewer && <NavLink href="/dashboard">Dashboard</NavLink>}
        <NavLink href="/courses" matchSubpaths>
          Courses
        </NavLink>
        {viewer ? (
          <form action={signOutAction}>
            <button type="submit" className="navbtn" title={`Signed in as ${viewer.displayName ?? viewer.email ?? ""}`}>
              Sign out
            </button>
          </form>
        ) : (
          <NavLink href="/signin">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}
