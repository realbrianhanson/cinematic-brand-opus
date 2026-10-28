/**
 * Posts each submitted call funnel application to a CRM inbound webhook
 * (GoHighLevel). The server sends it right after submit, and the 15-minute
 * worker retries a miss for a day.
 *
 * Dependency-free so it can be unit-tested from vitest; callers pass the
 * database client and, in tests, a fetch implementation.
 */
import { callAnswerLines, type CallFunnelConfig } from "./callFunnels.ts";

/** The parts of supabase-js used here; structural so tests can pass a fake. */
type CrmAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const HOUR = 3600000;
const RETRY_WINDOW = 24 * HOUR;
const TIMEOUT = 10000;
/**
 * GHL's inbound webhook hosts. Any other address is ignored, so a bad
 * setting can never point the server somewhere else.
 */
const CRM_HOSTS = new Set([
  "services.leadconnectorhq.com",
  "backend.leadconnectorhq.com",
]);

export function crmWebhookUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" &&
      CRM_HOSTS.has(url.hostname.toLowerCase()) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export interface CrmApplication {
  id: string;
  slug: string;
  title: string;
  config: Pick<CallFunnelConfig, "questions">;
  contact: { name: string; email: string };
  answers: Record<string, string>;
  outcome: string;
  marketingConsent: boolean;
  submittedAt: string;
}

const GROK_BOT_SLUG = "grok-bot-setup";
const GROK_BOT_FIELDS: Record<string, string> = {
  handoff: "grok_bot_first_task_to_hand_off",
  grok: "grok_bot_current_experience",
  offer: "grok_bot_business_and_buyers",
  website: "grok_bot_has_website",
  "website-url": "grok_bot_website_url",
  tasks: "grok_bot_weekly_time_drains",
  style: "grok_bot_service_style",
  budget: "grok_bot_budget",
  start: "grok_bot_start_timing",
};

/** Values use the published question labels, not the internal choice IDs. */
export function grokBotContactFields(
  config: Pick<CallFunnelConfig, "questions">,
  answers: Record<string, string>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const question of config.questions) {
    const key = GROK_BOT_FIELDS[question.id];
    if (!key) continue;
    const raw = answers[question.id]?.trim();
    if (!raw) continue;
    const value =
      question.type === "single"
        ? question.options.find((option) => option.id === raw)?.label
        : raw;
    if (value) fields[key] = value;
  }
  return fields;
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Every question and answer as "Question: answer", one per line. */
export function callApplicationSummary(
  config: Pick<CallFunnelConfig, "questions">,
  answers: Record<string, string>,
): string {
  return callAnswerLines(config, answers)
    .map(([question, answer]) => `${oneLine(question)}: ${oneLine(answer)}`)
    .join("\n");
}

export function callCrmPayload(app: CrmApplication, siteUrl: string) {
  const [first = "", ...rest] = app.contact.name.trim().split(/\s+/);
  let pageUrl = "";
  try {
    const origin = new URL(siteUrl);
    if (origin.protocol === "https:")
      pageUrl = `${origin.origin}/calls/${app.slug}`;
  } catch {
    /* the link is optional */
  }
  return {
    first_name: first,
    last_name: rest.join(" "),
    email: app.contact.email,
    phone: app.answers.phone?.trim() ?? "",
    application_summary: callApplicationSummary(app.config, app.answers),
    funnel: app.slug,
    funnel_title: app.title,
    page_url: pageUrl,
    application_id: app.id,
    outcome: app.outcome,
    submitted_at: app.submittedAt,
    // Consent to be contacted is required to apply; marketing is optional.
    contact_consent: true,
    marketing_consent: app.marketingConsent,
    ...(app.slug === GROK_BOT_SLUG
      ? {
          event_type: "application_submitted",
          grok_bot_application_summary: callApplicationSummary(
            app.config,
            app.answers,
          ),
          ...grokBotContactFields(app.config, app.answers),
        }
      : {}),
  };
}

export function grokBotContactPayload(
  contact: { name: string; email: string },
  answers: Record<string, string>,
) {
  const [first = "", ...rest] = contact.name.trim().split(/\s+/);
  return {
    first_name: first,
    last_name: rest.join(" "),
    email: contact.email,
    phone: answers.phone?.trim() ?? "",
    funnel: GROK_BOT_SLUG,
    event_type: "contact_captured",
    contact_consent: true,
  };
}

export async function sendCallCrm(
  url: string,
  payload: object,
  fetcher: typeof fetch = fetch,
  timeoutMs = TIMEOUT,
): Promise<{ outcome: "sent" | "failed"; status: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    await response.text().catch(() => "");
    return {
      outcome: response.ok ? "sent" : "failed",
      status: response.status,
    };
  } catch {
    return { outcome: "failed", status: null };
  } finally {
    clearTimeout(timer);
  }
}

interface Row {
  id: string;
  funnel_id: string;
  revision: number;
  contact: { name: string; email: string };
  answers: Record<string, string>;
  outcome: string;
  marketing_consent?: boolean;
  submitted_at: string;
}

interface PartialRow {
  id: string;
  contact: { name: string; email: string };
  answers: Record<string, string>;
}

/** Sends the first contact capture once; the worker retries a missed POST. */
export async function processGrokBotContactCrm(
  admin: CrmAdmin,
  options: {
    tokenHash?: string;
    grokWebhookUrl?: string;
    now?: number;
    fetcher?: typeof fetch;
  } = {},
) {
  const url = crmWebhookUrl(options.grokWebhookUrl);
  if (!url) return { configured: false, sent: 0 };
  const now = options.now ?? Date.now();
  const funnel = await admin
    .from("call_funnels")
    .select("id")
    .eq("slug", GROK_BOT_SLUG)
    .maybeSingle();
  if (funnel.error) throw new Error("Grok Bot funnel unavailable");
  if (!funnel.data?.id) return { configured: true, sent: 0 };
  let query = admin
    .from("call_funnel_partials")
    .select("id,contact,answers")
    .eq("funnel_id", funnel.data.id)
    .is("crm_contact_sent_at", null)
    .gte("created_at", new Date(now - RETRY_WINDOW).toISOString());
  if (options.tokenHash) query = query.eq("token_hash", options.tokenHash);
  const due = await query.order("created_at").limit(20);
  if (due.error) throw new Error("Partial applications unavailable");
  let sent = 0;
  for (const row of (due.data ?? []) as PartialRow[]) {
    const claim = await admin.rpc("call_funnel_crm_contact_claim", {
      _id: row.id,
    });
    if (claim.error || claim.data !== true) continue;
    const result = await sendCallCrm(
      url,
      grokBotContactPayload(row.contact, row.answers),
      options.fetcher,
    );
    if (result.outcome !== "sent") {
      console.error(
        `Grok Bot contact CRM webhook failed (${result.status ?? "no response"})`,
      );
      continue;
    }
    await admin
      .from("call_funnel_partials")
      .update({ crm_contact_sent_at: new Date(now).toISOString() })
      .eq("id", row.id);
    sent++;
  }
  return { configured: true, sent };
}

/**
 * Sends unsent applications from the last day, or just one with
 * `applicationId`. A claim keeps the submit path and the worker from
 * posting the same lead twice, and crm_sent_at is written only after the
 * webhook answers 2xx.
 */
export async function processCallFunnelCrm(
  admin: CrmAdmin,
  options: {
    applicationId?: string;
    grokWebhookUrl?: string;
    now?: number;
    fetcher?: typeof fetch;
  } = {},
) {
  const now = options.now ?? Date.now();
  const [settings, site] = await Promise.all([
    admin
      .from("site_settings_private")
      .select("call_funnel_webhook_url")
      .order("id")
      .limit(1)
      .maybeSingle(),
    admin.from("site_settings").select("site_url").limit(1).maybeSingle(),
  ]);
  if (settings.error || site.error) throw new Error("CRM settings unavailable");
  const defaultUrl = crmWebhookUrl(settings.data?.call_funnel_webhook_url);
  const grokUrl = crmWebhookUrl(options.grokWebhookUrl);
  if (!defaultUrl && !grokUrl) return { configured: false, sent: 0 };

  let query = admin
    .from("call_funnel_applications")
    .select(
      "id,funnel_id,revision,contact,answers,outcome,marketing_consent,submitted_at",
    )
    .is("crm_sent_at", null)
    .gte("submitted_at", new Date(now - RETRY_WINDOW).toISOString());
  if (!defaultUrl && grokUrl) {
    const funnel = await admin
      .from("call_funnels")
      .select("id")
      .eq("slug", GROK_BOT_SLUG)
      .maybeSingle();
    if (funnel.error) throw new Error("Grok Bot funnel unavailable");
    if (!funnel.data?.id) return { configured: true, sent: 0 };
    query = query.eq("funnel_id", funnel.data.id);
  }
  if (options.applicationId) query = query.eq("id", options.applicationId);
  const due = await query.order("submitted_at").limit(20);
  if (due.error) throw new Error("Applications unavailable");

  const revisions = new Map<
    string,
    { slug: string; title: string; config: CallFunnelConfig } | null
  >();
  let sent = 0;
  for (const row of (due.data ?? []) as Row[]) {
    const key = `${row.funnel_id}:${row.revision}`;
    if (!revisions.has(key)) {
      const { data, error } = await admin
        .from("call_funnel_revisions")
        .select("slug,title,config")
        .eq("funnel_id", row.funnel_id)
        .eq("version", row.revision)
        .maybeSingle();
      revisions.set(key, error || !data ? null : data);
    }
    const revision = revisions.get(key);
    if (!revision) continue;
    const url =
      revision.slug === GROK_BOT_SLUG ? grokUrl ?? defaultUrl : defaultUrl;
    if (!url) continue;
    const claim = await admin.rpc("call_funnel_crm_claim", { _id: row.id });
    if (claim.error || claim.data !== true) continue;
    const result = await sendCallCrm(
      url,
      callCrmPayload(
        {
          id: row.id,
          slug: revision.slug,
          title: revision.title,
          config: revision.config,
          contact: row.contact,
          answers: row.answers,
          outcome: row.outcome,
          marketingConsent: row.marketing_consent === true,
          submittedAt: row.submitted_at,
        },
        site.data?.site_url ?? "",
      ),
      options.fetcher,
    );
    if (result.outcome !== "sent") {
      console.error(
        `Call funnel CRM webhook failed (${result.status ?? "no response"})`,
      );
      continue;
    }
    await admin
      .from("call_funnel_applications")
      .update({ crm_sent_at: new Date(now).toISOString() })
      .eq("id", row.id);
    sent++;
  }
  return { configured: true, sent };
}
