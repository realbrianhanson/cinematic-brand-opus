import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, Download, GitBranch } from "lucide-react";
import {
  blueprintPage,
  blueprintWorkbook,
  qualifiedCallBlueprint,
  type OfferBlueprintPageRole,
} from "@/lib/offerBlueprints";
import {
  sectionLabels,
  type OfferPage,
  type OfferRecipeContext,
} from "@/lib/offerBuilder";

const roles: {
  id: OfferBlueprintPageRole;
  title: string;
  destination: string;
}[] = [
  {
    id: "invitation",
    title: "Invitation page",
    destination: "your provider's qualification form",
  },
  {
    id: "preparation",
    title: "Call preparation page",
    destination:
      "your provider's booking management or preparation destination",
  },
  {
    id: "membership",
    title: "Membership alternative page",
    destination: "your provider's recurring membership checkout",
  },
];

/** A page starter and a provider setup plan, never a new fulfillment flow. */
export default function OfferBlueprintPicker({
  value,
  context,
  external,
  hasDestination,
  onApply,
  onConfigureDelivery,
}: {
  value: OfferPage;
  context: OfferRecipeContext;
  external: boolean;
  hasDestination: boolean;
  onApply: (page: OfferPage, notice: string) => void;
  onConfigureDelivery: () => void;
}) {
  const [role, setRole] = useState<OfferBlueprintPageRole>("invitation");
  const [downloadNotice, setDownloadNotice] = useState("");
  const [showWorkbook, setShowWorkbook] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const workbookRef = useRef<HTMLTextAreaElement>(null);
  const downloadUrls = useRef(new Map<string, number>());
  const id = useId();
  const selected = roles.find((item) => item.id === role)!;
  const outline = useMemo(() => blueprintPage(role), [role]);

  useEffect(() => {
    const urls = downloadUrls.current;
    return () => {
      for (const [url, timer] of urls) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);
  useEffect(() => {
    if (downloadFailed && showWorkbook) workbookRef.current?.focus();
  }, [downloadFailed, showWorkbook]);

  function apply() {
    if (!external) return;
    const hasCopy =
      value.sections.length > 0 ||
      [
        value.headline,
        value.subheadline,
        value.eyebrow,
        value.ctaText,
        value.ctaMicrocopy,
      ].some((copy) => copy.trim());
    if (
      hasCopy &&
      !window.confirm(
        `Replace this offer's landing page copy and layout with the ${selected.title.toLowerCase()} layout? This replaces the headline, button copy and sections in your working copy. Other offer settings stay the same. Nothing is saved or published until you choose to do so.`,
      )
    )
      return;
    onApply(
      blueprintPage(role, context),
      `${selected.title} layout added to your working copy. Complete the copy in Pages and save a draft. Before publishing, ${hasDestination ? "check that the destination in Delivery points to" : "connect the destination in Delivery to"} ${selected.destination}.`,
    );
  }

  function downloadWorkbook() {
    let link: HTMLAnchorElement | undefined;
    let url: string | undefined;
    try {
      if (
        typeof URL.createObjectURL !== "function" ||
        typeof URL.revokeObjectURL !== "function"
      )
        throw new Error("Downloads unavailable");
      link = document.createElement("a");
      if (!("download" in link)) throw new Error("Downloads unavailable");
      url = URL.createObjectURL(
        new Blob([blueprintWorkbook()], {
          type: "text/markdown;charset=utf-8",
        }),
      );
      link.href = url;
      link.download = "qualified-call-membership-setup.md";
      document.body.appendChild(link);
      link.click();
      setDownloadFailed(false);
      setDownloadNotice(
        "Setup workbook download requested. If it did not save, use View or copy workbook below.",
      );
    } catch {
      setDownloadFailed(true);
      setShowWorkbook(true);
      setDownloadNotice(
        "This browser could not start the download. Select and copy the setup workbook below.",
      );
    } finally {
      link?.remove();
      if (url) {
        const downloadUrl = url;
        downloadUrls.current.set(
          downloadUrl,
          window.setTimeout(() => {
            URL.revokeObjectURL(downloadUrl);
            downloadUrls.current.delete(downloadUrl);
          }, 1000),
        );
      }
    }
  }

  function stages(ids: string[]) {
    return qualifiedCallBlueprint.stages
      .filter((stage) => ids.includes(stage.id))
      .map((stage) => (
        <li key={stage.id} className="space-y-1">
          <span className="block text-xs font-medium leading-relaxed">
            {stage.title}
          </span>
          <span className="block text-[10px] uppercase tracking-wide opacity-60">
            {stage.kind === "page" ? "Page layout here" : "In your provider"}
          </span>
        </li>
      ));
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="admin-card overflow-hidden"
    >
      <div className="space-y-3 border-b border-current/10 bg-violet-500/5 p-5">
        <p className="admin-eyebrow flex items-center gap-2">
          <GitBranch size={15} aria-hidden="true" /> Reusable funnel blueprint
        </p>
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {qualifiedCallBlueprint.title}
        </h2>
        <p className="admin-help">{qualifiedCallBlueprint.description}</p>
        <p className="text-sm">
          Build one page here; configure form branching, booking, reminders and
          recurring billing in your provider.
        </p>
      </div>
      <div className="space-y-5 p-5">
        <div aria-label="Funnel branch map" className="space-y-3">
          <ol className="grid grid-cols-2 gap-3 rounded-lg border border-current/10 p-3">
            {stages(["invitation", "qualification"])}
          </ol>
          <div className="flex justify-center" aria-hidden="true">
            <ArrowDown size={16} className="opacity-50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
              <p className="mb-3 text-xs font-semibold">Qualified call path</p>
              <ol className="space-y-3">
                {stages([
                  "qualified-calendar",
                  "booking-confirmation",
                  "preparation",
                ])}
              </ol>
            </div>
            <div className="rounded-lg border border-current/10 p-3">
              <p className="mb-3 text-xs font-semibold">
                Membership alternative
              </p>
              <ol className="space-y-3">
                {stages(["membership", "subscription-checkout"])}
              </ol>
            </div>
          </div>
        </div>
        <label className="block text-sm font-medium">
          Page to build from this blueprint
          <select
            className="admin-input mt-2 w-full"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as OfferBlueprintPageRole)
            }
          >
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border border-current/10 p-3">
          <h3 className="text-sm font-semibold">Page layout preview</h3>
          <ol className="mt-3 grid list-inside list-decimal gap-2 text-xs">
            <li>Headline, promise & primary action</li>
            {outline.sections.map((section) => (
              <li key={section.type}>
                {section.heading || sectionLabels[section.type]}
              </li>
            ))}
          </ol>
          <p className="admin-help mt-3">
            Primary action: {outline.ctaText}. Add your own copy, media and
            approved evidence before publishing.
          </p>
        </div>
        <div className="space-y-3">
          <p id={`${id}-delivery`} className="admin-help">
            {external
              ? `${hasDestination ? "Check" : "Before publishing, connect"} the destination in Delivery: this page should send visitors to ${selected.destination}. You can apply the layout and save a private draft first.`
              : "These layouts need an external form, calendar or checkout destination. Open Delivery and choose External / affiliate link before applying a layout."}
          </p>
          <button
            type="button"
            className="admin-btn-primary w-full"
            disabled={!external}
            aria-describedby={`${id}-delivery`}
            onClick={apply}
          >
            Use this page layout
          </button>
          {!external && (
            <button
              type="button"
              className="admin-btn-secondary w-full"
              onClick={onConfigureDelivery}
            >
              Configure external delivery
            </button>
          )}
          <p className="admin-help">
            Applies only to this offer's landing page. Save a draft to keep it;
            publish separately when the page and provider setup are ready.
          </p>
        </div>
        <div className="space-y-3 border-t border-current/10 pt-4">
          <button
            type="button"
            className="admin-btn-secondary w-full"
            onClick={downloadWorkbook}
          >
            <Download size={16} aria-hidden="true" /> Download setup workbook
          </button>
          <p className="admin-help">
            Includes qualification questions, branch rules and a provider setup
            checklist. Create a separate offer for each page you need.
          </p>
          {downloadNotice && (
            <p role="status" className="admin-help">
              {downloadNotice}
            </p>
          )}
          <button
            type="button"
            className="admin-btn-ghost text-xs"
            aria-expanded={showWorkbook}
            aria-controls={`${id}-workbook`}
            onClick={() => setShowWorkbook((shown) => !shown)}
          >
            {showWorkbook ? "Hide workbook text" : "View or copy workbook"}
          </button>
          {showWorkbook && (
            <label className="block text-sm font-medium" id={`${id}-workbook`}>
              Setup workbook text
              <textarea
                ref={workbookRef}
                readOnly
                rows={8}
                className="admin-input mt-2 w-full text-xs"
                value={blueprintWorkbook()}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
        </div>
      </div>
    </section>
  );
}
