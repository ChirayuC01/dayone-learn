// Outgoing email through Resend's REST API. Without RESEND_API_KEY in development, emails are
// printed to the server console instead (so magic-link sign-in works locally with no setup).

type Email = { to: string; subject: string; html: string; text: string; /** one-click unsubscribe URL (List-Unsubscribe) */ unsubscribe?: string };

export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.info(`\n[email:dev] To: ${email.to}\n[email:dev] Subject: ${email.subject}\n${email.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "DayOne <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.unsubscribe ? { headers: { "List-Unsubscribe": `<${email.unsubscribe}>` } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function magicLinkEmail(url: string, host: string): Omit<Email, "to"> {
  return {
    subject: `Sign in to DayOne`,
    text: `Sign in to DayOne (${host}):\n${url}\n\nThe link works once and expires in 24 hours. If you didn't ask for it, ignore this email.\n`,
    html: `<!doctype html><html><body style="margin:0;background:#0f1318;font-family:system-ui,sans-serif;color:#e3e8ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#151b22;border:1px solid #2a3440;border-radius:12px">
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font:600 13px monospace"><span style="background:#f0b44c;color:#1a1206;border-radius:4px;padding:2px 6px">d1</span> DayOne</p>
<h1 style="margin:0 0 12px;font-size:22px">Sign in to DayOne</h1>
<p style="margin:0 0 20px;color:#93a0ae">Click the button to sign in on ${esc(host)}. The link works once and expires in 24 hours.</p>
<a href="${esc(url)}" style="display:inline-block;background:#f0b44c;color:#1a1206;font-weight:700;text-decoration:none;border-radius:8px;padding:10px 18px">Sign in</a>
<p style="margin:20px 0 0;font-size:13px;color:#93a0ae">If you didn't ask for this, you can ignore it.</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
