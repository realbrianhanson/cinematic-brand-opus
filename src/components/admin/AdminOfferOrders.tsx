import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Link } from "@/lib/router-compat";
import {
  loadSupportOrders,
  orderAccessLabel,
  orderPaymentLabel,
} from "@/lib/adminOfferOrders";
import QueryNotice from "./QueryNotice";

const money = (amount: number, currency: string) =>
  amount === 0
    ? "Free"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(amount / 100);
const when = (value: string) => new Date(value).toLocaleString();
const deliveryLabels = {
  pending: "Queued for delivery",
  sending: "Delivery in progress",
  sent: "Accepted by email provider",
  needs_review: "Needs delivery review",
  failed: "Delivery failed",
};

export default function AdminOfferOrders() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const orders = useQuery({
    queryKey: ["admin-order-support", term, status, kind, page],
    queryFn: ({ signal }) =>
      loadSupportOrders(term, status, kind, page, signal),
    retry: false,
  });
  const pages = Math.max(1, Math.ceil((orders.data?.total ?? 0) / 25));
  useEffect(() => {
    if (orders.data && page >= pages) setPage(pages - 1);
  }, [orders.data, page, pages]);
  return (
    <section className="space-y-5" aria-label="Orders and access support">
      <p className="admin-help">
        Claims and checkouts on this website only. Contacts are not
        automatically newsletter subscribers. Access granted does not mean a
        file was downloaded. External purchases use their provider’s support.
      </p>
      <div className="admin-filters">
        <input
          className="admin-input min-w-0 flex-1"
          aria-label="Search orders"
          placeholder="Name, email, order ID or purchased item"
          maxLength={200}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="admin-input"
          aria-label="Order status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">All statuses</option>
          {["pending", "fulfilled", "failed", "expired", "refunded"].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
        <select
          className="admin-input"
          aria-label="Order type"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">Free and paid</option>
          <option value="free">Free downloads</option>
          <option value="paid">Paid orders</option>
        </select>
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={orders.isFetching}
          onClick={() => {
            void orders.refetch();
          }}
        >
          <RefreshCw size={15} /> Refresh orders
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
          {orders.isFetching ? " · Refreshing…" : ""}
        </p>
      )}
      {orders.data?.items.length === 0 && (
        <div className="admin-card p-8 text-center">
          <h2>No orders or leads in this view</h2>
          <p className="admin-help mt-2">
            Try another search or filter. Creating an offer does not create
            sample orders.
          </p>
        </div>
      )}
      {orders.data?.items.map((order) => (
        <article key={order.id} className="admin-card p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-semibold break-words">{order.title}</h2>
              <p className="admin-help break-all">
                {order.name || "Name not supplied"} · {order.email}
              </p>
              <p className="admin-help text-xs break-all">Order {order.id}</p>
            </div>
            <div>
              <p className="font-semibold">
                {money(order.amount_minor, order.currency)} total
              </p>
              <p className="admin-help">{orderPaymentLabel(order)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="admin-badge capitalize">{order.status}</span>
            <span>{orderAccessLabel(order.status)}</span>
            <span className="admin-help">Created {when(order.created_at)}</span>
          </div>
          <details>
            <summary className="cursor-pointer font-medium text-sm focus-visible:outline focus-visible:outline-2">
              View order details
            </summary>
            <div className="mt-4 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="text-left font-semibold pb-2">
                    Purchased items
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="p-2">Item</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items.length
                      ? order.items
                      : [
                          {
                            offer_id: order.offer_id,
                            role: "primary" as const,
                            title: order.title,
                            amount_minor: order.amount_minor,
                            currency: order.currency,
                            file_name: null,
                          },
                        ]
                    ).map((item) => (
                      <tr
                        key={item.offer_id}
                        className="border-b border-border"
                      >
                        <td className="p-2">
                          <Link
                            to={`/admin/offers/${item.offer_id}/edit`}
                            className="underline underline-offset-4"
                          >
                            {item.title}
                          </Link>
                          {item.file_name && (
                            <p className="admin-help break-all">
                              {item.file_name}
                            </p>
                          )}
                        </td>
                        <td className="p-2">
                          {item.role === "bump"
                            ? "Optional extra"
                            : "Primary offer"}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {money(item.amount_minor, item.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!order.items.length && (
                <p className="admin-help">
                  Historical single-item order. The original order snapshot is
                  shown.
                </p>
              )}
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="admin-help">Access granted</dt>
                  <dd>
                    {order.fulfilled_at
                      ? when(order.fulfilled_at)
                      : "Not granted"}
                  </dd>
                </div>
                <div>
                  <dt className="admin-help">First download link issued</dt>
                  <dd>
                    {order.download_link_issued_at
                      ? when(order.download_link_issued_at)
                      : "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="admin-help">Latest access email</dt>
                  <dd>
                    {order.delivery
                      ? `${deliveryLabels[order.delivery.status]} · ${order.delivery.kind} · ${order.delivery.attempts} attempts`
                      : "No delivery record"}
                  </dd>
                </div>
              </dl>
              <p className="admin-help">
                A download link being issued is not proof of a completed
                download. Email-provider acceptance is not proof of inbox
                delivery.
              </p>
              {order.parent_order_id && (
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => {
                    setStatus("all");
                    setKind("all");
                    setPage(0);
                    setSearch(order.parent_order_id!);
                  }}
                >
                  Find original order
                </button>
              )}
            </div>
          </details>
        </article>
      ))}
      {pages > 1 && (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label="Order pages"
        >
          <button
            className="admin-btn-secondary"
            disabled={page === 0 || orders.isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span className="admin-help">
            Page {page + 1} of {pages}
          </span>
          <button
            className="admin-btn-secondary"
            disabled={page + 1 >= pages || orders.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
