import { describe, expect, it, vi } from "vitest";
import {
  callBookingLink,
  callFollowupPayload,
  callOwnerAlertPayload,
  sendCallMail,
  type CallMailApplication,
} from "../../../supabase/functions/_shared/callFunnelMail";
import { processCallFunnelMail } from "../../../supabase/functions/_shared/callFunnelMailRuntime";
import type { NewsletterConfig } from "../../../supabase/functions/_shared/newsletterConfig";
import { emptyCallFunnelConfig } from "@/lib/callFunnels";
import { callBookingNotes } from "@/components/call-funnels/calendlyEmbed";
import { publicHelpContext } from "@/lib/siteChatHelp";
import { siteConfig } from "@/config/site";

const mailer = {
  siteUrl: "https://brianhanson.com",
  siteName: "Brian Hanson",
  fromAddress: "Brian Hanson <brian@m.brianhanson.com>",
  apiKey: "re_test",
} as NewsletterConfig;

function config() {
  const c = emptyCallFunnelConfig();
  c.brand.name = "Brian Hanson";
  c.brand.hostName = "Brian Hanson";
  c.booking.url = "https://calendly.com/brian/strategy";
  c.questions = [
    {
      id: "budget",
      label: "What budget have you set aside?",
      help: "",
      type: "single",
      required: true,
      options: [
        { id: "usd-5-10k", label: "$5k–$10k" },
        { id: "under-5k", label: "Under $5k" },
      ],
    },
    {
      id: "win",
      label: "What would a win look like?",
      help: "",
      type: "textarea",
      required: true,
      options: [],
    },
    {
      id: "notes",
      label: "Anything else?",
      help: "",
      type: "textarea",
      required: false,
      options: [],
    },
  ];
  return c;
}
const app = (
  id = "00000000-0000-4000-8000-0000000000a1",
): CallMailApplication => ({
  id,
  slug: "work-with-brian",
  contact: { name: "Pat Lee", email: "pat@example.com" },
  answers: { budget: "usd-5-10k", win: "Twice the booked inspections" },
  config: config(),
});

describe("call funnel emails", () => {
  it("alerts the owner with every answer, and replies go to the applicant", () => {
    const payload = callOwnerAlertPayload(
      mailer,
      "brian@realagency.com",
      app(),
    );
    expect(payload.to).toEqual(["brian@realagency.com"]);
    expect(payload.reply_to).toBe("pat@example.com");
    expect(payload.subject).toBe("New qualified application from Pat Lee");
    expect(payload.text).toContain("What budget have you set aside?\n$5k–$10k");
    expect(payload.text).toContain("Twice the booked inspections");
    expect(payload.text).not.toContain("Anything else?");
    expect(payload.html).toContain(
      "https://brianhanson.com/admin/call-funnels",
    );
  });

  it("tells the owner whether the applicant opted in to news and offers", () => {
    const yes = callOwnerAlertPayload(mailer, "o@example.com", {
      ...app(),
      marketingConsent: true,
    });
    expect(yes.text).toContain("News, updates and offers\nOpted in");
    const no = callOwnerAlertPayload(mailer, "o@example.com", {
      ...app(),
      marketingConsent: false,
    });
    expect(no.text).toContain("Not opted in");
    expect(
      callOwnerAlertPayload(mailer, "o@example.com", app()).text,
    ).not.toContain("News, updates and offers");
  });

  it("escapes applicant text in the owner email", () => {
    const evil = app();
    evil.answers.win = "<script>alert(1)</script>";
    const payload = callOwnerAlertPayload(mailer, "owner@example.com", evil);
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
  });

  it("reminds the applicant with a prefilled, tagged booking link", () => {
    const link = new URL(callBookingLink(app())!);
    expect(Object.fromEntries(link.searchParams)).toMatchObject({
      name: "Pat Lee",
      email: "pat@example.com",
      utm_content: "00000000-0000-4000-8000-0000000000a1",
    });
    const payload = callFollowupPayload(mailer, "brian@realagency.com", app())!;
    expect(payload.to).toEqual(["pat@example.com"]);
    expect(payload.subject).toBe("Pick a time for your call with Brian Hanson");
    expect(payload.text).toContain("Hi Pat,");
    expect(payload.text).toContain("only reminder");
  });

  it("sends no reminder when the booking link is not https", () => {
    const insecure = app();
    insecure.config.booking.url = "http://calendar.example.com";
    expect(callFollowupPayload(mailer, "o@example.com", insecure)).toBeNull();
  });

  it("uses an idempotency key so retries never duplicate", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );
    const result = await sendCallMail(
      callOwnerAlertPayload(mailer, "o@example.com", app()),
      "re_test",
      "call-alert-1",
      fetcher,
    );
    expect(result.outcome).toBe("sent");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "call-alert-1" }),
      }),
    );
  });
});

/** A tiny in-memory stand-in for the parts of supabase-js the worker uses. */
function fakeAdmin(
  tables: Record<string, Record<string, unknown>[]>,
  suppressed = false,
) {
  const updates: {
    table: string;
    values: Record<string, unknown>;
    id: unknown;
  }[] = [];
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    let update: Record<string, unknown> | null = null;
    const api = {
      select: () => api,
      order: () => api,
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return api;
      },
      eq: (key: string, value: unknown) => {
        if (update) {
          updates.push({ table, values: update, id: value });
          return Promise.resolve({ error: null });
        }
        rows = rows.filter((row) => row[key] === value);
        return api;
      },
      is: (key: string, value: unknown) => {
        rows = rows.filter((row) => (row[key] ?? null) === value);
        return api;
      },
      gte: (key: string, value: string) => {
        rows = rows.filter((row) => String(row[key]) >= value);
        return api;
      },
      lte: (key: string, value: string) => {
        rows = rows.filter((row) => String(row[key]) <= value);
        return api;
      },
      in: (key: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[key]));
        return api;
      },
      update: (values: Record<string, unknown>) => {
        update = values;
        return api;
      },
      maybeSingle: () =>
        Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return api;
  }
  return {
    updates,
    client: {
      from: builder,
      rpc: async () => ({ data: suppressed, error: null }),
    },
  };
}

describe("call funnel mail worker", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const base = {
    funnel_id: "f1",
    revision: 1,
    outcome: "qualified",
    contact: { name: "Pat Lee", email: "pat@example.com" },
    answers: { budget: "usd-5-10k" },
  };
  const tables = (extra: Record<string, unknown>[] = []) => ({
    site_settings: [
      {
        site_url: "https://brianhanson.com",
        site_name: "Brian Hanson",
        author_name: "Brian Hanson",
        newsletter_from_address: "Brian Hanson <brian@m.brianhanson.com>",
        newsletter_reply_to: "brian@realagency.com",
      },
    ],
    site_settings_private: [{ speaking_notification_email: "" }],
    call_funnel_revisions: [
      {
        funnel_id: "f1",
        version: 1,
        slug: "work-with-brian",
        config: config(),
      },
    ],
    call_funnel_events: [] as Record<string, unknown>[],
    call_funnel_applications: extra,
  });

  it("marks an alert sent only after Resend confirms it", async () => {
    const fake = fakeAdmin(
      tables([
        {
          ...base,
          id: "a1",
          submitted_at: "2026-10-24T11:59:00Z",
          owner_alerted_at: null,
          followup_sent_at: null,
        },
      ]),
    );
    const ok = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", ok);
    const result = await processCallFunnelMail(
      fake.client as never,
      "re_test",
      {
        applicationId: "a1",
        now,
      },
    );
    expect(result).toMatchObject({ configured: true, alerts: 1 });
    expect(fake.updates).toEqual([
      expect.objectContaining({
        id: "a1",
        values: { owner_alerted_at: expect.any(String) },
      }),
    ]);

    const failing = fakeAdmin(
      tables([
        {
          ...base,
          id: "a2",
          submitted_at: "2026-10-24T11:59:00Z",
          owner_alerted_at: null,
        },
      ]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    await processCallFunnelMail(failing.client as never, "re_test", {
      applicationId: "a2",
      now,
    });
    expect(failing.updates).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("reminds only qualified applicants who have not booked within the window", async () => {
    const data = tables([
      // Due: 5 hours old, no booking.
      {
        ...base,
        id: "due",
        submitted_at: "2026-10-24T07:00:00Z",
        owner_alerted_at: "x",
        followup_sent_at: null,
      },
      // Booked already.
      {
        ...base,
        id: "booked",
        submitted_at: "2026-10-24T07:00:00Z",
        owner_alerted_at: "x",
        followup_sent_at: null,
      },
      // Too fresh.
      {
        ...base,
        id: "fresh",
        submitted_at: "2026-10-24T11:00:00Z",
        owner_alerted_at: "x",
        followup_sent_at: null,
      },
      // Too old.
      {
        ...base,
        id: "old",
        submitted_at: "2026-10-20T07:00:00Z",
        owner_alerted_at: "x",
        followup_sent_at: null,
      },
    ]);
    data.call_funnel_events = [{ application_id: "booked", type: "booked" }];
    const fake = fakeAdmin(data);
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)).to[0]);
        return new Response(JSON.stringify({ id: "e" }), { status: 200 });
      }),
    );
    const result = await processCallFunnelMail(
      fake.client as never,
      "re_test",
      { now },
    );
    vi.unstubAllGlobals();
    expect(result).toMatchObject({ reminders: 1 });
    expect(sent).toEqual(["pat@example.com"]);
    expect(fake.updates.map((u) => u.id)).toEqual(["due"]);
  });

  it("alerts the owner and reminds the visitor once about an unfinished application", async () => {
    const data = tables() as ReturnType<typeof tables> & {
      call_funnel_partials: Record<string, unknown>[];
    };
    const partial = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      funnel_id: "f1",
      revision: 1,
      token_hash: id.padEnd(64, "0"),
      contact: { name: "Pat Lee", email: "pat@example.com" },
      answers: { budget: "usd-5-10k" },
      marketing_consent: true,
      updated_at: "2026-10-24T10:00:00Z",
      owner_alerted_at: null,
      reminder_sent_at: null,
      ...extra,
    });
    data.call_funnel_partials = [
      partial("p1"),
      // Too fresh: still filling it in.
      partial("p2", { updated_at: "2026-10-24T11:30:00Z" }),
      // Went on to submit with the same email.
      partial("p3", {
        contact: { name: "Sam Roe", email: "SAM@example.com" },
      }),
    ];
    data.call_funnel_applications = [
      {
        ...base,
        id: "a9",
        token_hash: "x".repeat(64),
        contact: { name: "Sam Roe", email: "sam@example.com" },
        submitted_at: "2026-10-24T10:30:00Z",
        owner_alerted_at: "x",
        followup_sent_at: "x",
      },
    ];
    const fake = fakeAdmin(data);
    const sent: { to: string; subject: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sent.push({ to: body.to[0], subject: body.subject });
        return new Response(JSON.stringify({ id: "e" }), { status: 200 });
      }),
    );
    const result = await processCallFunnelMail(
      fake.client as never,
      "re_test",
      { now },
    );
    vi.unstubAllGlobals();
    expect(result).toMatchObject({ abandonedAlerts: 1, finishReminders: 1 });
    expect(sent).toEqual([
      {
        to: "brian@realagency.com",
        subject: "Unfinished application from Pat Lee",
      },
      {
        to: "pat@example.com",
        subject: "Finish your application for a call with Brian Hanson",
      },
    ]);
    const partialUpdates = fake.updates.filter(
      (u) => u.table === "call_funnel_partials",
    );
    expect(partialUpdates.map((u) => u.id).sort()).toEqual([
      "p1",
      "p1",
      "p3",
      "p3",
    ]);
  });

  it("does nothing without a sender configuration", async () => {
    const data = tables();
    data.site_settings = [
      { ...data.site_settings[0], newsletter_from_address: "" },
    ];
    const result = await processCallFunnelMail(
      fakeAdmin(data).client as never,
      "re_test",
      { now },
    );
    expect(result).toMatchObject({ configured: false });
  });
});

describe("booking notes and site links", () => {
  it("turns answers into calendar notes the host can read", () => {
    expect(
      callBookingNotes(config(), {
        budget: "usd-5-10k",
        win: "Twice the\nbooked inspections",
      }),
    ).toBe(
      "What budget have you set aside?: $5k–$10k\nWhat would a win look like?: Twice the booked inspections",
    );
  });

  it("tells the chatbot where to send people who want custom work", () => {
    expect(publicHelpContext(siteConfig)).toContain("/calls/work-with-brian:");
    expect(siteConfig.nav.items).toContainEqual({
      label: "Work with Brian",
      href: "/calls/work-with-brian",
    });
  });
});
