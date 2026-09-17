// Maps the newsletter-subscribe endpoint response onto honest UI states.
// Kept pure so it can be unit tested without a network or a browser.

export type SubscribeUiState =
  | "idle"
  | "loading"
  | "confirmation_sent"
  | "already_subscribed"
  | "already_requested"
  | "rate_limited"
  | "unavailable"
  | "invalid_email"
  | "error";

export interface SubscribeUiResult {
  state: SubscribeUiState;
  message: string;
}

export function interpretSubscribeResult(
  status: number,
  payload: unknown,
): SubscribeUiResult {
  const state = (payload as { state?: string } | null)?.state;

  if (status === 503 || state === "unavailable") {
    return {
      state: "unavailable",
      message:
        "Sign-ups are temporarily unavailable because email delivery is not configured yet. Please try again later.",
    };
  }
  if (status === 429 || state === "rate_limited") {
    return {
      state: "rate_limited",
      message: "Too many attempts. Please wait a little while and try again.",
    };
  }
  if (status === 400 || state === "invalid_email") {
    return {
      state: "invalid_email",
      message: "That email address doesn't look right.",
    };
  }
  if (status === 502 || state === "send_failed") {
    return {
      state: "error",
      message:
        "We couldn't send your confirmation email just now. Please try again in a few minutes.",
    };
  }

  switch (state) {
    case "accepted":
      return {
        state: "confirmation_sent",
        message: "If confirmation is needed, check your inbox for a link.",
      };
    case "confirmation_sent":
      return {
        state: "confirmation_sent",
        message: "Check your inbox for the confirmation link.",
      };
    case "already_subscribed":
      return {
        state: "already_subscribed",
        message: "You're already subscribed.",
      };
    case "confirmation_already_requested":
      return {
        state: "already_requested",
        message:
          "A confirmation link was already sent recently. Check your inbox, including spam.",
      };
    default:
      return {
        state: "error",
        message: "Something went wrong. Please try again.",
      };
  }
}
