import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      displayName: string | null;
      timezone: string;
      timezoneConfirmed: boolean;
    } & DefaultSession["user"];
  }
}
