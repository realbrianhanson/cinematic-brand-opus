import { shopCategories, type Form } from "./offerEditorState";

export default function OfferShopSettings({
  form,
  onChange,
}: {
  form: Form;
  onChange: (changes: Partial<Form>) => void;
}) {
  return (
    <section className="admin-card p-5 space-y-5">
      <h2 className="text-lg font-semibold">Shop placement</h2>
      <p className="admin-help">
        Choose where visitors can discover this offer. These settings do not
        publish a draft or change its price.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.showInShop}
          disabled={form.checkoutMode === "native" && form.funnelOnly}
          aria-describedby="offer-shop-visibility-help"
          onChange={(event) =>
            onChange({
              showInShop: event.target.checked,
              ...(event.target.checked ? {} : { shopFeatured: false }),
            })
          }
        />
        <span className="font-medium">Show in Shop</span>
      </label>
      <p id="offer-shop-visibility-help" className="admin-help">
        {form.checkoutMode === "native" && form.funnelOnly
          ? "Follow-up-only offers stay out of the Shop. Turn off the follow-up-only setting to list this offer."
          : "Only published offers with this enabled appear in the Shop. Drafts and archived offers remain hidden. Turning it off keeps the offer’s own page available if published."}
      </p>
      <label className="block text-sm font-medium">
        Shop category
        <select
          className="admin-input mt-2 w-full"
          value={form.shopCategory}
          onChange={(event) =>
            onChange({
              shopCategory: event.target.value as Form["shopCategory"],
            })
          }
        >
          {Object.entries(shopCategories).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.shopFeatured}
          disabled={
            !form.showInShop ||
            (form.checkoutMode === "native" && form.funnelOnly)
          }
          aria-describedby="offer-shop-featured-help"
          onChange={(event) => onChange({ shopFeatured: event.target.checked })}
        />
        <span className="font-medium">Feature in Shop</span>
      </label>
      <p id="offer-shop-featured-help" className="admin-help">
        Give this offer a prominent place once it is published and listed.
        {form.checkoutMode === "external"
          ? "Visitors can review this offer here, then follow your link to get it."
          : "Training and Course are catalog labels; delivery is still the download file configured in this editor."}
      </p>
    </section>
  );
}
