import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInWithEmail, signInWithProvider, signInWithTestProvider } from "@/app/actions/account";
import { providerIds } from "@/auth";
import { getViewer } from "@/lib/learning/learner";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  InvalidEmail: "That doesn't look like an email address.",
  TooManyRequests: "Too many sign-in emails requested. Wait 15 minutes and try again.",
  OAuthAccountNotLinked: "That email is already linked to another sign-in method. Use the one you signed up with.",
  Verification: "That sign-in link has expired or was already used. Ask for a new one.",
  AccessDenied: "Sign-in was cancelled.",
  Configuration: "Sign-in isn't configured correctly on the server.",
};

type Props = { searchParams: Promise<{ callbackUrl?: string; error?: string }> };

export default async function SignIn({ searchParams }: Props) {
  const { callbackUrl: raw, error } = await searchParams;
  const callbackUrl = raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  if (await getViewer()) redirect(callbackUrl);

  return (
    <div className="col" style={{ maxWidth: 420 }}>
      <div className="eyebrow">Welcome</div>
      <h1 className="h1">Sign in</h1>
      <p className="prose-p">Sign in to enroll, take quizzes, and keep your progress and streak on every device.</p>
      {error && (
        <p className="fb-err" role="alert">
          {ERRORS[error] ?? "Something went wrong signing you in. Please try again."}
        </p>
      )}

      <div className="stack">
        {(["github", "google"] as const)
          .filter((p) => providerIds.includes(p))
          .map((p) => (
            <form key={p} action={signInWithProvider}>
              <input type="hidden" name="provider" value={p} />
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <button className="btn ghost wide" type="submit">
                Continue with {p === "github" ? "GitHub" : "Google"}
              </button>
            </form>
          ))}

        {providerIds.includes("test-email") && (
          <form action={signInWithTestProvider} className="stack panel" data-testid="test-signin">
            <p className="note" style={{ margin: 0 }}>
              Test sign-in (AUTH_TEST_PROVIDER=1): the link is kept for the e2e suite instead of being emailed.
            </p>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <label className="field">
              <span>Test email</span>
              <input name="email" type="email" required />
            </label>
            <button className="btn ghost wide" type="submit">
              Test sign-in
            </button>
          </form>
        )}

        <form action={signInWithEmail} className="stack">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </label>
          <button className="btn wide" type="submit">
            Email me a sign-in link
          </button>
        </form>
      </div>
    </div>
  );
}
