import { validOfferUrl } from "./offerBuilder";
import type { OfferCheckoutMode, OfferHealth, OfferKind } from "./offers";

export type OfferLaunchState =
  | "draft"
  | "published"
  | "paused"
  | "blocked"
  | "configured"
  | "test"
  | "external"
  | "checking"
  | "unknown";

export interface OfferLaunchCheck {
  label: string;
  state: OfferLaunchState;
  title: string;
  detail: string;
  action?: "review" | "delivery" | "setup" | "retry";
}

export interface OfferLaunchHealth {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  data?: OfferHealth & { delivery_failed?: number };
}

export interface OfferLaunchInput {
  status: string | null;
  hasUnpublishedChanges: boolean;
  checkoutMode: OfferCheckoutMode;
  kind: OfferKind;
  assetPath: string;
  assetName: string;
  amountMinor: number;
  externalUrl: string;
  health: OfferLaunchHealth;
}

export interface OfferLaunchAssessment {
  page: OfferLaunchCheck;
  checkout: OfferLaunchCheck;
  delivery: OfferLaunchCheck;
  canCheckSetup: boolean;
  /** Suitable beside publishing or sharing; never a publication gate. */
  notice: string;
}

function pageCheck(input: OfferLaunchInput): OfferLaunchCheck {
  if (input.status === "published") {
    return {
      label: "Page",
      state: "published",
      title: input.hasUnpublishedChanges
        ? "Published · unpublished changes"
        : "Published",
      detail: input.hasUnpublishedChanges
        ? "Visitors see the last published version. The checkout and delivery checks below describe your current draft. Publish to apply its changes."
        : "Visitors can open the page. Checkout and delivery have their own checks below.",
      ...(input.hasUnpublishedChanges ? { action: "review" as const } : {}),
    };
  }
  if (input.status === "archived") {
    return {
      label: "Page",
      state: "paused",
      title: "Paused · archived",
      detail:
        "Hidden from visitors and the Shop. New claims are stopped; existing customers keep their access.",
      action: "review",
    };
  }
  return {
    label: "Page",
    state: "draft",
    title: input.status ? "Draft · private" : "Not saved yet",
    detail: "Review and publish when the page is ready to be public.",
    action: "review",
  };
}

function emailDetail(health: OfferLaunchHealth): string {
  if (health.isPending)
    return "Download-email configuration is still being checked.";
  if (health.isError || !health.data)
    return "Download-email readiness is unknown because the setup check did not complete.";
  const data = health.data;
  let detail =
    data.delivery_ready === true
      ? "Download email is configured; inbox delivery has not been verified."
      : data.delivery_ready === false
        ? "Download email is not configured. Free customers can still download immediately and should save their confirmation link."
        : "Download-email readiness was not reported. Check Offers setup.";
  if (
    (typeof data.delivery_failed === "number" && data.delivery_failed > 0) ||
    (typeof data.delivery_needs_review === "number" &&
      data.delivery_needs_review > 0)
  )
    detail +=
      " Some access emails across your offers need attention in Offers setup.";
  return detail;
}

/** Configuration assessment only: it never implies a transaction or inbox test. */
export function assessOfferLaunchReadiness(
  input: OfferLaunchInput,
): OfferLaunchAssessment {
  const page = pageCheck(input);
  if (input.checkoutMode === "external") {
    const destinationValid = validOfferUrl(input.externalUrl);
    return {
      page,
      canCheckSetup: false,
      checkout: {
        label: "Checkout / registration",
        state: destinationValid ? "external" : "blocked",
        title: destinationValid
          ? "Handled by your provider"
          : "Destination missing or invalid",
        detail: destinationValid
          ? "The button opens your provider’s site. Confirm its price, registration and checkout there; this check does not verify them."
          : "Add a valid HTTPS destination in Delivery before visitors can continue.",
        action: "delivery",
      },
      delivery: {
        label: "Delivery",
        state: "external",
        title: "Handled by your provider",
        detail:
          "Your provider handles confirmation, access and any follow-up. This page does not create local orders or send access emails.",
      },
      notice: destinationValid
        ? "Publishing makes the page visible. Checkout, registration and delivery must be checked with your external provider."
        : "The external destination is missing or invalid. Fix it in Delivery before publishing or sharing.",
    };
  }

  const hasFile = !!input.assetPath.trim() && !!input.assetName.trim();
  const data = input.health.data;
  const email = emailDetail(input.health);
  const hasDeliveryIssue =
    (typeof data?.delivery_failed === "number" && data.delivery_failed > 0) ||
    (typeof data?.delivery_needs_review === "number" &&
      data.delivery_needs_review > 0);
  const delivery: OfferLaunchCheck = hasFile
    ? {
        label: "Delivery",
        state: "configured",
        title: "Download file configured",
        detail: `A file is attached for the confirmation page. Download access has not been tested. ${email}`,
        action:
          input.health.isError || (!input.health.isPending && !data)
            ? "retry"
            : data?.delivery_ready === true && !hasDeliveryIssue
              ? undefined
              : "setup",
      }
    : {
        label: "Delivery",
        state: "blocked",
        title: "Upload the download",
        detail:
          "Attach the resource in Delivery so customers can receive it after their claim or purchase.",
        action: "delivery",
      };

  let checkout: OfferLaunchCheck;
  if (!hasFile) {
    checkout = {
      label: input.kind === "free" ? "Free claim" : "Checkout",
      state: "blocked",
      title: "Download file needed",
      detail:
        "Add the file in Delivery before this offer can accept new claims or purchases.",
      action: "delivery",
    };
  } else if (input.kind === "free") {
    checkout = {
      label: "Free claim",
      state: "configured",
      title: "Free claim configured",
      detail:
        "The free download flow is configured; publication and any follow-up eligibility rules still apply. Stripe and an email sender are not required for immediate access. This check has not submitted a claim.",
    };
  } else if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 50 ||
    input.amountMinor > 99999999
  ) {
    checkout = {
      label: "Checkout",
      state: "blocked",
      title: "Set a valid price",
      detail:
        "Enter a price between 0.50 and 999,999.99 in the selected currency in Delivery.",
      action: "delivery",
    };
  } else if (input.health.isPending) {
    checkout = {
      label: "Checkout",
      state: "checking",
      title: "Checking setup…",
      detail:
        "Checking Stripe and download-email configuration. A published page alone does not enable checkout.",
    };
  } else if (
    input.health.isError ||
    !data ||
    typeof data.payments_ready !== "boolean"
  ) {
    checkout = {
      label: "Checkout",
      state: "unknown",
      title: "Readiness unknown",
      detail:
        "The setup check did not confirm payment readiness. Check again before sending traffic.",
      action: "retry",
    };
  } else if (!data.payments_ready) {
    checkout = {
      label: "Checkout",
      state: "blocked",
      title: "Paid checkout unavailable",
      detail:
        "Complete Stripe and download-email setup in Offers setup. Publishing the page does not enable paid checkout.",
      action: "setup",
    };
  } else if (data.mode === "test") {
    checkout = {
      label: "Checkout",
      state: "test",
      title: "Test checkout configured",
      detail:
        "Stripe is in test mode and cannot collect real payments. No test transaction has been verified by this check.",
      action: "setup",
    };
  } else if (data.mode !== "live") {
    checkout = {
      label: "Checkout",
      state: "unknown",
      title: "Payment mode unknown",
      detail:
        "The setup check did not confirm live or test mode. Review Offers setup before sending traffic.",
      action: "setup",
    };
  } else {
    checkout = {
      label: "Checkout",
      state: "configured",
      title: "Live checkout configured",
      detail:
        "Stripe and download-email configuration are present. A real payment has not been verified by this check.",
    };
  }

  const notice =
    checkout.state === "blocked"
      ? `${checkout.title}. ${checkout.detail}`
      : checkout.state === "test"
        ? "This page uses Stripe test mode and cannot collect real payments. Switch to live setup before sending customer traffic."
        : checkout.state === "unknown" || checkout.state === "checking"
          ? "Payment readiness has not been confirmed. Publishing a page does not confirm that customers can pay."
          : input.kind === "free"
            ? `Free downloads use immediate confirmation-page access. ${email}`
            : "Live checkout is configured. This check has not verified a purchase, file download or inbox delivery.";
  return { page, checkout, delivery, canCheckSetup: true, notice };
}
