import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/account";
import { deleteAccount, saveSettings } from "@/app/actions/settings";
import { db } from "@/lib/db";
import { DEFAULT_GOAL, GOAL_OPTIONS } from "@/lib/gamification/goal";
import { getViewer } from "@/lib/learning/learner";

export const metadata: Metadata = { title: "Settings" };

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

export default async function Settings({ searchParams }: Props) {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin?callbackUrl=/settings");
  const { saved, error } = await searchParams;
  const [user, goal] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: viewer.id } }),
    db.dailyGoal.findUnique({ where: { userId: viewer.id } }),
  ]);
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(user.timezone)) zones.unshift(user.timezone);

  return (
    <div className="col">
      <div className="eyebrow">
        <span>Account</span>
        <span>{user.email}</span>
      </div>
      <h1 className="h1">Settings</h1>
      {saved && (
        <p className="fb-ok" role="status">
          Saved.
        </p>
      )}
      {error && (
        <p className="fb-err" role="alert">
          {error}
        </p>
      )}

      <form action={saveSettings} className="settings">
        <fieldset>
          <legend>Profile</legend>
          <label className="field">
            <span>Display name</span>
            <input name="displayName" defaultValue={user.displayName ?? ""} required pattern="[a-z0-9](?:[a-z0-9\-]{1,22})[a-z0-9]" />
            <small className="note">Shown on leaderboards and your profile URL. Lowercase letters, digits and dashes.</small>
          </label>
          <label className="field">
            <span>Time zone</span>
            <select name="timezone" defaultValue={user.timezone}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
            <small className="note">Days, streaks and unlocks follow midnight in this zone.</small>
          </label>
          <label className="check">
            <input type="checkbox" name="profilePublic" defaultChecked={user.profilePublic} />
            <span>
              Public profile
              <small>
                Anyone with the link can see your level, streak, achievements and courses at{" "}
                {user.displayName && <Link href={`/profile/${user.displayName}`}>/profile/{user.displayName}</Link>}.
              </small>
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Goal and emails</legend>
          <label className="field">
            <span>Daily goal</span>
            <select name="dailyGoal" defaultValue={goal?.targetXp ?? DEFAULT_GOAL}>
              {GOAL_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g} XP a day
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" name="reminderEnabled" defaultChecked={user.reminderEnabled} />
            <span>
              Streak reminder
              <small>An email at the time below on days you haven&apos;t learned yet.</small>
            </span>
          </label>
          <label className="field" style={{ maxWidth: 200 }}>
            <span>Reminder time</span>
            <input type="time" name="reminderTime" defaultValue={user.reminderTime} required />
          </label>
          <label className="check">
            <input type="checkbox" name="weeklySummary" defaultChecked={user.weeklySummary} />
            <span>
              Weekly summary
              <small>Your XP, lessons and league result every Monday.</small>
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Leaderboards</legend>
          <label className="check">
            <input type="checkbox" name="leagueOptOut" defaultChecked={user.leagueOptOut} />
            <span>
              Leave weekly leagues
              <small>You won&apos;t be placed in a league or shown on its table.</small>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" name="allTimeBoardOptIn" defaultChecked={user.allTimeBoardOptIn} />
            <span>
              Show me on the all-time XP board
              <small>Only your display name and total XP are shown.</small>
            </span>
          </label>
        </fieldset>

        <button className="btn" type="submit">
          Save settings
        </button>
      </form>

      <h2 className="sec-h">Session</h2>
      <form action={signOutAction}>
        <button className="btn ghost" type="submit">
          Sign out
        </button>
      </form>

      <h2 className="sec-h" id="delete">
        Delete account
      </h2>
      <form action={deleteAccount} className="panel danger">
        <p className="prose-p">
          This permanently deletes your account and all its data: enrollments, progress, quiz attempts, XP, streak,
          achievements, league history and review queue. It can&apos;t be undone.
        </p>
        <label className="field" style={{ maxWidth: 260 }}>
          <span>Type delete to confirm</span>
          <input name="confirm" autoComplete="off" required />
        </label>
        <button className="btn danger" type="submit" style={{ marginTop: 12 }}>
          Delete my account
        </button>
      </form>
    </div>
  );
}
