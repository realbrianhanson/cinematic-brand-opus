import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { OfferBuilder, OfferPage } from "@/lib/offerBuilder";
import {
  applyOfferCopy,
  canEditOfferSection,
  offerCopyModes,
  offerCopyRequestSchema,
  offerCopyResponseSchema,
  type OfferCopyProduct,
  type OfferCopyRequest,
  type OfferCopyResponse,
} from "@/lib/offerCopy";

export type OfferCopyAssistantProps = {
  builder: OfferBuilder;
  offer: OfferCopyProduct;
  stage: "landing" | "upsell";
  onApply: (page: OfferPage, stage: "landing" | "upsell") => void;
};
type Result = {
  response: OfferCopyResponse;
  request: OfferCopyRequest;
  source: string;
};

export default function OfferCopyAssistant({
  builder,
  offer,
  stage,
  onApply,
}: OfferCopyAssistantProps) {
  const [mode, setMode] = useState<OfferCopyRequest["mode"]>("angles");
  const [sectionId, setSectionId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [applied, setApplied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const page = builder.presentation[stage];
  const source = JSON.stringify({ builder, offer, stage });
  const stale = !!result && result.source !== source;
  const editableSections = page.sections.filter((section) =>
    canEditOfferSection(section.type),
  );

  async function generate() {
    if (busy) return;
    setError("");
    const section = editableSections.find((item) => item.id === sectionId);
    const parsed = offerCopyRequestSchema.safeParse({
      mode,
      stage,
      strategy: builder.strategy,
      offer: {
        title: offer.title,
        summary: offer.summary,
        body: offer.body.slice(0, 12000),
        kind: offer.kind,
        checkout_mode: offer.checkout_mode || "native",
        price_display_mode: offer.price_display_mode || "fixed",
        amount_minor: offer.amount_minor,
        currency: offer.currency,
      },
      currentCopy: {
        headline: page.headline,
        subheadline: page.subheadline,
        ...(mode === "section" && section
          ? {
              section: {
                id: section.id,
                type: section.type,
                heading: section.heading,
                body: section.body,
              },
            }
          : {}),
      },
      proofIds: builder.proofIds,
      instruction,
    });
    if (!parsed.success) {
      setError(
        "Choose a sales-copy section and check that the product and brief fields are complete.",
      );
      return;
    }
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    setBusy(true);
    setResult(null);
    setApplied(false);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token)
        throw new Error("Sign in again to use the copy assistant.");
      const response = await fetch("/api/admin/offer-copy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify(parsed.data),
        signal: current.signal,
      });
      const output = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof output?.error === "string"
            ? output.error
            : "The copy assistant is unavailable. Your draft is unchanged.",
        );
      const validated = offerCopyResponseSchema.safeParse(output);
      if (!validated.success)
        throw new Error(
          "The suggestion could not be read. Your draft is unchanged.",
        );
      if (!current.signal.aborted)
        setResult({ response: validated.data, request: parsed.data, source });
    } catch (failure) {
      if (!current.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "The assistant could not finish. Your draft is unchanged.",
        );
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="admin-card space-y-4 p-5" aria-label="Copy assistant">
      <div className="flex items-center gap-2">
        <Sparkles size={18} aria-hidden="true" />
        <h3 className="font-semibold">Copy assistant</h3>
      </div>
      <p className="text-sm opacity-75">
        Use your strategy, approved evidence and configured voice to draft{" "}
        {stage === "upsell" ? "the next-step pitch" : "your sales argument"}.
        Choose a suggestion to apply to the working draft.
      </p>
      <label className="block text-sm">
        What should we improve?
        <select
          className="admin-input mt-2 w-full"
          value={mode}
          onChange={(event) =>
            setMode(event.target.value as OfferCopyRequest["mode"])
          }
          disabled={busy}
        >
          {Object.entries(offerCopyModes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {mode === "section" && (
        <label className="block text-sm">
          Section to improve
          <select
            className="admin-input mt-2 w-full"
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
            disabled={busy}
          >
            <option value="">Choose a section</option>
            {editableSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.heading || section.type}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        Direction <span className="opacity-60">(optional)</span>
        <textarea
          className="admin-input mt-2 w-full"
          rows={3}
          maxLength={1000}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Example: Make this clearer for a busy business owner coming from our email."
          disabled={busy}
        />
      </label>
      <button
        type="button"
        className="admin-btn-primary"
        disabled={busy || (mode === "section" && !sectionId)}
        onClick={() => void generate()}
      >
        {busy ? "Writing suggestions…" : "Generate suggestions"}
      </button>
      <p className="text-xs opacity-60">
        Generation uses your site's A.I. gateway. Review every claim before
        applying. Proof, guarantees, prices and publication stay under your
        control.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      {stale && !applied && (
        <p role="status" className="text-sm">
          This draft changed after generation. Generate again to apply
          suggestions to the current version.
        </p>
      )}
      {applied && (
        <p role="status" className="text-sm">
          Suggestion applied to the working draft. Review and save it when
          ready.
        </p>
      )}
      {result && (
        <div className="space-y-4">
          {result.response.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {result.response.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          {result.response.suggestions.map((suggestion, index) => (
            <article
              key={index}
              className="space-y-3 rounded border border-current/15 p-4"
            >
              <h4 className="font-semibold">{suggestion.title}</h4>
              {suggestion.target === "headline" ? (
                <>
                  <p className="font-semibold">{suggestion.headline}</p>
                  <p className="whitespace-pre-line text-sm">
                    {suggestion.subheadline}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">{suggestion.heading}</p>
                  <p className="whitespace-pre-line text-sm">
                    {suggestion.body}
                  </p>
                </>
              )}
              <p className="text-xs opacity-70">{suggestion.explanation}</p>
              {suggestion.evidenceIds.length > 0 && (
                <p className="text-xs opacity-70">
                  Grounded in {suggestion.evidenceIds.length} approved evidence{" "}
                  {suggestion.evidenceIds.length === 1 ? "item" : "items"}.
                </p>
              )}
              {suggestion.missingFacts.length > 0 && (
                <div className="text-sm">
                  <p className="font-semibold">Facts to verify or add</p>
                  <ul className="list-disc pl-5">
                    {suggestion.missingFacts.map((fact, i) => (
                      <li key={i}>{fact}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={stale || busy || applied}
                onClick={() => {
                  try {
                    onApply(
                      applyOfferCopy(page, suggestion, result.request),
                      result.request.stage,
                    );
                    setApplied(true);
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "The suggestion could not be applied.",
                    );
                  }
                }}
              >
                Apply this suggestion
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
