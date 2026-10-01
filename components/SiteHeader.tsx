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
        {viewer && <NavLink href="/review">Review</NavLink>}
        <NavLink href="/courses" matchSubpaths>
          Courses
        </NavLink>
        {viewer ? (
          <details className="acct">
            <summary>Account ▾</summary>
            <div className="acct-menu">
              {viewer.displayName && <Link href={`/profile/${viewer.displayName}`}>Profile</Link>}
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/settings">Settings</Link>
              {viewer.role === "ADMIN" && <Link href="/admin">Admin</Link>}
              <form action={signOutAction}>
                <button type="submit" className="navbtn">
                  Sign out
                </button>
              </form>
            </div>
          </details>
        ) : (
          <NavLink href="/signin">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}
