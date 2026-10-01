// Public display names: lowercase letters, digits and dashes, 3–24 chars. Shown on leaderboards and profile URLs.
export const DISPLAY_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,22})[a-z0-9]$/;

export const isValidDisplayName = (s: string) => DISPLAY_NAME_RE.test(s) && !s.includes("--");

/** A starting display name from the user's name or email, e.g. "Chirayu Chawande" → "chirayu-chawande". */
export function baseDisplayName(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  const slug = source
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18)
    .replace(/-+$/, "");
  return slug.length >= 3 ? slug : "learner";
}

/** Candidate names to try in order: the base, then base-NNNN with the given random numbers. */
export function displayNameCandidates(base: string, randoms: number[]): string[] {
  return [base, ...randoms.map((r) => `${base}-${String(r % 10000).padStart(4, "0")}`)];
}
