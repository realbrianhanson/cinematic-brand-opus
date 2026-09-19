export type AdminOfferView = "offers" | "orders" | "setup";
export function adminOfferSearch(raw: Record<string, unknown>): {
  tab: AdminOfferView;
} {
  return {
    tab: raw.tab === "orders" || raw.tab === "setup" ? raw.tab : "offers",
  };
}
