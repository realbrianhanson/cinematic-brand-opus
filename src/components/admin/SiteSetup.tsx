import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useSiteConfig } from "@/config/SiteConfigContext";
import {
  buildRuntimeConfig,
  setupDefaults,
  setupSchema,
  type SetupValues,
} from "@/config/runtime";
import { memberPreset } from "@/config/presets/member";
import { brandStyles } from "@/config/brandStyles";
import type { Json } from "@/integrations/supabase/types";
import QueryNotice from "./QueryNotice";
import { toast } from "sonner";
const steps = ["Identity", "Brand & offer", "Preview & launch"];
export default function SiteSetup() {
  const config = useSiteConfig();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SetupValues | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const settings = useQuery({
    queryKey: ["site-setup"],
    queryFn: async () => {
      const [brand, identity] = await Promise.all([
        supabase
          .from("site_branding")
          .select("settings")
          .eq("id", true)
          .maybeSingle(),
        supabase.rpc("admin_read_site_settings"),
      ]);
      if (brand.error) throw brand.error;
      if (identity.error) throw identity.error;
      const row = identity.data?.[0];
      return {
        values: brand.data
          ? setupSchema.parse(brand.data.settings)
          : { ...setupDefaults(config), authorBio: row?.author_bio || "" },
        initialized: !!row,
      };
    },
  });
  const values = draft || settings.data?.values || setupDefaults(config);
  const parsed = setupSchema.safeParse(values);
  const preview = parsed.success ? buildRuntimeConfig(parsed.data) : config;
  const save = useMutation({
    mutationFn: async (value: SetupValues) => {
      const { error } = await supabase.rpc("save_site_branding", {
        value: value as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await router.invalidate();
      await settings.refetch();
      setDraft(null);
      toast.success("Site identity and public branding updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const change = (field: keyof SetupValues, value: string) =>
    setDraft({ ...values, [field]: value });
  const field = (
    key: keyof SetupValues,
    label: string,
    hint?: string,
    multiline = false,
  ) => (
    <label className="grid gap-2" key={key}>
      <span className="font-medium">{label}</span>
      {multiline ? (
        <textarea
          className="admin-input min-h-28"
          value={values[key]}
          onChange={(e) => change(key, e.target.value)}
        />
      ) : (
        <input
          className="admin-input"
          type={key === "accent" ? "color" : "text"}
          value={values[key]}
          onChange={(e) => change(key, e.target.value)}
        />
      )}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
  return (
    <section className="space-y-6 max-w-5xl">
      <header>
        <h1 className="admin-page-title">Make this site yours</h1>
        <p className="text-muted-foreground mt-2">
          Set your identity, niche, brand, and offer. Preview your changes
          before applying them to the public website.
        </p>
      </header>
      <QueryNotice
        loading={settings.isPending}
        error={settings.error}
        retry={() => settings.refetch()}
      />
      {!settings.isPending && !settings.error && (
        <>
          <nav aria-label="Setup steps" className="flex flex-wrap gap-2">
            {steps.map((label, index) => (
              <button
                className={
                  step === index ? "admin-btn-primary" : "admin-btn-secondary"
                }
                aria-current={step === index ? "step" : undefined}
                onClick={() => setStep(index)}
                key={label}
              >
                {index + 1}. {label}
              </button>
            ))}
          </nav>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!parsed.success) {
                setIssues(
                  parsed.error.issues.map(
                    (i) => `${i.path.join(".")}: ${i.message}`,
                  ),
                );
                return;
              }
              setIssues([]);
              if (step < 2) setStep(step + 1);
              else save.mutate(parsed.data);
            }}
            className="admin-card p-6 space-y-6"
          >
            <fieldset disabled={save.isPending} className="space-y-6">
              {step === 0 && (
                <>
                  <label className="grid gap-2">
                    <span>Starting point</span>
                    <select
                      className="admin-input"
                      value={values.mode}
                      onChange={(e) => {
                        if (e.target.value === "member")
                          setDraft({
                            ...setupDefaults(memberPreset),
                            mode: "member",
                          });
                        else
                          setDraft({
                            ...setupDefaults(config),
                            mode: "owner",
                            authorBio: settings.data?.values.authorBio || "",
                          });
                      }}
                    >
                      <option value="owner">
                        Keep the current personal website sections
                      </option>
                      <option value="member">
                        Fresh member brand — hide personal proof and photos
                      </option>
                    </select>
                  </label>
                  <p className="text-sm text-muted-foreground">
                    For a member copy, choose the fresh starting point. It
                    removes Brian’s homepage claims, photos, testimonials,
                    external offers, and domain verification. Existing articles
                    and private account data are separate; use a fresh backend
                    for a member installation.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-5">
                    {field("name", "Name or brand")}
                    {field("initials", "Logo initials")}
                    {field("role", "Role or positioning")}
                    {field(
                      "niche",
                      "Topics / niche",
                      "Separate topics with commas.",
                    )}
                    {field(
                      "siteUrl",
                      "Canonical website address",
                      "Example: https://yourdomain.com. Configure the same domain in Lovable before launch.",
                    )}
                    {field("email", "Public contact email (optional)")}
                  </div>
                  {field("headline", "Homepage headline")}
                  {field(
                    "description",
                    "Who you help and how",
                    undefined,
                    true,
                  )}
                  {field(
                    "authorBio",
                    "Author bio",
                    "Use real experience and credentials. This appears on articles.",
                    true,
                  )}
                </>
              )}
              {step === 1 && (
                <>
                  <div className="grid sm:grid-cols-2 gap-5">
                    {field("accent", "Accent color")}
                    {field(
                      "logo",
                      "Logo image URL (optional)",
                      "Upload your image in Media library, then paste its public URL. Initials are used when empty.",
                    )}
                    {field(
                      "favicon",
                      "Favicon image URL",
                      "Use a square PNG. A fresh member site never inherits Brian’s favicon.",
                    )}
                    {field(
                      "socialImage",
                      "Social preview image URL (optional)",
                      "Use an HTTPS image, ideally 1200 × 630.",
                    )}
                    {field(
                      "offerLabel",
                      "Main call-to-action label (optional)",
                    )}
                    {field(
                      "offerUrl",
                      "Main call-to-action destination",
                      "Use an HTTPS URL or a path such as /resources.",
                    )}
                  </div>
                  <Link className="underline" to="/admin/library">
                    Open media library
                  </Link>
                </>
              )}
              {step === 2 && (
                <>
                  <div
                    className="rounded-xl p-8 md:p-12 text-white"
                    style={{
                      ...brandStyles(preview.brand),
                      background: preview.brand.backdrop,
                    }}
                  >
                    <p
                      className="font-semibold"
                      style={{ color: preview.brand.accent }}
                    >
                      {preview.identity.name} · {preview.identity.role}
                    </p>
                    <h2 className="font-heading text-4xl my-6">
                      {preview.hero.headlineLines.map((l) => l.text).join(" ")}
                    </h2>
                    <p className="max-w-2xl leading-relaxed text-white/80">
                      {preview.hero.subtitle}
                    </p>
                    {preview.hero.primaryCta && (
                      <span
                        className="inline-block rounded-lg px-5 py-3 mt-6 text-black font-semibold"
                        style={{ background: preview.brand.accent }}
                      >
                        {preview.hero.primaryCta.label}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-semibold">Launch checklist</h2>
                  <ul className="space-y-3 list-disc pl-5">
                    <li>
                      Connect your domain in Lovable and verify the address
                      above.
                    </li>
                    <li>
                      Use your own backend and admin account for a member copy.
                      Follow{" "}
                      <a
                        href="https://github.com/realbrianhanson/cinematic-brand-opus/blob/main/PUSH_TEN_SETUP.md"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        the member setup guide
                      </a>
                      .
                    </li>
                    <li>
                      <Link className="underline" to="/admin/site-settings">
                        Check author credentials, email sender, postal address,
                        and newsletter settings
                      </Link>
                      .
                    </li>
                    <li>
                      <Link className="underline" to="/admin/settings">
                        Configure your integrations
                      </Link>{" "}
                      before enabling automated publishing or sending.
                    </li>
                    <li>
                      <Link className="underline" to="/admin/posts">
                        Review your content
                      </Link>
                      , replace owner-specific articles, and test links on
                      mobile.
                    </li>
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    Applying updates the live site’s homepage, navigation,
                    colors, metadata, author identity, and main offer. It does
                    not copy private data, configure a domain, or enable
                    integrations.
                  </p>
                </>
              )}
            </fieldset>
            {issues.length > 0 && (
              <div role="alert" className="text-red-500">
                <p>Check these fields before continuing:</p>
                <ul>
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
            {!settings.data?.initialized && (
              <p role="alert">
                Save initial settings under Brand & author before applying
                setup.
              </p>
            )}
            <div className="flex justify-between gap-3">
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={step === 0 || save.isPending}
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
              <button
                className="admin-btn-primary"
                disabled={
                  save.isPending || (step === 2 && !settings.data?.initialized)
                }
              >
                {save.isPending
                  ? "Applying…"
                  : step === 2
                    ? "Apply site setup"
                    : "Continue"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
