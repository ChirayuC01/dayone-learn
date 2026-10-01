"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { confirmTimezone } from "@/app/actions/account";

/** Rendered only until the user's zone is confirmed: reports the browser's zone once, then refreshes. */
export function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    confirmTimezone(tz).then(() => router.refresh());
  }, [router]);
  return null;
}
