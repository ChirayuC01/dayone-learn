import type { Rewards } from "@/lib/gamification/service";

/** One line under a quiz result: XP, streak, goal, level and achievements from that action. */
export function RewardsLine({ r }: { r: Rewards }) {
  const bits: string[] = [];
  bits.push(r.xp > 0 ? `+${r.xp} XP` : "No new XP");
  if (r.level.after > r.level.before) bits.push(`Level ${r.level.before} → ${r.level.after}`);
  if (r.streak.extended) bits.push(`🔥 ${r.streak.current}-day streak`);
  if (r.goal.hit) bits.push("🎯 Daily goal hit");
  else bits.push(`Goal ${Math.min(r.goal.xpToday, r.goal.target)}/${r.goal.target}`);
  for (const a of r.achievements) bits.push(`${a.icon} ${a.title}`);
  return <div className="rewards">{bits.map((b, i) => <span key={i}>{b}</span>)}</div>;
}
