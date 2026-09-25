import { Link } from "@/lib/router-compat";
import type { OfferDeliveryHealthData } from "../OfferDeliveryHealth";

/** Configuration checks do not claim that a real transaction or email was tested. */
export default function OfferJourneyReadiness({
  external,
  paid,
  health,
  onRetry,
  hasFollowUp,
  followUpStatus,
}: {
  external: boolean;
  paid: boolean;
  health: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    data?: OfferDeliveryHealthData;
  };
  onRetry: () => void;
  hasFollowUp: boolean;
  followUpStatus?: string;
}) {
  return (
    <section
      className="rounded-xl border border-current/10 p-4 space-y-3"
      aria-label="Customer journey readiness"
    >
      <h3 className="font-semibold text-sm">Customer journey readiness</h3>
      {external ? (
        <p className="admin-help">
          This offer sends visitors to the linked provider. Review the
          destination’s price, checkout, confirmation and access yourself before
          sending traffic; local preview does not verify those steps.
        </p>
      ) : (
        <>
          {health.isPending ? (
            <p role="status" className="admin-help">
              Checking payment and download-email configuration…
            </p>
          ) : health.isError || !health.data ? (
            <p className="admin-help">
              Payment and download-email configuration could not be checked.
              Readiness is unknown.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {paid && (
                <li>
                  {health.data.payments_ready
                    ? `Payment configuration is present (${health.data.mode} mode). A real payment has not been verified by this check.`
                    : "Paid checkout is unavailable until payment and download-email configuration are complete. Publishing the page does not enable checkout."}
                </li>
              )}
              <li>
                {health.data.delivery_ready === true
                  ? "Download-email configuration is present. This check does not verify inbox delivery."
                  : health.data.delivery_ready === false
                    ? "Download email is not configured. Free customers must save their confirmation link; access emails are not sent yet."
                    : "Download-email readiness is unknown. Check Offers setup before sending traffic."}
              </li>
              {!!(
                (health.data.delivery_failed || 0) +
                (health.data.delivery_needs_review || 0)
              ) && (
                <li>
                  Some access emails need attention. Review delivery issues in
                  Offers setup before sending traffic.
                </li>
              )}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={health.isFetching}
              onClick={onRetry}
            >
              {health.isFetching ? "Checking…" : "Check setup again"}
            </button>
            <Link to="/admin/offers?tab=setup" className="admin-btn-ghost">
              Offers setup
            </Link>
          </div>
          {hasFollowUp && followUpStatus !== "published" && (
            <p className="admin-help">
              {followUpStatus
                ? "Your selected follow-up is not published, so it will not appear for visitors."
                : "The selected follow-up’s publication status could not be verified. Check it in Next step before sharing."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
