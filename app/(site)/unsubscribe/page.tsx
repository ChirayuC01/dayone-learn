import type { Metadata } from "next";
import Link from "next/link";
import { confirmUnsubscribe } from "@/app/actions/unsubscribe";
import { verifyUnsubscribe } from "@/lib/notify/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe" };

const LABEL: Record<string, string> = { reminder: "streak reminder emails", weekly: "weekly summary emails" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// A confirm button (not a plain GET) so link scanners in mail clients can't unsubscribe anyone.
export default async function Unsubscribe({ searchParams }: Props) {
  const { u = "", k = "", t = "", done, invalid } = await searchParams;
  const valid = verifyUnsubscribe(process.env.AUTH_SECRET ?? "", u, k, t);
  return (
    <div className="col" style={{ maxWidth: 480 }}>
      <div className="eyebrow">Email preferences</div>
      {done ? (
        <>
          <h1 className="h1">You&apos;re unsubscribed</h1>
          <p className="prose-p">We won&apos;t send you {LABEL[done] ?? "these emails"} any more. You can turn them back on in settings.</p>
          <Link className="btn ghost" href="/settings">
            Settings
          </Link>
        </>
      ) : valid && !invalid ? (
        <>
          <h1 className="h1">Unsubscribe?</h1>
          <p className="prose-p">Stop {LABEL[k]}.</p>
          <form action={confirmUnsubscribe}>
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="k" value={k} />
            <input type="hidden" name="t" value={t} />
            <button className="btn" type="submit">
              Unsubscribe
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="h1">Link not valid</h1>
          <p className="prose-p">This unsubscribe link is incomplete or has been changed. You can manage emails in settings.</p>
          <Link className="btn ghost" href="/settings">
            Settings
          </Link>
        </>
      )}
    </div>
  );
}
