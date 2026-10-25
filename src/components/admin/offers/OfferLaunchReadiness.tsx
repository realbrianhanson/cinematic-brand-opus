import { Link } from "@/lib/router-compat";
import type {
  OfferLaunchAssessment,
  OfferLaunchState,
} from "@/lib/offerLaunchReadiness";

const statusStyles: Record<OfferLaunchState, string> = {
  draft: "border-current/15",
  published: "border-emerald-600/30",
  paused: "border-current/15",
  blocked: "border-amber-600/40",
  configured: "border-current/15",
  test: "border-amber-600/40",
  external: "border-current/15",
  checking: "border-current/15",
  unknown: "border-amber-600/40",
};

/** Separate public-page status from configuration; no synthetic launch score. */
export default function OfferLaunchReadiness({
  assessment,
  onGo,
  onRetry,
  checking,
  disabled = false,
  compact = false,
}: {
  assessment: OfferLaunchAssessment;
  onGo: (step: "review" | "delivery") => void;
  onRetry: () => void;
  checking: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <section
      aria-label="Launch readiness"
      className="admin-card space-y-3 p-4 sm:p-5"
    >
      <div>
        <h2 className="font-semibold">Launch readiness</h2>
        <p className="admin-help mt-1">
          Page visibility, checkout and delivery are separate. Configuration
          checks do not place orders or test customer emails.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {[assessment.page, assessment.checkout, assessment.delivery].map(
          (check) => (
            <div
              key={check.label}
              className={`min-w-0 rounded-xl border p-4 ${statusStyles[check.state]}`}
            >
              <p className="admin-eyebrow">{check.label}</p>
              <p className="mt-2 text-sm font-semibold">{check.title}</p>
              {compact ? (
                <details className="mt-2">
                  <summary className="admin-help cursor-pointer">
                    What this means
                  </summary>
                  <p className="admin-help mt-2">{check.detail}</p>
                </details>
              ) : (
                <p className="admin-help mt-2">{check.detail}</p>
              )}
              {(check.action === "review" || check.action === "delivery") && (
                <button
                  type="button"
                  className="admin-btn-ghost mt-3"
                  disabled={disabled}
                  onClick={() => onGo(check.action as "review" | "delivery")}
                >
                  {check.action === "review"
                    ? "Review page"
                    : "Fix in Delivery"}
                </button>
              )}
              {check.action === "setup" && (
                <Link
                  to="/admin/offers?tab=setup"
                  className="admin-btn-ghost mt-3"
                >
                  Offers setup
                </Link>
              )}
            </div>
          ),
        )}
      </div>
      {assessment.canCheckSetup && (
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={disabled || checking}
          onClick={onRetry}
        >
          {checking ? "Checking…" : "Check setup again"}
        </button>
      )}
    </section>
  );
}
