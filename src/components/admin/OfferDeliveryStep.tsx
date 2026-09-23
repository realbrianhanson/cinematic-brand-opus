import type { RefObject } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { Link } from "@/lib/router-compat";
import type { OfferHealth } from "@/lib/offers";
import type { Form } from "./offerEditorState";

/** Builder step 4: checkout method, delivery file, price and access. */
export default function OfferDeliveryStep({
  active,
  form,
  external,
  dirty,
  uploading,
  fileRef,
  health,
  onChange,
  onUpload,
}: {
  active: boolean;
  form: Form;
  external: boolean;
  dirty: boolean;
  uploading: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  health: { isPending: boolean; isError: boolean; data?: OfferHealth };
  onChange: (changes: Partial<Form>) => void;
  onUpload: (file?: File) => void;
}) {
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    onChange({ [key]: value } as Partial<Form>);
  return (
    <div hidden={!active} className="space-y-6">
      <section className="admin-card p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold">How visitors get this offer</h2>
        <label className="block text-sm font-medium">
          Checkout or delivery method
          <select
            className="admin-input mt-2 w-full"
            value={form.checkoutMode}
            onChange={(event) => {
              const checkoutMode = event.target.value as Form["checkoutMode"];
              onChange({
                checkoutMode,
                ...(checkoutMode === "external"
                  ? { funnelOnly: false }
                  : { priceDisplayMode: "fixed" }),
              });
            }}
          >
            <option value="native">Website checkout / download</option>
            <option value="external">External / affiliate link</option>
          </select>
        </label>
        <p className="admin-help">
          {external
            ? "Send visitors to your sales page, a Stripe Payment Link, or another provider's product. No Stripe keys or uploaded file are needed here."
            : "Collect an opt-in for a free download, or use your site's Stripe Checkout for a paid download. You can add a follow-up offer after delivery."}
        </p>
      </section>

      {external ? (
        <>
          <section className="admin-card p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold">External destination</h2>
            <label className="block text-sm font-medium">
              Destination URL
              <input
                type="url"

                maxLength={2048}
                className="admin-input mt-2 w-full"
                placeholder="https://…"
                value={form.externalUrl}
                onChange={(event) => update("externalUrl", event.target.value)}
              />
              <span className="admin-help block mt-2">
                Paste the full HTTPS link, including any affiliate or tracking
                parameters.
              </span>
            </label>
            <label className="block text-sm font-medium">
              Button label <span className="admin-help">(optional)</span>
              <input
                maxLength={80}
                className="admin-input mt-2 w-full"
                placeholder="View offer"
                value={form.externalButtonText}
                onChange={(event) =>
                  update("externalButtonText", event.target.value)
                }
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.isAffiliate}
                onChange={(event) =>
                  update("isAffiliate", event.target.checked)
                }
              />
              <span>
                <strong>This is an affiliate link</strong>
                <span className="admin-help block mt-1">
                  Show an affiliate disclosure beside the button when you may
                  earn a commission.
                </span>
              </span>
            </label>
            {form.isAffiliate && (
              <label className="block text-sm font-medium">
                Affiliate disclosure{" "}
                <span className="admin-help">(optional)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  className="admin-input mt-2 w-full"
                  value={form.affiliateDisclosure}
                  onChange={(event) =>
                    update("affiliateDisclosure", event.target.value)
                  }
                  placeholder="Leave blank to use the standard affiliate disclosure."
                />
                <span className="admin-help block mt-2">
                  Your disclosure appears beside the button. Leave this blank to
                  use the standard affiliate disclosure.
                </span>
              </label>
            )}
            <p className="admin-help">
              Checkout, opt-ins, delivery, and any upsells happen on the
              destination site. This listing does not create orders or leads
              here and cannot be part of a website download funnel. If an
              existing offer is used as a follow-up, create a new external
              listing instead.
            </p>
          </section>
        </>
      ) : (
        <>
          <section className="admin-card p-5 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold">Private download</h2>
            <p className="admin-help">
              After every claim or purchase, including free downloads, customers
              get a download button on their confirmation page and an email with
              a private access link. Files are private and download links are
              temporary.
            </p>
            <p className="admin-help">
              {health.isPending
                ? "Checking download email setup…"
                : health.isError
                  ? "Download email setup could not be checked. See Offers setup."
                  : health.data?.delivery_ready === false
                    ? "Download email is not set up yet, so access emails are not sent. Customers must save the link on their confirmation page until you finish Offers setup."
                    : "Access emails are sent with your configured newsletter sender. Delivery to the inbox is not guaranteed."}
            </p>
            {form.assetName && (
              <div className="admin-notice flex items-start gap-3">
                <FileText size={20} className="shrink-0 mt-1" />
                <div className="min-w-0">
                  <p className="font-medium break-all">{form.assetName}</p>
                  <p className="admin-help mt-1">
                    {dirty
                      ? "Save to apply any file changes."
                      : "Current file for new claims."}
                  </p>
                </div>
              </div>
            )}
            <label className="block text-sm font-medium">
              <span className="flex items-center gap-2">
                <Upload size={16} />{" "}
                {form.assetName
                  ? "Upload a replacement"
                  : "Upload the resource"}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.zip,.epub,.txt,.md"
                className="admin-input mt-3 w-full"
                onChange={(event) => onUpload(event.target.files?.[0])}
              />
              <span className="admin-help block mt-2">
                PDF, ZIP, EPUB, TXT, or Markdown · maximum 25 MB. Replacements
                are saved as new versions; files already purchased are
                preserved.
              </span>
            </label>
            {uploading && (
              <p role="status" className="admin-help flex gap-2">
                <Loader2 size={16} className="animate-spin" /> Uploading
                privately…
              </p>
            )}
            <label className="block text-sm font-medium">
              Confirmation message
              <textarea
                className="admin-input mt-2 w-full"
                rows={3}
                maxLength={2000}
                value={form.thankYou}
                onChange={(event) => update("thankYou", event.target.value)}
              />
            </label>
          </section>
        </>
      )}
      <section className="admin-card p-5 space-y-5">
        <h2 className="text-lg font-semibold">Price & availability</h2>
        <label className="block text-sm font-medium">
          Offer type
          <select
            className="admin-input mt-2 w-full"
            value={form.kind}
            onChange={(event) =>
              update("kind", event.target.value as Form["kind"])
            }
          >
            <option value="free">
              {external ? "Free offer" : "Free download"}
            </option>
            <option value="paid">
              {external ? "Paid offer" : "Paid digital product"}
            </option>
          </select>
        </label>
        {form.kind === "paid" && (
          <>
            {external && (
              <label className="block text-sm font-medium">
                Price shown in Shop
                <select
                  className="admin-input mt-2 w-full"
                  value={form.priceDisplayMode}
                  onChange={(event) =>
                    update(
                      "priceDisplayMode",
                      event.target.value as Form["priceDisplayMode"],
                    )
                  }
                >
                  <option value="fixed">Show a specific price</option>
                  <option value="provider">
                    View current pricing on destination
                  </option>
                </select>
                <span className="admin-help block mt-2">
                  Use current pricing for subscriptions, changing promotions, or
                  products with several plans.
                </span>
              </label>
            )}
            {(!external || form.priceDisplayMode === "fixed") && (
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <label className="block text-sm font-medium">
                  Price
                  <input
                    required
                    inputMode="decimal"
                    className="admin-input mt-2 w-full"
                    placeholder="19.00"
                    value={form.price}
                    onChange={(event) => update("price", event.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Currency
                  <select
                    className="admin-input mt-2 w-full"
                    value={form.currency}
                    onChange={(event) => update("currency", event.target.value)}
                  >
                    {["usd", "cad", "eur", "gbp", "aud"].map((currency) => (
                      <option key={currency} value={currency}>
                        {currency.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="admin-help">
              {external
                ? form.priceDisplayMode === "provider"
                  ? "The Shop shows “View current pricing”. Visitors confirm the price and terms on the destination site."
                  : "This is a display price. Keep it in sync with the destination; checkout and final terms are handled there."
                : "One-time payment through Stripe Checkout. Price is stored exactly to the cent; no recurring or automatic charges."}
            </p>
            {!external && (
              <div className="admin-notice text-sm">
                {health.isPending
                  ? "Checking payment and download-email setup…"
                  : health.isError
                    ? "Checkout readiness is unknown. Check payment and download-email setup before sharing a paid offer."
                    : health.data?.payments_ready
                      ? `Stripe ${health.data.mode} and download-email configuration are present. A real checkout or email delivery has not been verified by this check.`
                      : "You can save or publish this page now. Checkout stays unavailable until Stripe and download-email setup are complete."}
                <Link
                  to="/admin/offers?tab=setup"
                  className="underline block mt-2"
                >
                  Offers setup
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
