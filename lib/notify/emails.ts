// Email bodies for reminders and the weekly summary. Pure: callers pass links and numbers.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, paragraphs: string[], cta: { label: string; url: string }, unsubscribe: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#0f1318;font-family:system-ui,sans-serif;color:#e3e8ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#151b22;border:1px solid #2a3440;border-radius:12px"><tr><td style="padding:24px">
<p style="margin:0 0 12px;font:600 13px monospace"><span style="background:#f0b44c;color:#1a1206;border-radius:4px;padding:2px 6px">d1</span> DayOne</p>
<h1 style="margin:0 0 12px;font-size:22px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;color:#c9d2db">${esc(p)}</p>`).join("")}
<a href="${esc(cta.url)}" style="display:inline-block;margin-top:8px;background:#f0b44c;color:#1a1206;font-weight:700;text-decoration:none;border-radius:8px;padding:10px 18px">${esc(cta.label)}</a>
<p style="margin:24px 0 0;font-size:12px;color:#93a0ae"><a href="${esc(unsubscribe)}" style="color:#93a0ae">Unsubscribe</a> from these emails.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${title}\n\n${paragraphs.join("\n\n")}\n\n${cta.label}: ${cta.url}\n\nUnsubscribe: ${unsubscribe}\n`;
  return { html, text };
}

export function reminderEmail(a: { name: string; streak: number; dashboardUrl: string; unsubscribeUrl: string }) {
  const subject = a.streak > 0 ? `Keep your ${a.streak}-day streak alive` : "Your daily lesson is waiting";
  const lines = [
    `Hi ${a.name}, you haven't learned anything today yet.`,
    a.streak > 0 ? `One lesson, quiz or review keeps your ${a.streak}-day streak going.` : "A 15-minute lesson is all it takes to start a streak.",
  ];
  return { subject, ...layout(subject, lines, { label: "Open DayOne", url: a.dashboardUrl }, a.unsubscribeUrl) };
}

export function weeklySummaryEmail(a: {
  name: string;
  xp: number;
  lessons: number;
  streak: number;
  league: { tier: string; rank: number; outcome: string | null } | null;
  dashboardUrl: string;
  unsubscribeUrl: string;
}) {
  const subject = `Your week: ${a.xp} XP`;
  const lines = [
    `Hi ${a.name}, here's your week on DayOne.`,
    `You earned ${a.xp} XP and finished ${a.lessons} lesson${a.lessons === 1 ? "" : "s"}. Your streak is ${a.streak} day${a.streak === 1 ? "" : "s"}.`,
  ];
  if (a.league) {
    const tier = a.league.tier.charAt(0) + a.league.tier.slice(1).toLowerCase();
    const result = a.league.outcome === "PROMOTED" ? "and moved up a league!" : a.league.outcome === "DEMOTED" ? "and moved down a league." : "and stayed in your league.";
    lines.push(`You finished #${a.league.rank} in ${tier} ${result}`);
  }
  return { subject, ...layout(subject, lines, { label: "Start this week", url: a.dashboardUrl }, a.unsubscribeUrl) };
}
