export type AdminBackendScope = "overview" | "newsletter";

/** Recognize only this release's missing database prerequisites, not outages or permission errors. */
export function pendingBackendUpdate(
  error: unknown,
  scope?: AdminBackendScope,
) {
  if (!scope || !error || typeof error !== "object") return null;
  const value = error as {
    message?: unknown;
    details?: unknown;
    code?: unknown;
  };
  const message = [value.message, value.details]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  if (
    /permission denied|admin access required|not authorized|jwt/i.test(message)
  )
    return null;
  const missing =
    ["PGRST202", "PGRST204", "42883", "42703"].includes(String(value.code)) ||
    /does not exist|could not find (?:the )?(?:function|column|'[^']+' column)|schema cache/i.test(
      message,
    );
  if (!missing) return null;
  if (scope === "overview" && /\badmin_overview_snapshot\b/.test(message))
    return {
      title: "Backend update pending",
      description:
        "The database update for the business overview is not available yet. Counts and attention items cannot be verified. Your articles and offers are still available from the menu.",
      migration: "20260923150000_admin_overview_truth",
    };
  if (
    scope === "newsletter" &&
    (/\b(?:admin_newsletter_audience|newsletter_retry_failed_delivery)\b/.test(
      message,
    ) ||
      (/\bnewsletter_sends\b/.test(message) &&
        /\b(?:last_error|last_error_status|last_error_at)\b/.test(message)) ||
      (/\bnewsletter_deliveries\b/.test(message) &&
        /\bprovider_status\b/.test(message)))
  )
    return {
      title: "Backend update pending",
      description:
        "The newsletter database update is not available yet. Audience or delivery details cannot be verified. Sending and retry controls stay unavailable until the backend is updated and this panel is reloaded.",
      migration: "20260923140000_newsletter_truth",
    };
  return null;
}
