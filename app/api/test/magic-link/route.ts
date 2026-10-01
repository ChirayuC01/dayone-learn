import { NextResponse } from "next/server";
import { latestTestLink, testAuthEnabled } from "@/lib/auth/test-provider";

/** E2E only: the latest sign-in link for an email. 404 unless AUTH_TEST_PROVIDER=1. */
export async function GET(req: Request) {
  if (!testAuthEnabled()) return new NextResponse(null, { status: 404 });
  const email = new URL(req.url).searchParams.get("email") ?? "";
  const url = latestTestLink(email);
  return url ? NextResponse.json({ url }) : NextResponse.json({ error: "no link" }, { status: 404 });
}
