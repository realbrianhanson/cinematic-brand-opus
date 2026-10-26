/**
 * Call funnel emails: an instant alert to the owner for every qualified
 * application, and one reminder to qualified applicants who have not booked.
 *
 * Dependency-free so it can be unit-tested from vitest; callers pass the
 * mailer settings and a fetch implementation.
 */
import { callAnswerLines, type CallFunnelConfig } from "./callFunnels.ts";

export { callAnswerLines };
import { escapeHtml, type NewsletterConfig } from "./newsletterConfig.ts";
import {
  classifyAccessMailResponse,
  type AccessMailPayload,
  type AccessMailResult,
} from "./offerAccessMail.ts";

export interface CallMailApplication {
  id: string;
  slug: string;
  contact: { name: string; email: string };
  answers: Record<string, string>;
  config: CallFunnelConfig;
  /** Opted in to news, updates and offers. Undefined on older applications. */
  marketingConsent?: boolean;
}

const oneLine = (value: string, max = 200) =>
  value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max);

/** Calendly (or any calendar) link that prefills the applicant and tags the booking. */
export function callBookingLink(app: CallMailApplication): string | null {
  try {
    const url = new URL(app.config.booking.url);
    if (url.protocol !== "https:") return null;
    url.searchParams.set("name", app.contact.name);
    url.searchParams.set("email", app.contact.email);
    url.searchParams.set("utm_source", "email");
    url.searchParams.set("utm_medium", "call-application-reminder");
    url.searchParams.set("utm_content", app.id);
    return url.toString();
  } catch {
    return null;
  }
}

export function callOwnerAlertPayload(
  mailer: NewsletterConfig,
  owner: string,
  app: CallMailApplication,
): AccessMailPayload {
  const origin = new URL(mailer.siteUrl);
  if (origin.protocol !== "https:") throw new Error("Secure site URL required");
  const report = `${origin.origin}/admin/call-funnels`;
  const name = oneLine(app.contact.name, 120);
  const lines: Array<[string, string]> = [
    ...callAnswerLines(app.config, app.answers),
  ];
  if (app.marketingConsent !== undefined)
    lines.push([
      "News, updates and offers",
      app.marketingConsent
        ? "Opted in by phone, text and email"
        : "Not opted in. Contact about this application only",
    ]);
  const heading = `New qualified application from ${name}`;
  const intro = `${name} (${app.contact.email}) applied on /calls/${app.slug} and qualified for a call. They are on the booking page now, so the call usually appears in your calendar within a few minutes`;
  const text = [
    intro,
    "",
    ...lines.map(([label, value]) => `${label}\n${value}\n`),
    `All applications: ${report}`,
  ].join("\n");
  const rows = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #e1e6ee;color:#5a667a;font-size:13px">${escapeHtml(label)}</td></tr><tr><td style="padding:0 0 10px;font-size:15px;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return {
    from: mailer.fromAddress,
    to: [owner],
    // Replying goes straight to the applicant.
    reply_to: app.contact.email,
    subject: oneLine(heading),
    text: `${heading}\n\n${text}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#172338;max-width:620px"><h1 style="font-size:22px">${escapeHtml(heading)}</h1><p style="font-size:15px">${escapeHtml(intro)}</p><table style="width:100%;border-collapse:collapse">${rows}</table><p><a href="${escapeHtml(report)}">Open all applications</a></p></div>`,
  };
}

export function callFollowupPayload(
  mailer: NewsletterConfig,
  owner: string,
  app: CallMailApplication,
): AccessMailPayload | null {
  const link = callBookingLink(app);
  if (!link) return null;
  const first = oneLine(app.contact.name, 80).split(/\s+/)[0] || "there";
  const host =
    oneLine(app.config.brand.hostName, 80) ||
    oneLine(app.config.brand.name, 80);
  const minutes = app.config.booking.minutes;
  const subject = `Pick a time for your call with ${host}`;
  const paragraphs = [
    `Hi ${first},`,
    `Thanks for applying. You qualified for a ${minutes}-minute strategy call and there is one step left: pick a time`,
    `Your name and email are already filled in, so it takes about a minute`,
    `If you already booked, you can ignore this email`,
    host,
  ];
  return {
    from: mailer.fromAddress,
    to: [app.contact.email],
    reply_to: owner,
    subject: oneLine(subject),
    text: `${paragraphs.slice(0, 3).join("\n\n")}\n\nPick a time: ${link}\n\n${paragraphs.slice(3).join("\n\n")}\n\nYou are getting this because you applied for a call. It is the only reminder we send.`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#172338;max-width:560px;font-size:16px;line-height:1.6">${paragraphs
      .slice(0, 3)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join(
        "",
      )}<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#d4af55;color:#000;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Pick a time</a></p>${paragraphs
      .slice(3)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join(
        "",
      )}<p style="font-size:12px;color:#5a667a">You are getting this because you applied for a call. It is the only reminder we send.</p></div>`,
  };
}

/** Link back to the application, tagged so a finished application shows its source. */
export function callFinishLink(
  mailer: NewsletterConfig,
  app: CallMailApplication,
): string | null {
  try {
    const url = new URL(`/calls/${app.slug}`, mailer.siteUrl);
    if (url.protocol !== "https:") return null;
    url.searchParams.set("utm_source", "email");
    url.searchParams.set("utm_medium", "call-application-unfinished");
    return url.toString();
  } catch {
    return null;
  }
}

/** Tells the owner someone stopped partway, with what they answered so far. */
export function callAbandonedAlertPayload(
  mailer: NewsletterConfig,
  owner: string,
  app: CallMailApplication,
): AccessMailPayload {
  const origin = new URL(mailer.siteUrl);
  if (origin.protocol !== "https:") throw new Error("Secure site URL required");
  const name = oneLine(app.contact.name, 120);
  const lines: Array<[string, string]> = [
    ...callAnswerLines(app.config, app.answers),
  ];
  if (app.marketingConsent !== undefined)
    lines.push([
      "News, updates and offers",
      app.marketingConsent
        ? "Opted in by phone, text and email"
        : "Not opted in. Contact about this application only",
    ]);
  const heading = `Unfinished application from ${name}`;
  const intro = `${name} (${app.contact.email}) started an application on /calls/${app.slug} and stopped before sending it. Here is what they answered. They also get one email reminder to finish`;
  const rows = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #e1e6ee;color:#5a667a;font-size:13px">${escapeHtml(label)}</td></tr><tr><td style="padding:0 0 10px;font-size:15px;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return {
    from: mailer.fromAddress,
    to: [owner],
    reply_to: app.contact.email,
    subject: oneLine(heading),
    text: `${heading}\n\n${intro}\n\n${lines.map(([label, value]) => `${label}\n${value}\n`).join("\n")}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#172338;max-width:620px"><h1 style="font-size:22px">${escapeHtml(heading)}</h1><p style="font-size:15px">${escapeHtml(intro)}</p><table style="width:100%;border-collapse:collapse">${rows}</table></div>`,
  };
}

/** One reminder to the visitor to finish their application. */
export function callFinishReminderPayload(
  mailer: NewsletterConfig,
  owner: string,
  app: CallMailApplication,
): AccessMailPayload | null {
  const link = callFinishLink(mailer, app);
  if (!link) return null;
  const first = oneLine(app.contact.name, 80).split(/\s+/)[0] || "there";
  const host =
    oneLine(app.config.brand.hostName, 80) ||
    oneLine(app.config.brand.name, 80);
  const subject = `Finish your application for a call with ${host}`;
  const paragraphs = [
    `Hi ${first},`,
    `You started an application for a strategy call but didn't get to the end`,
    `It takes about 2 more minutes. On the same device, your answers are still there`,
    `If you already sent it, you can ignore this email`,
    host,
  ];
  const footer =
    "You are getting this because you started an application. It is the only reminder we send.";
  return {
    from: mailer.fromAddress,
    to: [app.contact.email],
    reply_to: owner,
    subject: oneLine(subject),
    text: `${paragraphs.slice(0, 3).join("\n\n")}\n\nFinish my application: ${link}\n\n${paragraphs.slice(3).join("\n\n")}\n\n${footer}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#172338;max-width:560px;font-size:16px;line-height:1.6">${paragraphs
      .slice(0, 3)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join(
        "",
      )}<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#d4af55;color:#000;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Finish my application</a></p>${paragraphs
      .slice(3)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join(
        "",
      )}<p style="font-size:12px;color:#5a667a">${escapeHtml(footer)}</p></div>`,
  };
}

export async function sendCallMail(
  payload: AccessMailPayload,
  apiKey: string,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<AccessMailResult> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend drops repeats with the same key, so retries never duplicate.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.text()).slice(0, 4096);
    let providerId: string | null = null;
    try {
      const parsed = JSON.parse(body) as { id?: unknown };
      if (typeof parsed.id === "string" && parsed.id.length <= 200)
        providerId = parsed.id || null;
    } catch {
      /* Only a provider receipt confirms acceptance. */
    }
    return classifyAccessMailResponse(response.status, body, providerId);
  } catch {
    return {
      outcome: "uncertain",
      providerId: null,
      httpStatus: null,
      error: "provider_uncertain",
      detail: "The email provider did not confirm acceptance.",
    };
  }
}
