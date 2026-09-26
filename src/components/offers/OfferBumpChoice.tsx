import { offerPrice, type PublicBumpOffer } from "@/lib/offers";

/** Explicit opt-in; the server validates the relationship and snapshots the price. */
export default function OfferBumpChoice({
  offer,
  selected,
  disabled,
  onChange,
}: {
  offer: PublicBumpOffer;
  selected: boolean;
  disabled: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-white/25 bg-white/5 p-4 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-accent)]"
      />
      <span>
        <strong>
          Add {offer.title} · {offerPrice(offer)}
        </strong>
        <span className="block mt-1 text-white/75">{offer.summary}</span>
        <span className="block mt-2 text-xs text-white/65">
          Optional extra. Included in the same payment, with its own download.
        </span>
      </span>
    </label>
  );
}
