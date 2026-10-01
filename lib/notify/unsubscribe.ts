// Signed one-click unsubscribe links (no sign-in needed). HMAC-SHA256 over user id and email kind.
import { createHmac, timingSafeEqual } from "node:crypto";

export type EmailKind = "reminder" | "weekly";

export function unsubscribeToken(secret: string, userId: string, kind: EmailKind): string {
  return createHmac("sha256", secret).update(`unsubscribe:${userId}:${kind}`).digest("base64url");
}

export function verifyUnsubscribe(secret: string, userId: string, kind: string, token: string): kind is EmailKind {
  if (kind !== "reminder" && kind !== "weekly") return false;
  const expected = Buffer.from(unsubscribeToken(secret, userId, kind));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(appUrl: string, secret: string, userId: string, kind: EmailKind): string {
  const u = new URL("/unsubscribe", appUrl);
  u.searchParams.set("u", userId);
  u.searchParams.set("k", kind);
  u.searchParams.set("t", unsubscribeToken(secret, userId, kind));
  return u.toString();
}

/** Constant-time check of an `Authorization: Bearer …` header against a secret. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
