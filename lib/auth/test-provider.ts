// E2E-only sign-in: an email-link provider that keeps the link in memory instead of sending it.
// It exists only when AUTH_TEST_PROVIDER=1. Never set that in a real deployment.
import type { EmailConfig } from "next-auth/providers";

export const testAuthEnabled = () => process.env.AUTH_TEST_PROVIDER === "1";

const store = globalThis as unknown as { __dayoneTestLinks?: Map<string, string> };
const links = () => (store.__dayoneTestLinks ??= new Map());

export const latestTestLink = (email: string) => links().get(email.toLowerCase()) ?? null;

export function testEmailProvider(): EmailConfig {
  if (process.env.NODE_ENV === "production") console.warn("[auth] AUTH_TEST_PROVIDER=1: test sign-in is enabled. Never enable it in a real deployment.");
  return {
    id: "test-email",
    type: "email",
    name: "Test sign-in",
    from: "test@localhost",
    maxAge: 10 * 60,
    options: {},
    async sendVerificationRequest({ identifier, url }) {
      links().set(identifier.toLowerCase(), url);
    },
  };
}
