import Link from "next/link";
import { NavLink } from "./NavLink";

export function SiteHeader() {
  return (
    <header className="sitebar">
      <Link className="brand" href="/">
        <span className="brand-mark">d1</span>
        <span className="brand-name">DayOne</span>
      </Link>
      <nav aria-label="Site">
        <NavLink href="/courses" matchSubpaths>
          Courses
        </NavLink>
      </nav>
    </header>
  );
}
