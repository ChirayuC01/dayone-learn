import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/learning/learner";
import { allTimeBoard, myStanding } from "@/lib/league/service";

export const metadata: Metadata = { title: "Leaderboard" };

const tierName = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

function timeLeft(end: Date, now = new Date()) {
  const h = Math.max(0, Math.round((end.getTime() - now.getTime()) / 3_600_000));
  return h >= 48 ? `${Math.floor(h / 24)} days` : `${h} hours`;
}

type Props = { searchParams: Promise<{ board?: string }> };

export default async function Leaderboard({ searchParams }: Props) {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=/leaderboard");
  const board = (await searchParams).board === "all" ? "all" : "week";

  return (
    <div className="col">
      <div className="eyebrow">Leaderboard</div>
      <h1 className="h1">{board === "week" ? "This week's league" : "All-time XP"}</h1>
      <nav className="track" style={{ maxWidth: 360 }} aria-label="Board">
        <Link href="/leaderboard" className="tab" aria-current={board === "week" ? "page" : undefined}>
          Weekly league
        </Link>
        <Link href="/leaderboard?board=all" className="tab" aria-current={board === "all" ? "page" : undefined}>
          All-time
        </Link>
      </nav>
      {board === "week" ? <Weekly userId={viewer.id} /> : <AllTime userId={viewer.id} />}
    </div>
  );
}

async function Weekly({ userId }: { userId: string }) {
  const s = await myStanding(db, userId);
  if (s.status === "opted-out") {
    return (
      <div className="empty">
        You&apos;ve left weekly leagues. <Link href="/settings">Rejoin in settings</Link>.
      </div>
    );
  }
  if (s.status === "inactive") {
    return <div className="empty">Earn some XP to join this week&apos;s league. Leagues are for learners active in the last 14 days.</div>;
  }
  return (
    <>
      <p className="prose-p">
        <b>
          {tierName(s.tier)} league
        </b>{" "}
        · resets in {timeLeft(s.endsAt)} (Monday 00:00 IST). You&apos;re <b>#{s.me.rank}</b> with {s.me.weeklyXp} XP
        {s.toPromotion === 0 ? " and in the promotion zone." : s.toPromotion ? `, ${s.toPromotion} XP from promotion.` : "."}
      </p>
      <div className="tbl">
        <table className="lb">
          <thead>
            <tr>
              <th>#</th>
              <th>Learner</th>
              <th>XP this week</th>
              <th>
                <span className="sr-only">Zone</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.rank} className={`${r.me ? "me " : ""}${r.zone.toLowerCase()}`}>
                <td>{r.rank}</td>
                <td>
                  {r.displayName}
                  {r.me ? " (you)" : ""}
                </td>
                <td>{r.weeklyXp}</td>
                <td>{r.zone === "PROMOTED" ? "▲" : r.zone === "DEMOTED" ? "▼" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Cohorts of up to 30 in your tier. ▲ top places move up a league, ▼ bottom places move down (not in Bronze). Only
        display names are shown.
      </p>
    </>
  );
}

async function AllTime({ userId }: { userId: string }) {
  const [rows, me] = await Promise.all([allTimeBoard(db), db.user.findUniqueOrThrow({ where: { id: userId }, select: { allTimeBoardOptIn: true } })]);
  return (
    <>
      {!me.allTimeBoardOptIn && (
        <p className="prose-p">
          You&apos;re not on this board. <Link href="/settings">Opt in from settings</Link>.
        </p>
      )}
      {rows.length === 0 ? (
        <div className="empty">Nobody has opted in yet.</div>
      ) : (
        <div className="tbl">
          <table className="lb">
            <thead>
              <tr>
                <th>#</th>
                <th>Learner</th>
                <th>Total XP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className={r.userId === userId ? "me" : undefined}>
                  <td>{r.rank}</td>
                  <td>{r.displayName}</td>
                  <td>{r.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
