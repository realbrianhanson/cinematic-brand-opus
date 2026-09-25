import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  newSection,
  pageRecipe,
  sectionLabels,
  sectionGuidance,
  type OfferRecipeContext,
  sectionTypes,
  type OfferPage,
  type OfferSection,
  type OfferAwareness,
  type OfferRecipeKind,
  offerAwarenessGuidance,
} from "@/lib/offerBuilder";

export default function OfferPageFields({
  value,
  stage,
  onChange,
  recipeContext,
}: {
  value: OfferPage;
  recipeContext?: OfferRecipeContext;
  stage: "landing" | "upsell";
  onChange: (value: OfferPage) => void;
}) {
  const [addingType, setAddingType] =
    useState<OfferSection["type"]>("benefits");
  const [chosenRecipe, setRecipe] = useState<OfferRecipeKind | null>(null);
  const recipe =
    chosenRecipe ||
    (stage === "upsell"
      ? "upsell"
      : recipeContext?.offer.kind === "free"
        ? "lead-magnet"
        : "sales");
  const [chosenAwareness, setAwareness] = useState<OfferAwareness | null>(null);
  const awareness =
    chosenAwareness ||
    (stage === "upsell" || recipeContext?.strategy.traffic === "customer"
      ? "ready"
      : recipeContext?.strategy.traffic === "cold"
        ? "context"
        : "comparing");
  // A newly added section opens and takes focus so it can be filled in.
  const [addedId, setAddedId] = useState("");
  useEffect(() => {
    if (!addedId) return;
    const heading = document.getElementById(`${addedId}-heading`);
    heading?.scrollIntoView?.({ block: "center" });
    heading?.focus();
  }, [addedId]);
  const updateSection = (index: number, updates: Partial<OfferSection>) =>
    onChange({
      ...value,
      sections: value.sections.map((section, position) =>
        position === index ? { ...section, ...updates } : section,
      ),
    });
  function move(index: number, direction: number) {
    const sections = [...value.sections];
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ ...value, sections });
  }
  function applyRecipe() {
    if (
      value.sections.length &&
      !window.confirm(
        "Replace the current section layout? Your headline and button copy will be kept.",
      )
    )
      return;
    const next = pageRecipe(recipe, recipeContext, awareness);
    onChange({
      ...value,
      headline: value.headline || next.headline,
      subheadline: value.subheadline || next.subheadline,
      ctaText: value.ctaText || next.ctaText,
      sections: next.sections,
      focusMode: next.focusMode,
    });
  }
  return (
    <section className="admin-card space-y-5 p-5 md:p-6">
      <div>
        <p className="admin-eyebrow">
          {stage === "landing" ? "Landing page" : "Follow-up presentation"}
        </p>
        <h2 className="text-xl font-semibold">
          {stage === "landing"
            ? "Build the case for your offer"
            : "Make the next step feel relevant"}
        </h2>
        <p className="admin-help mt-2">
          {stage === "landing"
            ? "Lead with the outcome. Support it with useful detail and real proof."
            : "This copy appears when another offer presents this product as its follow-up. Explain the extra benefit to someone who has already said yes."}
        </p>
      </div>
      <div className="rounded-xl border border-current/10 p-3 space-y-3">
        <label className="block text-sm font-medium">
          Start with a page recipe
          <select
            className="admin-input mt-2 w-full"
            value={recipe}
            onChange={(event) => setRecipe(event.target.value as typeof recipe)}
          >
            <option value="lead-magnet">
              Lead magnet · useful first result
            </option>
            <option value="sales">Sales page · value, proof, objections</option>
            <option value="upsell">Upsell · the relevant next step</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Build this layout for a buyer who is…
          <select
            className="admin-input mt-2 w-full"
            value={awareness}
            onChange={(event) =>
              setAwareness(event.target.value as OfferAwareness)
            }
          >
            {Object.entries(offerAwarenessGuidance).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="admin-help">
          {offerAwarenessGuidance[awareness].guidance}
        </p>
        <p className="admin-help">
          Your traffic source suggests a starting point; choose what this buyer
          already knows. Applying the layout saves its section order, not this
          planning choice.
        </p>
        <button
          type="button"
          className="admin-btn-secondary w-full"
          onClick={applyRecipe}
        >
          Use this layout
        </button>
        <p className="admin-help">
          Uses the problem, outcome, method and deliverables you entered in your
          brief. Existing headline and button copy stay in place. Add approved
          proof and confirmed answers yourself; private evidence notes are never
          copied.
        </p>
      </div>
      {recipeContext?.strategy.adMessage.trim() && (
        <div className="rounded-xl border border-current/10 p-4 space-y-3">
          <h3 className="text-sm font-semibold">
            Carry the sending promise through
          </h3>
          <p className="admin-help">
            Compare the message visitors saw with this page. Match the real
            offer, outcome and next action. This reference stays private.
          </p>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-semibold">Ad, email or referral message</dt>
              <dd className="mt-1 whitespace-pre-line break-words opacity-75">
                {recipeContext.strategy.adMessage}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Page headline</dt>
              <dd className="mt-1 break-words opacity-75">
                {value.headline ||
                  recipeContext.offer.title ||
                  "Add your headline below."}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Page action</dt>
              <dd className="mt-1 break-words opacity-75">
                {value.ctaText || "Choose clear primary button text below."}
              </dd>
            </div>
          </dl>
        </div>
      )}
      {(
        [
          ["eyebrow", "Eyebrow", 100],
          ["headline", "Page headline", 300],
          ["subheadline", "Supporting promise", 1000],
          ["ctaText", "Primary button text", 80],
          ["ctaMicrocopy", "Reassurance below the button", 500],
        ] as const
      ).map(([key, label, maxLength]) => (
        <label key={key} className="block text-sm font-medium">
          {label}
          <textarea
            className="admin-input mt-2 w-full"
            rows={key === "subheadline" ? 3 : 2}
            maxLength={maxLength}
            value={value[key]}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.value })
            }
          />
        </label>
      ))}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.focusMode}
          onChange={(event) =>
            onChange({ ...value, focusMode: event.target.checked })
          }
          className="mt-1"
        />
        <span>
          <strong>Focus this page on the offer</strong>
          <span className="admin-help mt-1 block">
            Hide Shop navigation and related offers to keep attention on this
            decision.
          </span>
        </span>
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Page sections</h3>
          <span className="admin-help">{value.sections.length} / 30</span>
        </div>
        {!value.sections.length && (
          <p className="admin-help rounded-xl border border-dashed border-current/20 p-4">
            Your existing description appears until you add sections. Use a
            recipe or add one below.
          </p>
        )}
        {value.sections.map((section, index) => (
          <details
            key={section.id}
            className="rounded-xl border border-current/15 p-3"
            open={
              section.id === addedId || value.sections.length === 1 || undefined
            }
          >
            <summary className="cursor-pointer text-sm font-semibold">
              {index + 1}. {section.heading || sectionLabels[section.type]}
            </summary>
            <div className="mt-4 space-y-3">
              <p className="admin-help">
                {sectionGuidance[section.type].purpose}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn-ghost"
                  aria-label={`Move section ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  aria-label={`Move section ${index + 1} down`}
                  disabled={index === value.sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost ml-auto"
                  aria-label={`Remove section ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      sections: value.sections.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <label className="block text-sm">
                Section heading
                <input
                  id={`${section.id}-heading`}
                  className="admin-input mt-2 w-full"
                  maxLength={300}
                  value={section.heading}
                  onChange={(event) =>
                    updateSection(index, { heading: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                {section.type === "image"
                  ? "Image description"
                  : "Section copy"}
                <textarea
                  className="admin-input mt-2 w-full"
                  rows={5}
                  id={`${section.id}-copy`}
                  placeholder={sectionGuidance[section.type].placeholder}
                  maxLength={6000}
                  value={section.body}
                  onChange={(event) =>
                    updateSection(index, { body: event.target.value })
                  }
                />
              </label>
              {(section.type === "image" || section.type === "video") && (
                <>
                  <label className="block text-sm">
                    {section.type === "video"
                      ? "Video URL"
                      : "Section image URL"}
                    <input
                      type="url"
                      className="admin-input mt-2 w-full"
                      maxLength={2048}
                      placeholder="https://…"
                      value={section.imageUrl}
                      onChange={(event) =>
                        updateSection(index, { imageUrl: event.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    Media caption
                    <input
                      className="admin-input mt-2 w-full"
                      maxLength={500}
                      value={section.caption}
                      onChange={(event) =>
                        updateSection(index, { caption: event.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {(section.type === "proof" || section.type === "text") && (
                <label className="block text-sm">
                  {section.type === "proof"
                    ? "Public testimonial attribution"
                    : "Public evidence attribution (optional)"}
                  <input
                    className="admin-input mt-2 w-full"
                    maxLength={500}
                    value={section.caption}
                    onChange={(event) =>
                      updateSection(index, { caption: event.target.value })
                    }
                  />
                </label>
              )}
              {section.type === "guarantee" && (
                <p className="admin-help">
                  Use only the exact guarantee and refund terms you actually
                  offer.
                </p>
              )}
              {section.type === "proof" && (
                <p className="admin-help">
                  Keep testimonials exact and attributed. Add approved material
                  from the proof library in Strategy.
                </p>
              )}
            </div>
          </details>
        ))}
        <label className="block text-sm font-medium">
          New section type
          <select
            id={`offer-section-type-${stage}`}
            className="admin-input mt-2 w-full"
            value={addingType}
            onChange={(event) =>
              setAddingType(event.target.value as OfferSection["type"])
            }
          >
            {sectionTypes.map((type) => (
              <option key={type} value={type}>
                {sectionLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="admin-btn-secondary w-full"
          disabled={value.sections.length >= 30}
          onClick={() => {
            const section = newSection(addingType);
            onChange({ ...value, sections: [...value.sections, section] });
            setAddedId(section.id);
          }}
        >
          <Plus size={16} /> Add section
        </button>
      </div>
    </section>
  );
}
