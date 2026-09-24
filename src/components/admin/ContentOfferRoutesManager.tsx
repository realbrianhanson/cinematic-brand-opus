import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  contentRoutingClient,
  type ContentOfferRoute,
  type ContentOfferRouteInput,
  type ContentOfferScope,
} from "@/lib/contentOfferRouting";
import { errorMessage } from "@/lib/errorMessage";
import { Field, SectionCard } from "./site-settings/Field";

const scopes = {
  page: "One article or guide",
  content_type: "Resource type",
  niche: "Industry",
  default: "Default for content pages",
};
const pageTables = {
  post: "posts",
  generated: "generated_pages",
  pillar: "pillar_pages",
} as const;
type PageType = keyof typeof pageTables;
const emptyRule: ContentOfferRouteInput = {
  scope: "page",
  match_key: "",
  label: "",
  offer_id: "",
  headline: "",
  subtext: "",
  button_text: "",
};

export default function ContentOfferRoutesManager() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRule);
  const [editing, setEditing] = useState(false);
  const [pageType, setPageType] = useState<PageType>("post");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const qc = useQueryClient();
  const registry = useQuery({
    queryKey: ["admin-content-offer-routes"],
    enabled: open,
    queryFn: async () => {
      const [rules, offers, types, niches] = await Promise.all([
        contentRoutingClient
          .from("content_offer_routes")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("offers")
          .select("id,title,slug")
          .eq("status", "published")
          .eq("funnel_only", false)
          .order("title"),
        supabase.from("content_schemas").select("name,slug").order("name"),
        supabase.from("niches").select("name,slug").order("name"),
      ]);
      for (const result of [rules, offers, types, niches])
        if (result.error) throw result.error;
      return {
        rules: rules.data || [],
        offers: offers.data || [],
        types: types.data || [],
        niches: niches.data || [],
      };
    },
    retry: false,
  });
  const pages = useQuery({
    queryKey: ["admin-content-offer-pages", pageType, search],
    enabled: open && form.scope === "page" && !editing,
    queryFn: async () => {
      const escaped = search.trim().replace(/[\\%_]/g, "\\$&");
      const { data, error } = await supabase
        .from(pageTables[pageType])
        .select("id,title,slug")
        .eq("status", "published")
        .ilike("title", `%${escaped}%`)
        .order("title")
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-content-offer-routes"] }),
      qc.invalidateQueries({ queryKey: ["public-content-offer"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async () => {
      if (
        !form.match_key ||
        !form.label ||
        !registry.data?.offers.some((o) => o.id === form.offer_id)
      ) {
        throw new Error("Choose the content and a published offer first.");
      }
      const { error } = await contentRoutingClient
        .from("content_offer_routes")
        .upsert(form, { onConflict: "scope,match_key" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setMessage("Offer assignment saved.");
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await contentRoutingClient
        .from("content_offer_routes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setMessage(
        "Assignment removed. The next matching rule or global CTA will be used.",
      );
      setEditing(false);
      setForm(emptyRule);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const change = <K extends keyof ContentOfferRouteInput>(
    key: K,
    value: ContentOfferRouteInput[K],
  ) => {
    setForm((old) => ({ ...old, [key]: value }));
    setMessage("");
  };
  const edit = (rule: ContentOfferRoute) => {
    const { id: _id, updated_at: _updated, ...input } = rule;
    setForm(input);
    setEditing(true);
    setMessage("");
  };
  const options =
    form.scope === "content_type"
      ? registry.data?.types
      : registry.data?.niches;
  const busy = save.isPending || remove.isPending;
  return (
    <SectionCard
      title="Relevant offers for your content"
      intro="Send readers to the offer that helps with the topic they are reading. Each assignment saves separately from Site Config."
    >
      <button
        type="button"
        className="admin-btn-ghost"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide offer assignments" : "Manage offer assignments"}
      </button>
      {open && (
        <>
          <p className="text-sm text-muted-foreground">
            Priority: article or guide → resource type → industry → default
            offer → global CTA. Only published offers available outside a
            purchase funnel can be assigned. Unpublished offers are skipped
            automatically.
          </p>
          {registry.isPending && <p role="status">Loading assignments…</p>}
          {registry.error && (
            <p role="alert">
              Offer assignments could not be loaded. Apply the content offer
              routing migration, then reload. {errorMessage(registry.error)}
            </p>
          )}
          {registry.data && (
            <>
              <div className="space-y-3">
                {registry.data.rules.length === 0 && (
                  <p className="text-sm">
                    No assignments yet. Your global CTA is still used.
                  </p>
                )}
                {registry.data.rules.map((rule) => {
                  const offer = registry.data.offers.find(
                    (item) => item.id === rule.offer_id,
                  );
                  return (
                    <div
                      key={rule.id}
                      className="rounded border p-3 flex flex-wrap gap-3 items-center justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium break-words">{rule.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {scopes[rule.scope]} →{" "}
                          {offer?.title ||
                            "Offer unavailable — fallback is active"}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => edit(rule)}
                        >
                          Edit<span className="sr-only"> {rule.label}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => remove.mutate(rule.id)}
                        >
                          Remove<span className="sr-only"> {rule.label}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <fieldset
                disabled={busy}
                className="min-w-0 space-y-4 border-t pt-4"
              >
                {editing ? (
                  <div className="flex flex-wrap gap-3 items-center">
                    <p>Editing: {form.label}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(false);
                        setForm(emptyRule);
                        setMessage("");
                      }}
                    >
                      Start another assignment
                    </button>
                  </div>
                ) : (
                  <>
                    <Field label="Apply to">
                      <select
                        className="admin-input"
                        value={form.scope}
                        onChange={(e) => {
                          const scope = e.target.value as ContentOfferScope;
                          setForm({
                            ...emptyRule,
                            scope,
                            match_key: scope === "default" ? "*" : "",
                            label:
                              scope === "default"
                                ? "All content without a more specific match"
                                : "",
                          });
                        }}
                      >
                        {Object.entries(scopes).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {form.scope === "page" && (
                      <>
                        <Field label="Content kind">
                          <select
                            className="admin-input"
                            value={pageType}
                            onChange={(e) => {
                              setPageType(e.target.value as PageType);
                              change("match_key", "");
                            }}
                          >
                            <option value="post">Blog article</option>
                            <option value="generated">Resource</option>
                            <option value="pillar">Guide</option>
                          </select>
                        </Field>
                        <Field
                          label="Find published content"
                          hint="Search by title. Up to 50 results are shown."
                        >
                          <input
                            className="admin-input"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </Field>
                        {pages.error && (
                          <p role="alert">
                            Content could not be loaded. Try again.
                          </p>
                        )}
                        <Field label="Article or guide">
                          <select
                            className="admin-input"
                            value={form.match_key}
                            disabled={pages.isPending || !!pages.error}
                            onChange={(e) => {
                              const found = pages.data?.find(
                                (item) =>
                                  `${pageType}:${item.id}` === e.target.value,
                              );
                              setForm((old) => ({
                                ...old,
                                match_key: e.target.value,
                                label: found?.title || "",
                              }));
                            }}
                          >
                            <option value="">Choose published content</option>
                            {form.match_key &&
                              !pages.data?.some(
                                (item) =>
                                  `${pageType}:${item.id}` === form.match_key,
                              ) && (
                                <option value={form.match_key}>
                                  {form.label}
                                </option>
                              )}
                            {pages.data?.map((item) => (
                              <option
                                key={item.id}
                                value={`${pageType}:${item.id}`}
                              >
                                {item.title} ({item.slug})
                              </option>
                            ))}
                          </select>
                        </Field>
                      </>
                    )}
                    {(form.scope === "content_type" ||
                      form.scope === "niche") && (
                      <Field label={scopes[form.scope]}>
                        <select
                          className="admin-input"
                          value={form.match_key}
                          onChange={(e) =>
                            setForm((old) => ({
                              ...old,
                              match_key: e.target.value,
                              label:
                                options?.find(
                                  (item) => item.slug === e.target.value,
                                )?.name || "",
                            }))
                          }
                        >
                          <option value="">Choose a match</option>
                          {options?.map((item) => (
                            <option key={item.slug} value={item.slug}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </>
                )}
                <Field label="Recommended offer">
                  <select
                    className="admin-input"
                    value={form.offer_id}
                    onChange={(e) => change("offer_id", e.target.value)}
                  >
                    <option value="">Choose a published offer</option>
                    {form.offer_id &&
                      !registry.data.offers.some(
                        (item) => item.id === form.offer_id,
                      ) && (
                        <option value={form.offer_id} disabled>
                          Offer no longer available — choose another
                        </option>
                      )}
                    {registry.data.offers.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offer.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Headline (optional)"
                  hint="Uses the offer title when empty."
                >
                  <input
                    className="admin-input"
                    maxLength={200}
                    value={form.headline}
                    onChange={(e) => change("headline", e.target.value)}
                  />
                </Field>
                <Field
                  label="Supporting copy (optional)"
                  hint="Uses the offer summary when empty."
                >
                  <textarea
                    className="admin-input"
                    maxLength={1000}
                    value={form.subtext}
                    onChange={(e) => change("subtext", e.target.value)}
                  />
                </Field>
                <Field label="Button text (optional)">
                  <input
                    className="admin-input"
                    maxLength={80}
                    value={form.button_text}
                    onChange={(e) => change("button_text", e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="admin-btn-primary"
                  disabled={
                    busy ||
                    !form.match_key ||
                    !registry.data.offers.some((o) => o.id === form.offer_id)
                  }
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save offer assignment"}
                </button>
                <p className="text-sm text-muted-foreground">
                  Saving replaces any assignment for the same content. Native
                  offer links open in the current tab. A default rule applies to
                  articles, resources and guides, including their content
                  listings.
                </p>
              </fieldset>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </SectionCard>
  );
}
