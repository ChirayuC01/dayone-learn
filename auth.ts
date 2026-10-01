import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { testAuthEnabled, testEmailProvider } from "@/lib/auth/test-provider";
import { db } from "@/lib/db";
import { magicLinkEmail, sendEmail } from "@/lib/email";
import { baseDisplayName, displayNameCandidates } from "@/lib/users/displayName";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const providers: Provider[] = [];
// GitHub and Google only return verified emails, so linking them to an existing account with the same email is safe.
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub({ allowDangerousEmailAccountLinking: true }));
if (process.env.AUTH_GOOGLE_ID) providers.push(Google({ allowDangerousEmailAccountLinking: true }));
providers.push(
  Resend({
    apiKey: process.env.RESEND_API_KEY ?? "dev",
    from: process.env.EMAIL_FROM,
    async sendVerificationRequest({ identifier, url }) {
      await sendEmail({ to: identifier, ...magicLinkEmail(url, new URL(url).host) });
    },
  }),
);

if (testAuthEnabled()) providers.push(testEmailProvider());

/** Which providers are configured, for the sign-in page. */
export const providerIds = providers.map((p) => (typeof p === "function" ? p().id : p.id));

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers,
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email", error: "/signin" },
  callbacks: {
    session({ session, user }) {
      const u = user as typeof user & {
        role: "USER" | "ADMIN";
        displayName: string | null;
        timezone: string;
        timezoneConfirmed: boolean;
      };
      session.user.id = u.id;
      session.user.role = u.role;
      session.user.displayName = u.displayName;
      session.user.timezone = u.timezone;
      session.user.timezoneConfirmed = u.timezoneConfirmed;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      const base = baseDisplayName(user.name, user.email);
      const randoms = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10000));
      for (const displayName of displayNameCandidates(base, randoms)) {
        const taken = await db.user.findUnique({ where: { displayName }, select: { id: true } });
        if (taken) continue;
        await db.user.update({
          where: { id: user.id },
          data: {
            displayName,
            role: user.email && adminEmails.includes(user.email.toLowerCase()) ? "ADMIN" : "USER",
          },
        });
        return;
      }
    },
    async signIn({ user }) {
      // Promote an existing account if its email was added to ADMIN_EMAILS later.
      if (user.id && user.email && adminEmails.includes(user.email.toLowerCase())) {
        await db.user.updateMany({ where: { id: user.id, role: "USER" }, data: { role: "ADMIN" } });
      }
    },
  },
});
