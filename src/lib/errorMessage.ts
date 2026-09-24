const FALLBACK = "An unexpected error occurred. Please try again.";

type CodedError = { code: string; message: string; details?: unknown };

const isCoded = (error: unknown): error is CodedError =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  typeof error.code === "string" &&
  "message" in error &&
  typeof error.message === "string";

/** True when a Supabase/PostgREST error carries this Postgres SQLSTATE. */
export const isErrorCode = (error: unknown, code: string): boolean =>
  isCoded(error) && error.code === code;

const detailText = (error: CodedError) =>
  `${error.message} ${typeof error.details === "string" ? error.details : ""}`;

function uniqueViolation(error: CodedError): string {
  if (/"offers_slug_key"/.test(detailText(error)))
    return "That URL is already used by another offer. Choose a different page URL slug.";
  return "That value is already in use. Choose a different one and try again.";
}

function foreignKeyViolation(error: CodedError): string {
  const detail = detailText(error);
  const removing = /^update or delete on table/i.test(error.message);
  if (/"offers_next_offer_id_fkey"/.test(detail))
    return removing
      ? "Another offer uses this offer as its follow-up. Choose a different follow-up there, or archive this offer instead."
      : "The selected follow-up offer no longer exists. Choose another follow-up and save again.";
  if (removing && /on table "offer_orders"/.test(detail))
    return "This offer has orders, so it can't be deleted. Archive it instead to hide it from visitors.";
  if (removing)
    return "This item is still used by other records, so it can't be removed. Remove or reassign those records first.";
  return "A linked item no longer exists. Refresh the page, choose it again, and try again.";
}

function invalidParameter(error: CodedError): string {
  if (/request identifier was already used/i.test(error.message))
    return "This save was already processed with different content. Reload the saved version before saving again.";
  return "Some details could not be saved because a value is too long or in an unexpected format. Check your recent changes and try again.";
}

/**
 * Plain-English message for any thrown value. Recognised Postgres codes
 * (23505, 23503, 40001, 22023) are translated; everything else keeps its
 * original message so existing callers behave as before.
 */
export function errorMessage(error: unknown): string {
  if (isCoded(error)) {
    if (error.code === "23505") return uniqueViolation(error);
    if (error.code === "23503") return foreignKeyViolation(error);
    if (error.code === "40001")
      return "This was changed in another tab or by another admin since you opened it. Reload the saved version, then reapply your changes.";
    if (error.code === "22023") return invalidParameter(error);
  }
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return FALLBACK;
}
