// Daily XP goal.
export const GOAL_OPTIONS = [10, 30, 50, 100] as const;
export const DEFAULT_GOAL = 30;

export const isGoalOption = (n: number) => (GOAL_OPTIONS as readonly number[]).includes(n);

/** True when this action takes today's XP from below the target to at or above it. */
export const crossesGoal = (before: number, after: number, target: number) => before < target && after >= target;

export const goalProgress = (xpToday: number, target: number) => Math.min(1, target > 0 ? xpToday / target : 0);
