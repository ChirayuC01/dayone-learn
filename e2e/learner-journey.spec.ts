import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../playwright.config";

type SeedQuestion = { type: "mcq" | "cmd" | "text"; q: string; options?: string[]; answer?: number; accept?: string[]; tracks?: string[] };
const day1 = JSON.parse(readFileSync("reference/seed/linux/day-01.json", "utf8")) as { quiz: SeedQuestion[] };
const EMAIL = "e2e-learner@example.com";

async function signIn(page: Page) {
  await page.goto("/signin?callbackUrl=/courses/linux");
  const form = page.getByTestId("test-signin");
  await form.getByLabel("Test email").fill(EMAIL);
  await form.getByRole("button", { name: "Test sign-in" }).click();
  await expect(page).toHaveURL(/\/signin\/check-email/);
  const res = await page.request.get(`/api/test/magic-link?email=${encodeURIComponent(EMAIL)}`);
  expect(res.ok()).toBeTruthy();
  await page.goto((await res.json()).url);
  await expect(page).toHaveURL(/\/courses\/linux/);
}

/** Answers every question correctly, using the seed file as the answer key (matched by prompt). */
async function answerAll(page: Page, quiz: SeedQuestion[]) {
  const byPrompt = new Map(quiz.map((q) => [q.q.replace(/`/g, ""), q]));
  const questions = page.locator(".q");
  const n = await questions.count();
  for (let i = 0; i < n; i++) {
    const box = questions.nth(i);
    const q = byPrompt.get((await box.locator(".q-text").innerText()).trim());
    expect(q, `question ${i + 1} is in the seed`).toBeDefined();
    if (q!.type === "mcq") await box.locator(".opt").nth(q!.answer!).click();
    else await box.locator("input").fill(q!.accept![0]!);
  }
}

test("enroll, read, quiz, earn rewards, then a newly ingested day appears in self-paced mode", async ({ page }) => {
  await signIn(page);

  // Enroll in Linux: WSL track, daily pace.
  const enroll = page.locator("#enroll");
  await enroll.getByLabel("WSL on Windows").check();
  await enroll.getByLabel(/^Daily/).check();
  await enroll.getByRole("button", { name: "Enroll" }).click();
  await expect(page).toHaveURL(/\/learn\/linux\/day\/01/);
  await expect(page.locator("h1")).toHaveText("What Linux is");

  // Read Day 01: reach the end and stay a minute while the heartbeat runs.
  await page.locator(".readmark").scrollIntoViewIfNeeded();
  await expect(page.locator(".readmark")).toHaveText("✓ Lesson read", { timeout: 120_000 });

  // Take the quiz (WSL questions only) and get everything right.
  const wslQuiz = day1.quiz.filter((q) => !q.tracks || q.tracks.includes("wsl"));
  await expect(page.locator(".q")).toHaveCount(wslQuiz.length);
  await answerAll(page, wslQuiz);
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.locator(".result")).toHaveText(`${wslQuiz.length}/${wslQuiz.length} · 100%`);
  // 2 × 5 correct + 10 perfect = 20; with the 10 reading XP that reaches the 30 XP goal, which adds 5.
  await expect(page.locator(".rewards")).toContainText("+25 XP");
  await expect(page.locator(".rewards")).toContainText("Daily goal hit");

  // Dashboard: XP, a 1-day streak and the First Lesson achievement.
  await page.goto("/dashboard");
  await expect(page.locator(".eyebrow").first()).toContainText("35 XP total"); // 10 read + 20 quiz + 5 daily goal
  await expect(page.locator("#streak-h")).toHaveText("1 day");
  await expect(page.locator(".trophies")).toContainText("First Lesson");

  // Day 08 doesn't exist yet.
  await page.goto("/learn/linux/day/08");
  await expect(page.locator(".empty")).toContainText("hasn't been published yet");

  // The scheduled job publishes Day 08 through the ingest API (with curl, as the job does).
  const out = execFileSync("curl", [
    "-sS", "-X", "PUT", `${E2E.baseURL}/api/ingest/courses/linux/lessons/8`,
    "-H", `Authorization: Bearer ${E2E.ingestToken}`,
    "-H", "Content-Type: application/json",
    "--data", "@e2e/fixtures/day-08.json",
  ]).toString();
  expect(JSON.parse(out)).toMatchObject({ ok: true, created: true });

  // On daily pace it is published but still locked today…
  await page.goto("/learn/linux/day/08");
  await expect(page.locator(".lockbox")).toBeVisible();
  await expect(page.locator("article.lesson")).toHaveCount(0);

  // …and switching to self-paced opens it.
  await page.goto("/courses/linux");
  await page.locator("#enroll summary").click();
  await page.locator("#enroll form").filter({ hasText: "Save" }).getByLabel(/^Self-paced/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#enroll .eyebrow")).toContainText("Self-paced");
  await page.goto("/learn/linux/day/08");
  await expect(page.locator("h1")).toHaveText("Copying, moving, and renaming");
  await expect(page.locator("article.lesson")).toContainText("mv is also how you rename");
  await expect(page.locator(".q")).toHaveCount(6);
});
