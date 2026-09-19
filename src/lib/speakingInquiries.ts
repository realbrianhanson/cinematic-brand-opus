import { supabase } from "@/integrations/supabase/client";
import type { SpeakingInquiryInput } from "../../supabase/functions/_shared/speakingInquiries";
export type {
  SpeakingInquiryInput,
  SpeakingEventFormat,
} from "../../supabase/functions/_shared/speakingInquiries";

export const inquiryStatuses = ["new", "contacted", "closed", "spam"] as const;
export type InquiryStatus = (typeof inquiryStatuses)[number];
export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
  spam: "Spam",
};

export async function submitSpeakingInquiry(
  input: SpeakingInquiryInput & { website: string },
): Promise<void> {
  const { data, error } = await supabase.functions.invoke(
    "submit-speaking-inquiry",
    { body: input },
  );
  if (error) {
    let code = "unavailable";
    try {
      if (error.context instanceof Response) {
        const body: unknown = await error.context.json();
        if (
          body &&
          typeof body === "object" &&
          "code" in body &&
          typeof body.code === "string"
        )
          code = body.code;
      }
    } catch {
      /* A network interruption may not include a response body. */
    }
    const messages: Record<string, string> = {
      rate_limited:
        "Please wait before trying again, or use the email link below.",
      request_mismatch:
        "This request changed while it was being submitted. Please reload the page before sending a new inquiry.",
      invalid_input: "Please check your contact information and event details.",
    };
    throw new Error(
      messages[code] ??
        "We could not confirm your inquiry. Try again with the same details, or use the email link below.",
    );
  }
  if (data?.accepted !== true)
    throw new Error(
      "We could not confirm your inquiry. Please try again with the same details.",
    );
}

/** Drop arbitrary mail headers, fragments, and control characters from configuration. */
export function speakingEmailHref(href: string): string | null {
  try {
    if (!/^mailto:/i.test(href)) return null;
    const [rawRecipient, query = ""] = href.slice(7).split("?");
    const recipient = decodeURIComponent(rawRecipient);
    if (
      /\p{Cc}/u.test(recipient) ||
      !/^[^\s@<>?,;:%]+@[^\s@<>?,;:%]+\.[^\s@<>?,;:%]+$/.test(recipient)
    )
      return null;
    const subject = (
      new URLSearchParams(query).get("subject") || "Speaking inquiry"
    )
      .replace(/\p{Cc}/gu, " ")
      .slice(0, 100);
    return `mailto:${encodeURIComponent(recipient).replace("%40", "@")}?subject=${encodeURIComponent(subject)}`;
  } catch {
    return null;
  }
}
