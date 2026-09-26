import { ArrowUpRight, BookOpen, FileText, Layers3, Play } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import type { ShopOffer } from "@/lib/shop";

const artwork = {
  training: { label: "The training collection", icon: Play, number: "01" },
  resource: { label: "The resource collection", icon: FileText, number: "02" },
  tool: { label: "The builder collection", icon: Layers3, number: "03" },
  course: { label: "The course collection", icon: BookOpen, number: "04" },
};

/** Original typographic covers for listings that do not have uploaded artwork. */
export default function OfferArtwork({
  offer,
  compact = false,
}: {
  offer: Pick<ShopOffer, "title" | "cover_url" | "shop_category">;
  compact?: boolean;
}) {
  const { identity } = useSiteConfig();
  const design = artwork[offer.shop_category] || artwork.resource;
  const Icon = design.icon;
  if (offer.cover_url)
    return (
      <img
        src={offer.cover_url}
        alt=""
        loading="lazy"
        decoding="async"
        width={1600}
        height={900}
        className="h-full w-full object-contain transition-opacity duration-300 motion-reduce:transition-none group-hover:opacity-95"
      />
    );
  return (
    <div
      aria-hidden="true"
      className={`relative flex min-h-[270px] flex-col justify-between overflow-hidden ${compact ? "p-5" : "p-6 sm:min-h-[290px] sm:p-8"}`}
      style={{
        color: "var(--site-accent-ink, var(--brand-accent))",
        background:
          "linear-gradient(130deg, rgba(var(--brand-accent-rgb),0.19), rgba(var(--brand-accent-rgb),0.035) 58%, rgba(var(--brand-accent-rgb),0.09))",
      }}
    >
      <div className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full border border-current opacity-[0.12]" />
      <div className="pointer-events-none absolute -right-2 -top-12 h-72 w-72 rounded-full border border-current opacity-[0.12]" />
      <div className="relative flex items-center justify-between gap-4 text-xs font-bold uppercase tracking-[0.2em]">
        <span className="max-w-[75%] truncate">{identity.name}</span>
        <span>{design.number}</span>
      </div>
      <div className="relative my-5 flex items-center gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-current/40 bg-black/10">
          <Icon size={25} strokeWidth={1.25} />
        </div>
        <div className="h-px flex-1 bg-current opacity-20" />
        <ArrowUpRight size={23} strokeWidth={1.25} />
      </div>
      <div className="relative max-w-[95%]">
        <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-75">
          {design.label}
        </p>
        <p
          className={`mt-3 break-words font-display leading-[1.05] text-white ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}
        >
          {offer.title}
        </p>
      </div>
    </div>
  );
}
