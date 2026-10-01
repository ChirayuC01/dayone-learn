import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInWithEmail, signInWithProvider } from "@/app/actions/account";
import { providerIds } from "@/auth";
import { getViewer } from "@/lib/learning/learner";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  InvalidEmail: "That doesn't look like an email address.",
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
