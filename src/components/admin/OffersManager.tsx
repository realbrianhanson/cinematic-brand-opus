import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";
import type { AdminOfferView } from "@/lib/adminOfferViews";
import { supabase } from "@/integrations/supabase/client";
import { invokeOfferApi, offerPrice, type OfferHealth } from "@/lib/offers";
import QueryNotice from "./QueryNotice";
import { shopCategories } from "./offerEditorState";

const PAGE_SIZE = 25;
const price = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
const date = (value: string) => new Date(value).toLocaleDateString();

function SetupGuide({
  health,
  refresh,
  loading,
}: {
  health?: OfferHealth;
  refresh: () => void;
  loading: boolean;
}) {
  const checks = [
    ["Stripe secret key configured", health?.secret_configured],
    ["Stripe webhook signing secret configured", health?.webhook_configured],
  ] as const;
  return (
    <section
      className="admin-card p-6 space-y-5"
      aria-labelledby="offer-setup-heading"
    >
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h2 id="offer-setup-heading" className="text-xl font-semibold">
            Ready when you are
          </h2>
          <p className="admin-help mt-2">
            Free downloads and external or affiliate links work now. Website
            Stripe Checkout stays unavailable until both Stripe secrets are
            configured.
          </p>
        </div>
        <button
          className="admin-btn-secondary"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={15} /> Check configuration
        </button>
      </div>
      <ul className="space-y-3">
        {checks.map(([label, ready]) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            {ready ? (
              <CheckCircle2 size={18} className="text-emerald-500" />
            ) : (
              <Circle size={18} className="text-muted-foreground" />
            )}
            {label}:{" "}
            <strong>
              {health
                ? ready
                  ? "Configured"
                  : "Not configured"
                : "Not checked"}
            </strong>
          </li>
        ))}
      </ul>
      <div className="admin-notice">
        {health?.payments_ready
          ? `Configuration is present in ${health.mode} mode. This does not verify a successful payment or webhook delivery.`
          : "No keys are needed to prepare your offers. You can add Stripe later without rebuilding the pages."}
      </div>
      <ol className="list-decimal pl-5 space-y-3 text-sm leading-relaxed">
        <li>
          Create a Stripe account and choose test mode for your first end-to-end
          payment check.
        </li>
        <li>
          In the project’s server-side secrets settings, add{" "}
          <code>STRIPE_SECRET_KEY</code>. Never add secret keys to this editor,
          frontend code, or public environment variables.
        </li>
        <li>
          Create a Stripe webhook endpoint for the URL below. Subscribe to{" "}
          <code>checkout.session.completed</code>,{" "}
          <code>checkout.session.async_payment_succeeded</code>,{" "}
          <code>checkout.session.async_payment_failed</code>,{" "}
          <code>checkout.session.expired</code>, and{" "}
          <code>charge.refunded</code>.
        </li>
        <li>
          Save that endpoint’s signing secret as{" "}
          <code>STRIPE_WEBHOOK_SECRET</code>, then check configuration again.
          Verify a test checkout and refund before switching both credentials
          and the webhook to live mode.
        </li>
      </ol>
      {health?.webhook_url && (
        <label className="block text-sm font-medium">
          Webhook URL
          <input
            readOnly
            className="admin-input mt-2 w-full"
            value={health.webhook_url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <p className="admin-help">
        Customers download from their confirmation page. This feature does not
        automatically email files or subscribe anyone to your newsletter. Each
        paid follow-up opens a new checkout with an explicit price; it never
        charges a saved card automatically.
      </p>
    </section>
  );
}

export default function OffersManager({
  tab = "offers",
}: {
  tab?: AdminOfferView;
}) {
  const navigate = useNavigate();
  const setTab = (next: AdminOfferView) =>
    navigate(next === "offers" ? "/admin/offers" : `/admin/offers?tab=${next}`);
  const [status, setStatus] = useState("all");
  const [shopFilter, setShopFilter] = useState("all");
  const [orderStatus, setOrderStatus] = useState("all");
  const [orderKind, setOrderKind] = useState("all");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [orderPage, setOrderPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const offers = useQuery({
    queryKey: ["admin-offers", status, shopFilter, term, page],
    enabled: tab === "offers",
    queryFn: async () => {
      let query = supabase
        .from("offers")
        .select(
          "id,title,slug,summary,status,kind,amount_minor,currency,checkout_mode,price_display_mode,is_affiliate,funnel_only,show_in_shop,shop_category,shop_featured,updated_at",
          { count: "exact" },
        );
      if (status !== "all") query = query.eq("status", status);
      if (shopFilter === "listed" || shopFilter === "featured")
        query = query
          .eq("show_in_shop", true)
          .eq("status", "published")
          .eq("funnel_only", false);
      if (shopFilter === "featured") query = query.eq("shop_featured", true);
      if (shopFilter === "unlisted") query = query.eq("show_in_shop", false);
      if (term)
        query = query.ilike("title", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
      const { data, count, error } = await query
        .order("updated_at", { ascending: false })
        .order("id")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });
  const orders = useQuery({
    queryKey: ["admin-offer-orders", orderStatus, orderKind, orderPage],
    enabled: tab === "orders",
    queryFn: async () => {
      let query = supabase
        .from("offer_orders")
        .select(
          "id,offer_id,title_snapshot,name,email,status,amount_minor,currency,created_at,fulfilled_at",
          { count: "exact" },
        );
      if (orderStatus !== "all") query = query.eq("status", orderStatus);
      if (orderKind === "free") query = query.eq("amount_minor", 0);
      if (orderKind === "paid") query = query.gt("amount_minor", 0);
      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(orderPage * PAGE_SIZE, (orderPage + 1) * PAGE_SIZE - 1)
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });
  const health = useQuery({
    queryKey: ["admin-offer-health"],
    queryFn: () => invokeOfferApi<OfferHealth>({ action: "health" }),
    staleTime: 30000,
    retry: false,
  });
  const offerPages = Math.max(
    1,
    Math.ceil((offers.data?.total ?? 0) / PAGE_SIZE),
  );
  const orderPages = Math.max(
    1,
    Math.ceil((orders.data?.total ?? 0) / PAGE_SIZE),
  );
  useEffect(() => {
    if (offers.data && page >= offerPages) setPage(offerPages - 1);
  }, [offers.data, page, offerPages]);
  useEffect(() => {
    if (orders.data && orderPage >= orderPages) setOrderPage(orderPages - 1);
  }, [orders.data, orderPage, orderPages]);
  return (
    <div className="admin-page-stack">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Digital products & lead magnets</p>
          <h1>Offers</h1>
          <p>
            Share a free resource, sell a download, or recommend a product
            through an external link.
          </p>
        </div>
        <Link to="/admin/offers/new" className="admin-btn-primary">
          <Plus size={16} /> New offer
        </Link>
      </header>
      <div className="admin-notice flex flex-wrap gap-3 justify-between items-center">
        <span>
          {health.isError
            ? "Payment configuration could not be checked."
            : health.isPending
              ? "Checking payment configuration…"
              : health.data?.payments_ready
                ? `Stripe ${health.data.mode} configuration present`
                : "Free downloads & external links ready · website payments need Stripe setup"}
        </span>
        <button className="admin-btn-ghost" onClick={() => setTab("setup")}>
          View setup
        </button>
      </div>
      <div className="admin-tabs" aria-label="Offer views">
        {(
          [
            ["offers", "Offers"],
            ["orders", "Orders & leads"],
            ["setup", "Setup"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="admin-btn-ghost"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "setup" && (
        <>
          <QueryNotice error={health.error} retry={() => health.refetch()} />
          <SetupGuide
            health={health.data}
            refresh={() => {
              void health.refetch();
            }}
            loading={health.isFetching}
          />
        </>
      )}
      {tab === "offers" && (
        <>
          <div className="admin-filters">
            <label className="flex-1">
              <span className="sr-only">Search offers</span>
              <input
                className="admin-input w-full"
                value={search}
                placeholder="Search offers…"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select
              className="admin-input"
              aria-label="Offer status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <select
              className="admin-input"
              aria-label="Shop visibility"
              value={shopFilter}
              onChange={(event) => {
                setShopFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">All Shop visibility</option>
              <option value="listed">In Shop now</option>
              <option value="featured">Featured in Shop</option>
              <option value="unlisted">Not listed in Shop</option>
            </select>
          </div>
          <QueryNotice
            loading={offers.isPending}
            error={offers.error}
            retry={() => offers.refetch()}
          />
          {offers.data && (
            <p className="admin-help">
              {offers.data.total} matching{" "}
              {offers.data.total === 1 ? "offer" : "offers"}
            </p>
          )}
          {offers.data?.items.length === 0 && (
            <div className="admin-card p-8 text-center">
              <h2 className="font-semibold text-lg">
                {term || status !== "all" || shopFilter !== "all"
                  ? "No offers match this view"
                  : "Your first useful offer starts here"}
              </h2>
              <p className="admin-help mt-2">
                Create a guide, checklist, template, or digital product. Start
                with a draft and publish when the copy and delivery method are
                ready.
              </p>
              <Link to="/admin/offers/new" className="admin-btn-primary mt-5">
                Create an offer
              </Link>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {offers.data?.items.map((offer) => (
              <article
                key={offer.id}
                className="admin-card p-5 flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="admin-badge capitalize">{offer.status}</span>
                  <strong>
                    {offerPrice({
                      ...offer,
                      kind: offer.kind === "paid" ? "paid" : "free",
                      checkout_mode:
                        offer.checkout_mode === "external"
                          ? "external"
                          : "native",
                      price_display_mode:
                        offer.price_display_mode === "provider"
                          ? "provider"
                          : "fixed",
                    })}
                  </strong>
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    {offer.title || "Untitled offer"}
                  </h2>
                  <p className="admin-help mt-2 line-clamp-2">
                    {offer.summary ||
                      "Add a short promise that tells visitors what they will get."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="admin-badge">
                    {offer.checkout_mode === "external"
                      ? "External link"
                      : "Website checkout / download"}
                  </span>
                  {offer.is_affiliate && (
                    <span className="admin-badge">Affiliate</span>
                  )}
                  <span className="admin-badge">
                    {shopCategories[
                      offer.shop_category as keyof typeof shopCategories
                    ] || "Resource"}
                  </span>
                  <span className="admin-badge">
                    {offer.show_in_shop && !offer.funnel_only
                      ? offer.status === "published"
                        ? "In Shop"
                        : offer.status === "draft"
                          ? "Shop on publish"
                          : "Shop hidden · archived"
                      : "Not listed in Shop"}
                  </span>
                  {offer.shop_featured &&
                    offer.show_in_shop &&
                    !offer.funnel_only &&
                    offer.status !== "archived" && (
                      <span className="admin-badge">
                        {offer.status === "published"
                          ? "Featured"
                          : "Feature on publish"}
                      </span>
                    )}
                </div>
                <p className="admin-help">
                  {offer.funnel_only
                    ? "Follow-up only · requires a qualifying claim"
                    : "Shareable standalone offer"}{" "}
                  · Updated {date(offer.updated_at)}
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link
                    className="admin-btn-secondary"
                    to={`/admin/offers/${offer.id}/edit`}
                  >
                    Edit offer
                  </Link>
                  <a
                    className="admin-btn-ghost"
                    href={
                      offer.status === "published"
                        ? `/offers/${offer.slug}`
                        : `/offers/preview/${offer.id}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {offer.status === "published" ? "View page" : "Preview"}{" "}
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>
          {offerPages > 1 && (
            <div className="flex justify-between items-center gap-3">
              <button
                className="admin-btn-secondary"
                disabled={page === 0 || offers.isFetching}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span className="admin-help">
                Page {page + 1} of {offerPages}
              </span>
              <button
                className="admin-btn-secondary"
                disabled={page + 1 >= offerPages || offers.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      {tab === "orders" && (
        <>
          <p className="admin-help">
            These contacts requested an offer; they are not automatically
            newsletter subscribers. “Fulfilled” means download access is
            available, not that the file was downloaded. External-link checkouts
            and opt-ins are handled by their destination and do not appear here.
          </p>
          <div className="admin-filters">
            <select
              className="admin-input"
              aria-label="Order status"
              value={orderStatus}
              onChange={(event) => {
                setOrderStatus(event.target.value);
                setOrderPage(0);
              }}
            >
              <option value="all">All statuses</option>
              {["pending", "fulfilled", "failed", "expired", "refunded"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ),
              )}
            </select>
            <select
              className="admin-input"
              aria-label="Order type"
              value={orderKind}
              onChange={(event) => {
                setOrderKind(event.target.value);
                setOrderPage(0);
              }}
            >
              <option value="all">Free and paid</option>
              <option value="free">Free downloads</option>
              <option value="paid">Paid orders</option>
            </select>
            <button
              className="admin-btn-ghost"
              disabled={orders.isFetching}
              onClick={() => {
                void orders.refetch();
              }}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          <QueryNotice
            loading={orders.isPending}
            error={orders.error}
            retry={() => orders.refetch()}
          />
          {orders.data && (
            <p className="admin-help">
              {orders.data.total} matching{" "}
              {orders.data.total === 1 ? "record" : "records"}
            </p>
          )}
          {orders.data?.items.length === 0 && (
            <div className="admin-card p-8 text-center">
              <h2 className="font-semibold">No orders or leads in this view</h2>
              <p className="admin-help mt-2">
                Real claims and checkouts will appear here. Creating an offer
                does not create sample orders.
              </p>
            </div>
          )}
          {!!orders.data?.items.length && (
            <div className="admin-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="p-4">Contact</th>
                    <th className="p-4">Offer</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.items.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="p-4">
                        <p className="font-medium">
                          {order.name || "Name not supplied"}
                        </p>
                        <p className="admin-help break-all">{order.email}</p>
                      </td>
                      <td className="p-4">
                        <Link
                          className="hover:underline"
                          to={`/admin/offers/${order.offer_id}/edit`}
                        >
                          {order.title_snapshot}
                        </Link>
                        <p className="admin-help mt-1 font-mono text-xs">
                          {order.id.slice(0, 8)}
                        </p>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {order.amount_minor === 0
                          ? "Free"
                          : price(order.amount_minor, order.currency)}
                      </td>
                      <td className="p-4">
                        <span className="admin-badge capitalize">
                          {order.status}
                        </span>
                        <p className="admin-help mt-1">
                          {order.status === "fulfilled"
                            ? order.amount_minor === 0
                              ? "Free access granted"
                              : "Payment confirmed"
                            : order.status === "pending"
                              ? "Payment not confirmed"
                              : order.status === "refunded"
                                ? "Access revoked"
                                : "No download access"}
                        </p>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {date(order.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {orderPages > 1 && (
            <div className="flex justify-between items-center gap-3">
              <button
                className="admin-btn-secondary"
                disabled={orderPage === 0 || orders.isFetching}
                onClick={() => setOrderPage((value) => value - 1)}
              >
                Previous
              </button>
              <span className="admin-help">
                Page {orderPage + 1} of {orderPages}
              </span>
              <button
                className="admin-btn-secondary"
                disabled={orderPage + 1 >= orderPages || orders.isFetching}
                onClick={() => setOrderPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
