import { errorMessage } from "@/lib/errorMessage";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { safeMutation } from "@/lib/withTimeout";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Field, FieldError, SectionCard } from "./site-settings/Field";
import { ChipList } from "./site-settings/ChipList";
import { CtaPreview } from "./site-settings/CtaPreview";
import { SitemapInfoCard } from "./site-settings/SitemapInfoCard";
import { IndexNowCard } from "./site-settings/IndexNowCard";
import ContentOfferRoutesManager from "./ContentOfferRoutesManager";
import {
  checkViolationMessage,
  normalizeOrigin,
  validateSiteSettings,
  type FieldErrors,
} from "./site-settings/validation";

const defaultSettings = {
  site_name: "My Website",
  site_url: "https://example.com",
  publisher_name: "My Brand",
  publisher_url: "https://example.com",
  author_name: "Site Owner",
  author_title: "Entrepreneur",
  author_bio: "",
  author_credentials: [] as string[],
  author_social_links: {} as Record<string, string>,
  cta_url: "",
  cta_headline: "Free Training",
  cta_subtext: "Join thousands learning to grow their business.",
  cta_button_text: "Get Free Access",
  cta_social_proof: "",
  report_email: "",
  report_enabled: false,
  voice_profile: "",
  banned_phrases: [] as string[],
  default_expert_pov: "",
  image_generation_enabled: false,
  newsletter_from_address: "",
  newsletter_reply_to: "",
  newsletter_postal_address: "",
};

type Settings = typeof defaultSettings & { id?: string };

const socialPlatforms = [
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/yourname",
  },
  {
    key: "twitter",
    label: "Twitter / X",
    placeholder: "https://x.com/yourhandle",
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/yourhandle",
  },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "https://youtube.com/@yourchannel",
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "https://tiktok.com/@yourhandle",
  },
];

/** Stable DOM id per field so a failed save can focus the first error. */
const fid = (key: string) => `site-settings-${key.replace(/\W/g, "-")}`;

const monoInput = {
  resize: "vertical",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
} as const;

const toggleText = {
  fontSize: 13,
  color: "hsl(var(--admin-text-soft))",
} as const;

const trimLinks = (links: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(links)
      .map(([k, v]) => [k, (v ?? "").trim()])
      .filter(([, v]) => v),
  );

const SiteSettingsManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings>(defaultSettings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [credentialInput, setCredentialInput] = useState("");

  const {
    data: settings,
    isLoading,
    error: settingsError,
  } = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("admin_read_site_settings")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: privateSettings,
    isLoading: privateLoading,
    error: privateError,
  } = useQuery({
    queryKey: ["admin-site-settings-private"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings_private")
        .select(
          "id, report_email, report_enabled, voice_profile, banned_phrases, default_expert_pov, auto_publish_enabled, auto_publish_daily_cap, auto_publish_min_quality",
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        report_email: string | null;
        report_enabled: boolean | null;
        voice_profile: string | null;
        banned_phrases: string[] | null;
        default_expert_pov: string | null;
        auto_publish_enabled: boolean | null;
        auto_publish_daily_cap: number | null;
        auto_publish_min_quality: number | null;
      } | null;
    },
  });

  useEffect(() => {
    if (settings && !privateLoading && !privateError) {
      setForm({
        ...defaultSettings,
        ...settings,
        author_credentials: (settings.author_credentials as string[]) ?? [],
        author_social_links:
          (settings.author_social_links as Record<string, string>) ?? {},
        // Strategy fields now live in site_settings_private (admin-only) to
        // avoid leaking voice/banned/POV/gate config to anonymous visitors.
        banned_phrases: (privateSettings?.banned_phrases as string[]) ?? [],
        voice_profile: privateSettings?.voice_profile ?? "",
        default_expert_pov: privateSettings?.default_expert_pov ?? "",
        image_generation_enabled: settings.image_generation_enabled !== false,
        newsletter_from_address: settings.newsletter_from_address ?? "",
        newsletter_reply_to: settings.newsletter_reply_to ?? "",
        newsletter_postal_address: settings.newsletter_postal_address ?? "",
        report_email: privateSettings?.report_email ?? "",
        report_enabled: privateSettings?.report_enabled ?? false,
      } as Settings);
    }
  }, [settings, privateSettings, privateLoading, privateError]);

  const saveMutation = useMutation({
    mutationFn: () =>
      safeMutation(async () => {
        if (isLoading || privateLoading || settingsError || privateError)
          throw new Error("Settings are not loaded. Reload before saving.");
        const payload = {
          site_name: form.site_name,
          site_url: normalizeOrigin(form.site_url),
          publisher_name: form.publisher_name,
          publisher_url: (form.publisher_url ?? "").trim(),
          author_name: form.author_name,
          author_title: form.author_title,
          author_bio: form.author_bio,
          author_credentials: form.author_credentials,
          author_social_links: trimLinks(form.author_social_links),
          cta_url: (form.cta_url ?? "").trim(),
          cta_headline: form.cta_headline,
          cta_subtext: form.cta_subtext,
          cta_button_text: form.cta_button_text,
          cta_social_proof: form.cta_social_proof,
          image_generation_enabled: form.image_generation_enabled,
          newsletter_from_address: form.newsletter_from_address.trim() || null,
          newsletter_reply_to: form.newsletter_reply_to.trim() || null,
          newsletter_postal_address:
            form.newsletter_postal_address.trim() || null,
          updated_at: new Date().toISOString(),
        };

        if (settings?.id) {
          const { error } = await supabase
            .from("site_settings")
            .update(payload)
            .eq("id", settings.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("site_settings")
            .insert(payload);
          if (error) throw error;
        }

        // Persist sensitive config (report + voice/banned/POV/gates) to the
        // admin-only table. RLS on site_settings_private already restricts this
        // to admins; edge functions read via service role.
        const privatePayload = {
          report_email: (form.report_email || "").trim(),
          report_enabled: form.report_enabled || false,
          voice_profile: form.voice_profile || null,
          banned_phrases: form.banned_phrases,
          default_expert_pov: form.default_expert_pov || null,
          updated_at: new Date().toISOString(),
        };
        if (privateSettings?.id) {
          const { error } = await supabase
            .from("site_settings_private")
            .update(privatePayload)
            .eq("id", privateSettings.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("site_settings_private")
            .insert(privatePayload);
          if (error) throw error;
        }
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-site-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-site-settings-private"] });
      qc.invalidateQueries({ queryKey: ["admin-indexnow-keyfile"] });
      toast({
        title: "Settings saved",
        description: "Your site settings have been updated.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Save failed",
        description: checkViolationMessage(err) ?? errorMessage(err),
        variant: "destructive",
      });
    },
  });

  const save = () => {
    const found = validateSiteSettings(form);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(fid(first))?.focus();
      toast({
        title: "Fix the highlighted fields",
        description: `${Object.keys(found).length} field(s) need a valid format before saving.`,
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });

  const updateField = (key: keyof Settings, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearError(key);
    if (key === "report_enabled") clearError("report_email");
  };

  const updateSocial = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      author_social_links: { ...prev.author_social_links, [key]: value },
    }));
    clearError(`social.${key}`);
  };

  const addCredential = () => {
    const trimmed = credentialInput.trim();
    if (trimmed && !form.author_credentials.includes(trimmed)) {
      updateField("author_credentials", [...form.author_credentials, trimmed]);
      setCredentialInput("");
    }
  };

  const addBannedPhrases = (raw: string) => {
    const next = [...form.banned_phrases];
    for (const part of raw.split(/[\n,]/)) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed && !next.includes(trimmed)) next.push(trimmed);
    }
    updateField("banned_phrases", next);
  };

  // Shared props for a text control bound to a form key.
  const bind = (key: keyof Settings) => ({
    id: fid(key),
    className: "admin-input font-body",
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      updateField(key, e.target.value),
  });

  if (settingsError || privateError)
    return (
      <p role="alert">
        Unable to load settings. Please reload before making changes.
      </p>
    );

  if (isLoading || privateLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: 300 }}
      >
        <Loader2
          size={24}
          className="animate-spin"
          aria-label="Loading settings"
          style={{ color: "hsl(var(--admin-text-ghost))" }}
        />
      </div>
    );
  }

  const reportEmailMissing = !form.report_email.trim();

  return (
    <div className="min-w-0">
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        style={{ marginBottom: 28 }}
      >
        <div className="min-w-0">
          <h1
            className="font-body"
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "hsl(var(--admin-text))",
            }}
          >
            Site Config
          </h1>
          <p
            className="font-body"
            style={{
              fontSize: 13,
              color: "hsl(var(--admin-text-ghost))",
              marginTop: 4,
            }}
          >
            Configure your site identity, author profile, and global CTA
            settings.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn-primary font-body"
          onClick={save}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && (
            <Loader2
              size={14}
              className="animate-spin"
              aria-hidden
              style={{ marginRight: 6 }}
            />
          )}
          Save Settings
        </button>
      </div>

      {/* One column on phones; form + sticky sidebar from lg up. */}
      <div
        data-testid="settings-layout"
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start"
      >
        <div className="flex flex-col gap-5 min-w-0">
          <SectionCard title="Site Identity">
            <Field label="Site Name">
              <input {...bind("site_name")} />
            </Field>
            <Field
              label="Site URL"
              error={errors.site_url}
              hint="Your public address. Canonical links, the sitemap, newsletters and IndexNow all use it."
            >
              <input
                {...bind("site_url")}
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://yoursite.com"
              />
            </Field>
            <Field label="Publisher Name">
              <input {...bind("publisher_name")} />
            </Field>
            <Field label="Publisher URL" error={errors.publisher_url}>
              <input
                {...bind("publisher_url")}
                type="url"
                inputMode="url"
                placeholder="https://yoursite.com"
              />
            </Field>
          </SectionCard>

          <section
            className="admin-card min-w-0"
            style={{
              padding: 24,
              border: "1px solid hsl(var(--admin-accent) / 0.45)",
            }}
          >
            <h2
              className="font-body"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "hsl(var(--admin-text))",
                marginBottom: 16,
              }}
            >
              Admin email &amp; weekly reports
            </h2>
            <div className="flex flex-col gap-4">
              <Field
                label="Report email"
                error={errors.report_email}
                hint="The Monday newsletter preview is sent to this address so you can check it before Tuesday's send. Weekly reports also go here when they are switched on below."
              >
                <input
                  {...bind("report_email")}
                  type="email"
                  autoComplete="email"
                  placeholder="you@yourdomain.com"
                  style={{ fontSize: 15, padding: "10px 12px" }}
                />
              </Field>
              {reportEmailMissing && !errors.report_email && (
                <p
                  role="status"
                  className="font-body flex items-start gap-2"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    padding: "8px 10px",
                    borderRadius: 6,
                    backgroundColor: "hsl(40 90% 55% / 0.08)",
                    border: "1px solid hsl(40 90% 55% / 0.25)",
                  }}
                >
                  <AlertTriangle
                    size={14}
                    aria-hidden
                    style={{ color: "hsl(40 90% 45%)", flexShrink: 0 }}
                  />
                  No address set, so no Monday newsletter preview is sent.
                </p>
              )}
              <div className="flex items-center gap-3">
                <Switch
                  id={fid("report_enabled")}
                  aria-labelledby={`${fid("report_enabled")}-label`}
                  checked={form.report_enabled ?? false}
                  onCheckedChange={(v) => updateField("report_enabled", v)}
                />
                <span
                  id={`${fid("report_enabled")}-label`}
                  className="font-body"
                  style={toggleText}
                >
                  Enable weekly email reports
                </span>
              </div>
            </div>
          </section>

          <SectionCard title="Author / Owner">
            <Field label="Author Name">
              <input {...bind("author_name")} />
            </Field>
            <Field label="Author Title">
              <input
                {...bind("author_title")}
                placeholder="Entrepreneur, Educator, Speaker"
              />
            </Field>
            <Field label="Author Bio">
              <textarea
                {...bind("author_bio")}
                rows={4}
                style={{ resize: "vertical" }}
              />
            </Field>
            <div role="group" aria-labelledby={fid("credentials-heading")}>
              <span id={fid("credentials-heading")} className="admin-label">
                Author Credentials
              </span>
              <div style={{ marginTop: 6 }}>
                <ChipList
                  items={form.author_credentials}
                  onRemove={(idx) =>
                    updateField(
                      "author_credentials",
                      form.author_credentials.filter((_, i) => i !== idx),
                    )
                  }
                  removeLabel={(c) => `Remove credential ${c}`}
                />
                <div className="flex gap-2 min-w-0">
                  <input
                    className="admin-input font-body min-w-0"
                    aria-label="Add a credential"
                    value={credentialInput}
                    onChange={(e) => setCredentialInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), addCredential())
                    }
                    placeholder="Type a credential and press Enter"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="admin-btn-ghost font-body"
                    onClick={addCredential}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      border: "1px solid hsl(var(--admin-border))",
                      borderRadius: 6,
                      background: "none",
                      color: "hsl(var(--admin-text-soft))",
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend className="admin-label">Social Links</legend>
              <div className="flex flex-col gap-2.5" style={{ marginTop: 8 }}>
                {socialPlatforms.map((p) => {
                  const key = `social.${p.key}`;
                  const error = errors[key];
                  return (
                    <div key={p.key} className="min-w-0">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
                        <label
                          htmlFor={fid(key)}
                          className="font-body sm:w-20 sm:shrink-0 sm:text-right"
                          style={{
                            fontSize: 12,
                            color: "hsl(var(--admin-text-ghost))",
                          }}
                        >
                          {p.label}
                        </label>
                        <input
                          id={fid(key)}
                          className="admin-input font-body min-w-0 flex-1"
                          type="url"
                          inputMode="url"
                          value={form.author_social_links[p.key] ?? ""}
                          onChange={(e) => updateSocial(p.key, e.target.value)}
                          placeholder={p.placeholder}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={
                            error ? `${fid(key)}-error` : undefined
                          }
                        />
                      </div>
                      {error && (
                        <FieldError id={`${fid(key)}-error`}>
                          {error}
                        </FieldError>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </SectionCard>

          <SectionCard title="Call-to-Action (CTA)">
            <Field label="CTA URL" error={errors.cta_url}>
              <input
                {...bind("cta_url")}
                inputMode="url"
                placeholder="https://yourfreetraining.com or /offers/your-offer"
              />
            </Field>
            <Field label="CTA Headline">
              <input
                {...bind("cta_headline")}
                placeholder="Free 3-Day Training"
              />
            </Field>
            <Field label="CTA Subtext">
              <textarea
                {...bind("cta_subtext")}
                rows={2}
                style={{ resize: "vertical" }}
              />
            </Field>
            <Field label="CTA Button Text">
              <input
                {...bind("cta_button_text")}
                placeholder="Get Free Access"
              />
            </Field>
            <Field label="CTA Social Proof Line">
              <input
                {...bind("cta_social_proof")}
                placeholder="Rated 4.9/5 by attendees"
              />
            </Field>
          </SectionCard>

          <ContentOfferRoutesManager />

          <SectionCard
            title="Content Voice"
            intro="Applied to every AI generation and revision pass. Voice profile shapes tone; banned phrases are hard failures that trigger a rewrite."
          >
            <Field label="Voice Profile">
              <textarea
                {...bind("voice_profile")}
                rows={10}
                placeholder="Describe the voice: tone, sentence rhythm, vocabulary rules, structural quirks…"
                style={{ ...monoInput, lineHeight: 1.6 }}
              />
            </Field>
            <div role="group" aria-labelledby={fid("banned-heading")}>
              <span id={fid("banned-heading")} className="admin-label">
                Banned Phrases ({form.banned_phrases.length})
              </span>
              <div style={{ marginTop: 6 }}>
                <ChipList
                  items={form.banned_phrases}
                  onRemove={(idx) =>
                    updateField(
                      "banned_phrases",
                      form.banned_phrases.filter((_, i) => i !== idx),
                    )
                  }
                  removeLabel={(p) => `Remove banned phrase ${p}`}
                  chipStyle={{
                    fontSize: 11,
                    backgroundColor: "hsl(0 70% 50% / 0.1)",
                    color: "hsl(0 70% 45%)",
                    border: "1px solid hsl(0 70% 50% / 0.25)",
                    fontFamily: monoInput.fontFamily,
                  }}
                />
                <textarea
                  className="admin-input font-body"
                  aria-label="Add banned phrases"
                  aria-describedby={fid("banned-hint")}
                  rows={4}
                  placeholder="One phrase per line. Paste a whole list — it will be split and deduplicated on save."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addBannedPhrases(e.currentTarget.value);
                      e.currentTarget.value = "";
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      addBannedPhrases(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  style={monoInput}
                />
                <p
                  id={fid("banned-hint")}
                  className="font-body"
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-text-ghost))",
                    marginTop: 6,
                  }}
                >
                  Case-insensitive substring match. Press Enter or click away to
                  add. Matched phrases block publishing until fixed.
                </p>
              </div>
            </div>
            <Field label="Default Expert POV (site-wide fallback for 'From the trenches' callouts)">
              <textarea
                {...bind("default_expert_pov")}
                rows={5}
                placeholder="First-person background used when a niche has no expert_pov of its own. Only claims from this text will appear in callouts."
                style={{ resize: "vertical", fontSize: 12, lineHeight: 1.6 }}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Switch
                id={fid("image_generation_enabled")}
                aria-labelledby={`${fid("image_generation_enabled")}-label`}
                checked={form.image_generation_enabled}
                onCheckedChange={(v) =>
                  updateField("image_generation_enabled", v)
                }
              />
              <span
                id={`${fid("image_generation_enabled")}-label`}
                className="font-body"
                style={toggleText}
              >
                Generate one editorial image per resource page (uses provider
                credits)
              </span>
            </div>
          </SectionCard>

          <SectionCard
            title="Newsletter delivery"
            intro="Use a sender verified with your email provider. Weekly digests require your business mailing address."
          >
            <Field
              label="Verified sender"
              error={errors.newsletter_from_address}
              hint="Format: Name <email@yourdomain.com>"
            >
              <input
                {...bind("newsletter_from_address")}
                placeholder="Your Name <you@yourdomain.com>"
              />
            </Field>
            <Field label="Reply-to email" error={errors.newsletter_reply_to}>
              <input
                {...bind("newsletter_reply_to")}
                type="email"
                autoComplete="email"
              />
            </Field>
            <Field label="Business mailing address">
              <textarea {...bind("newsletter_postal_address")} />
            </Field>
          </SectionCard>
        </div>

        {/* Sidebar: CTA preview + crawler status. Sticky on large screens only. */}
        <div className="flex flex-col gap-5 min-w-0 lg:sticky lg:top-8">
          <CtaPreview
            headline={form.cta_headline}
            subtext={form.cta_subtext}
            buttonText={form.cta_button_text}
            socialProof={form.cta_social_proof}
          />
          <SitemapInfoCard siteUrl={form.site_url} />
          <IndexNowCard />
        </div>
      </div>
    </div>
  );
};

export default SiteSettingsManager;
