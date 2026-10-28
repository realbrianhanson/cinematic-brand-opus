import { describe, expect, it, vi } from "vitest";
import {
  callApplicationSummary,
  callCrmPayload,
  crmWebhookUrl,
  processCallFunnelCrm,
  sendCallCrm,
  type CrmApplication,
} from "../../../supabase/functions/_shared/callFunnelCrm";

const webhook =
  "https://services.leadconnectorhq.com/hooks/abc123/webhook-trigger/0f0e";

const config = {
  questions: [
    {
      id: "help",
      label: "Where do you want help first?",
      help: "",
      type: "single" as const,
      required: true,
      options: [
        { id: "brain", label: "Set up my central brain" },
        { id: "automate", label: "Automate work I do by hand" },
      ],
    },
    {
      id: "tasks",
      label: "What eats the most time in your week?",
      help: "",
      type: "textarea" as const,
      required: true,
      options: [],
    },
    {
      id: "phone",
      label: "Best mobile number",
      help: "",
      type: "text" as const,
      required: true,
      options: [],
    },
  ],
};

const app = (patch: Partial<CrmApplication> = {}): CrmApplication => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  slug: "grok-bot-setup",
  title: "Grok Bot Setup Application",
  config,
  contact: { name: "Pat Van Lee", email: "pat@example.com" },
  answers: {
    help: "brain",
    tasks: "Follow-up emails\nand quotes",
    phone: " 5155550142 ",
  },
  outcome: "qualified",
  marketingConsent: true,
  submittedAt: "2026-10-27T12:00:00.000Z",
  ...patch,
});

describe("CRM webhook address", () => {
  it("accepts GHL inbound webhooks only", () => {
    expect(crmWebhookUrl(webhook)).toBe(webhook);
    expect(crmWebhookUrl(` ${webhook} `)).toBe(webhook);
    expect(crmWebhookUrl("http://services.leadconnectorhq.com/hooks/x")).toBe(
      null,
    );
    expect(crmWebhookUrl("https://example.com/hooks/x")).toBe(null);
    expect(
      crmWebhookUrl("https://user:pass@services.leadconnectorhq.com/hooks/x"),
    ).toBe(null);
    expect(crmWebhookUrl("")).toBe(null);
    expect(crmWebhookUrl(null)).toBe(null);
  });
});

describe("CRM payload", () => {
  it("sends the contact, every answer as Question: answer lines and the funnel", () => {
    const payload = callCrmPayload(app(), "https://brianhanson.com");
    expect(payload).toMatchObject({
      first_name: "Pat",
      last_name: "Van Lee",
      email: "pat@example.com",
      phone: "5155550142",
      funnel: "grok-bot-setup",
      funnel_title: "Grok Bot Setup Application",
      page_url: "https://brianhanson.com/calls/grok-bot-setup",
      application_id: "00000000-0000-4000-8000-0000000000a1",
      outcome: "qualified",
      submitted_at: "2026-10-27T12:00:00.000Z",
      contact_consent: true,
      marketing_consent: true,
    });
    expect(payload.application_summary).toBe(
      [
        "Where do you want help first?: Set up my central brain",
        "What eats the most time in your week?: Follow-up emails and quotes",
        "Best mobile number: 5155550142",
      ].join("\n"),
    );
  });

  it("handles a single name, no phone and a missing site address", () => {
    const payload = callCrmPayload(
      app({
        contact: { name: "Pat", email: "pat@example.com" },
        answers: { help: "automate" },
        marketingConsent: false,
      }),
      "not a url",
    );
    expect(payload.first_name).toBe("Pat");
    expect(payload.last_name).toBe("");
    expect(payload.phone).toBe("");
    expect(payload.page_url).toBe("");
    expect(payload.marketing_consent).toBe(false);
    expect(callApplicationSummary(config, { help: "automate" })).toBe(
      "Where do you want help first?: Automate work I do by hand",
    );
  });
});

describe("CRM sender", () => {
  it("posts JSON and reports 2xx as sent", async () => {
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await sendCallCrm(
      webhook,
      { email: "pat@example.com" },
      fetcher,
    );
    expect(result).toEqual({ outcome: "sent", status: 200 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(webhook);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init.body))).toEqual({ email: "pat@example.com" });
  });

  it("reports errors and network failures as failed", async () => {
    expect(
      await sendCallCrm(
        webhook,
        {},
        async () => new Response("", { status: 500 }),
      ),
    ).toEqual({ outcome: "failed", status: 500 });
    expect(
      await sendCallCrm(webhook, {}, async () => {
        throw new Error("offline");
      }),
    ).toEqual({ outcome: "failed", status: null });
  });
});

function fakeAdmin(
  tables: Record<string, Record<string, unknown>[]>,
  claim: (id: unknown) => boolean = () => true,
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
      rpc: async (_name: string, args: Record<string, unknown>) => ({
        data: claim(args._id),
        error: null,
      }),
    },
  };
}

describe("CRM worker", () => {
  const now = Date.parse("2026-10-27T12:30:00Z");
  const row = {
    id: "a1",
    funnel_id: "f1",
    revision: 2,
    contact: { name: "Pat Lee", email: "pat@example.com" },
    answers: { help: "brain", phone: "5155550142" },
    outcome: "qualified",
    marketing_consent: false,
    submitted_at: "2026-10-27T12:00:00.000Z",
    crm_sent_at: null,
  };
  const tables = (webhookUrl = webhook) => ({
    site_settings_private: [{ id: "s1", call_funnel_webhook_url: webhookUrl }],
    site_settings: [{ site_url: "https://brianhanson.com" }],
    call_funnel_revisions: [
      {
        funnel_id: "f1",
        version: 2,
        slug: "grok-bot-setup",
        title: "Grok Bot Setup Application",
        config,
      },
    ],
    call_funnel_applications: [
      row,
      { ...row, id: "a2", crm_sent_at: "2026-10-27T12:01:00.000Z" },
      { ...row, id: "a3", submitted_at: "2026-10-25T12:00:00.000Z" },
    ],
  });

  it("posts unsent applications from the last day and stamps them", async () => {
    const { client, updates } = fakeAdmin(tables());
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await processCallFunnelCrm(client, { now, fetcher });
    expect(result).toEqual({ configured: true, sent: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String(
        (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(body.funnel).toBe("grok-bot-setup");
    expect(body.application_summary).toBe(
      "Where do you want help first?: Set up my central brain\nBest mobile number: 5155550142",
    );
    expect(updates).toEqual([
      {
        table: "call_funnel_applications",
        values: { crm_sent_at: new Date(now).toISOString() },
        id: "a1",
      },
    ]);
  });

  it("does nothing until a GHL webhook is saved", async () => {
    const { client } = fakeAdmin(tables("https://example.com/hook"));
    const fetcher = vi.fn();
    expect(await processCallFunnelCrm(client, { now, fetcher })).toEqual({
      configured: false,
      sent: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips a lead another run already claimed, and retries a failed post later", async () => {
    const claimed = fakeAdmin(tables(), () => false);
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    expect(
      await processCallFunnelCrm(claimed.client, { now, fetcher }),
    ).toEqual({ configured: true, sent: 0 });
    expect(fetcher).not.toHaveBeenCalled();

    const failing = fakeAdmin(tables());
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await processCallFunnelCrm(failing.client, {
      now,
      fetcher: async () => new Response("", { status: 502 }),
    });
    expect(result).toEqual({ configured: true, sent: 0 });
    expect(failing.updates).toEqual([]);
    expect(error).toHaveBeenCalledWith("Call funnel CRM webhook failed (502)");
    error.mockRestore();
  });

  it("sends only the requested application right after submit", async () => {
    const data = tables();
    data.call_funnel_applications.push({ ...row, id: "a4" });
    const { client } = fakeAdmin(data);
    const fetcher = vi.fn(async () => new Response("ok", { status: 200 }));
    await processCallFunnelCrm(client, { now, fetcher, applicationId: "a4" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String(
        (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(body.application_id).toBe("a4");
  });
});
