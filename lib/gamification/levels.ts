// Levels from total XP. xpForLevel(n) is the total XP needed to go from level n to n + 1:
// level 1 → 2 at 50 XP, 2 → 3 at 150, 3 → 4 at 300, …

export const xpForLevel = (n: number) => (50 * n * (n + 1)) / 2;

export type LevelInfo = { level: number; xp: number; floor: number; next: number; progress: number; toNext: number };

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  // Solve 25 n (n + 1) <= xp for the largest n, then level = n + 1.
  let n = Math.floor((-1 + Math.sqrt(1 + (4 * xp) / 25)) / 2);
  while (xpForLevel(n + 1) <= xp) n++;
  while (n > 0 && xpForLevel(n) > xp) n--;
  const floor = xpForLevel(n);
  const next = xpForLevel(n + 1);
  return { level: n + 1, xp, floor, next, progress: (xp - floor) / (next - floor), toNext: next - xp };
}
