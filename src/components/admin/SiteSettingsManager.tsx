import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X } from "lucide-react";

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
};

type Settings = typeof defaultSettings & { id?: string };

const socialPlatforms = [
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/yourname" },
  { key: "twitter", label: "Twitter / X", placeholder: "https://x.com/yourhandle" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourhandle" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourchannel" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourhandle" },
];

const SiteSettingsManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings>(defaultSettings);
  const [credentialInput, setCredentialInput] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        ...defaultSettings,
        ...settings,
        author_credentials: (settings.author_credentials as string[]) ?? [],
        author_social_links: (settings.author_social_links as Record<string, string>) ?? {},
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        site_name: form.site_name,
        site_url: form.site_url,
        publisher_name: form.publisher_name,
        publisher_url: form.publisher_url,
        author_name: form.author_name,
        author_title: form.author_title,
        author_bio: form.author_bio,
        author_credentials: form.author_credentials,
        author_social_links: form.author_social_links,
        cta_url: form.cta_url,
        cta_headline: form.cta_headline,
        cta_subtext: form.cta_subtext,
        cta_button_text: form.cta_button_text,
        cta_social_proof: form.cta_social_proof,
        updated_at: new Date().toISOString(),
      };

      if (settings?.id) {
        const { error } = await supabase
          .from("site_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("site_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-site-settings"] });
      toast({ title: "Settings saved", description: "Your site settings have been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const updateField = (key: keyof Settings, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSocial = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      author_social_links: { ...prev.author_social_links, [key]: value },
    }));
  };

  const addCredential = () => {
    const trimmed = credentialInput.trim();
    if (trimmed && !form.author_credentials.includes(trimmed)) {
      updateField("author_credentials", [...form.author_credentials, trimmed]);
      setCredentialInput("");
    }
  };

  const removeCredential = (idx: number) => {
    updateField(
      "author_credentials",
      form.author_credentials.filter((_, i) => i !== idx)
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 300 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-text-ghost))" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
        <div>
          <h1
            className="font-body"
            style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))" }}
          >
            Site Config
          </h1>
          <p
            className="font-body"
            style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}
          >
            Configure your site identity, author profile, and global CTA settings.
          </p>
        </div>
        <button
          className="admin-btn-primary font-body"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />}
          Save Settings
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
        {/* Left column - Forms */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Section 1: Site Identity */}
          <div className="admin-card" style={{ padding: 24 }}>
            <h2
              className="font-body"
              style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 20 }}
            >
              Site Identity
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Site Name">
                <input
                  className="admin-input font-body"
                  value={form.site_name}
                  onChange={(e) => updateField("site_name", e.target.value)}
                />
              </Field>
              <Field label="Site URL">
                <input
                  className="admin-input font-body"
                  value={form.site_url}
                  onChange={(e) => updateField("site_url", e.target.value)}
                  placeholder="https://yoursite.com"
                />
              </Field>
              <Field label="Publisher Name">
                <input
                  className="admin-input font-body"
                  value={form.publisher_name ?? ""}
                  onChange={(e) => updateField("publisher_name", e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Section 2: Author / Owner */}
          <div className="admin-card" style={{ padding: 24 }}>
            <h2
              className="font-body"
              style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 20 }}
            >
              Author / Owner
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Author Name">
                <input
                  className="admin-input font-body"
                  value={form.author_name}
                  onChange={(e) => updateField("author_name", e.target.value)}
                />
              </Field>
              <Field label="Author Title">
                <input
                  className="admin-input font-body"
                  value={form.author_title ?? ""}
                  onChange={(e) => updateField("author_title", e.target.value)}
                  placeholder="Entrepreneur, Educator, Speaker"
                />
              </Field>
              <Field label="Author Bio">
                <textarea
                  className="admin-input font-body"
                  rows={4}
                  value={form.author_bio ?? ""}
                  onChange={(e) => updateField("author_bio", e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </Field>
              <Field label="Author Credentials">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {form.author_credentials.map((cred, i) => (
                    <span
                      key={i}
                      className="font-body"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 999,
                        backgroundColor: "hsl(var(--admin-surface-2))",
                        color: "hsl(var(--admin-text-soft))",
                        border: "1px solid hsl(var(--admin-border))",
                      }}
                    >
                      {cred}
                      <button
                        onClick={() => removeCredential(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                      >
                        <X size={12} style={{ color: "hsl(var(--admin-text-ghost))" }} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="admin-input font-body"
                    value={credentialInput}
                    onChange={(e) => setCredentialInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCredential())}
                    placeholder="Type a credential and press Enter"
                    style={{ flex: 1 }}
                  />
                  <button
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
              </Field>

              {/* Social Links */}
              <div style={{ marginTop: 4 }}>
                <span className="admin-label">Social Links</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {socialPlatforms.map((p) => (
                    <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        className="font-body"
                        style={{
                          fontSize: 12,
                          color: "hsl(var(--admin-text-ghost))",
                          width: 80,
                          flexShrink: 0,
                          textAlign: "right",
                        }}
                      >
                        {p.label}
                      </span>
                      <input
                        className="admin-input font-body"
                        value={form.author_social_links[p.key] ?? ""}
                        onChange={(e) => updateSocial(p.key, e.target.value)}
                        placeholder={p.placeholder}
                        style={{ flex: 1 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: CTA */}
          <div className="admin-card" style={{ padding: 24 }}>
            <h2
              className="font-body"
              style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 20 }}
            >
              Call-to-Action (CTA)
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="CTA URL">
                <input
                  className="admin-input font-body"
                  value={form.cta_url ?? ""}
                  onChange={(e) => updateField("cta_url", e.target.value)}
                  placeholder="https://yourfreetraining.com"
                />
              </Field>
              <Field label="CTA Headline">
                <input
                  className="admin-input font-body"
                  value={form.cta_headline ?? ""}
                  onChange={(e) => updateField("cta_headline", e.target.value)}
                  placeholder="Free 3-Day Training"
                />
              </Field>
              <Field label="CTA Subtext">
                <textarea
                  className="admin-input font-body"
                  rows={2}
                  value={form.cta_subtext ?? ""}
                  onChange={(e) => updateField("cta_subtext", e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </Field>
              <Field label="CTA Button Text">
                <input
                  className="admin-input font-body"
                  value={form.cta_button_text ?? ""}
                  onChange={(e) => updateField("cta_button_text", e.target.value)}
                  placeholder="Get Free Access"
                />
              </Field>
              <Field label="CTA Social Proof Line">
                <input
                  className="admin-input font-body"
                  value={form.cta_social_proof ?? ""}
                  onChange={(e) => updateField("cta_social_proof", e.target.value)}
                  placeholder="Rated 4.9/5 by attendees"
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Right column - Live CTA Preview */}
        <div style={{ position: "sticky", top: 32 }}>
          <div className="admin-card" style={{ padding: 24 }}>
            <h2
              className="font-body"
              style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}
            >
              CTA Preview
            </h2>
            <div
              style={{
                padding: 28,
                borderRadius: 10,
                background: `linear-gradient(135deg, hsl(var(--admin-accent) / 0.12), hsl(var(--admin-surface-2)))`,
                border: "1px solid hsl(var(--admin-accent) / 0.2)",
                textAlign: "center",
              }}
            >
              <p
                className="font-body"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "hsl(var(--admin-text))",
                  marginBottom: 8,
                  lineHeight: 1.3,
                }}
              >
                {form.cta_headline || "Your Headline"}
              </p>
              <p
                className="font-body"
                style={{
                  fontSize: 13,
                  color: "hsl(var(--admin-text-soft))",
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {form.cta_subtext || "Your subtext goes here."}
              </p>
              <div
                style={{
                  display: "inline-block",
                  padding: "10px 28px",
                  borderRadius: 6,
                  backgroundColor: "hsl(var(--admin-accent))",
                  color: "hsl(var(--admin-accent-fg))",
                  fontSize: 13,
                  fontWeight: 600,
                }}
                className="font-body"
              >
                {form.cta_button_text || "Button Text"}
              </div>
              {form.cta_social_proof && (
                <p
                  className="font-body"
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-text-ghost))",
                    marginTop: 12,
                    fontStyle: "italic",
                  }}
                >
                  {form.cta_social_proof}
                </p>
              )}
            </div>
            <p
              className="font-body"
              style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 12, textAlign: "center" }}
            >
              Live preview — updates as you type
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <span className="admin-label">{label}</span>
    <div style={{ marginTop: 6 }}>{children}</div>
  </div>
);

export default SiteSettingsManager;
