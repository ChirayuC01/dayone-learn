import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmail() {
  return (
    <div className="col" style={{ maxWidth: 480 }}>
      <div className="eyebrow">Almost there</div>
      <h1 className="h1">Check your email</h1>
      <p className="prose-p">We sent you a sign-in link. It works once and expires in 24 hours.</p>
      {process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY && (
        <p className="note">Development: no RESEND_API_KEY is set, so the link was printed in the server console.</p>
      )}
    </div>
  );
}
