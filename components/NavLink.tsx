"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/** A Link that sets aria-current="page" when it matches the current path (or a sub-path, with `matchSubpaths`). */
export function NavLink({
  href,
  matchSubpaths = false,
  ...props
}: ComponentProps<typeof Link> & { href: string; matchSubpaths?: boolean }) {
  const path = usePathname();
  const active = path === href || (matchSubpaths && path.startsWith(href + "/"));
  return <Link href={href} aria-current={active ? "page" : undefined} {...props} />;
}
