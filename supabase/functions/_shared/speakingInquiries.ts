export type SpeakingEventFormat = "in_person" | "virtual" | "undecided";

export interface SpeakingInquiryInput {
  request_id: string;
  name: string;
  email: string;
  event_name: string;
  event_date: string;
  event_format: SpeakingEventFormat;
  audience: string;
  message: string;
}

export class SpeakingInquiryError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function text(
  value: unknown,
  name: string,
  max: number,
  required = false,
  multiline = false,
): string {
  if (value === undefined && !required) return "";
  if (typeof value !== "string")
    throw new SpeakingInquiryError(
      400,
      "invalid_input",
      `Please check ${name}.`,
    );
  const normalized = value.trim();
  if (
    (required && !normalized) ||
    normalized.length > max ||
    /\p{Cc}/u.test(multiline ? normalized.replace(/[\n\t\r]/g, "") : normalized)
  )
    throw new SpeakingInquiryError(
      400,
      "invalid_input",
      `Please check ${name}.`,
    );
  return normalized;
}

/** A fixed property order gives retries the same hash after normalization. */
export function parseSpeakingInquiry(
  body: Record<string, unknown>,
): SpeakingInquiryInput {
  const requestId = text(
    body.request_id,
    "your request",
    36,
    true,
  ).toLowerCase();
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      requestId,
    )
  )
    throw new SpeakingInquiryError(
      400,
      "invalid_input",
      "Please refresh the page and try again.",
    );
  const email = text(body.email, "your email address", 254, true).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
    throw new SpeakingInquiryError(
      400,
      "invalid_input",
      "Please enter a valid email address.",
    );
  const format = body.event_format ?? "undecided";
  if (
    typeof format !== "string" ||
    !["in_person", "virtual", "undecided"].includes(format)
  )
    throw new SpeakingInquiryError(
      400,
      "invalid_input",
      "Please choose an event format.",
    );
  return {
    request_id: requestId,
    name: text(body.name, "your name", 100, true),
    email,
    event_name: text(body.event_name, "the event name", 160, true),
    event_date: text(body.event_date, "the date or timeframe", 100),
    event_format: format as SpeakingEventFormat,
    audience: text(body.audience, "the audience", 300),
    message: text(body.message, "your event details", 3000, false, true),
  };
}

export async function speakingHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function speakingDatabaseError(message: string): SpeakingInquiryError {
  if (message.includes("speaking_request_mismatch"))
    return new SpeakingInquiryError(
      409,
      "request_mismatch",
      "This request changed while it was being submitted. Reload the page before sending a new inquiry.",
    );
  if (message.includes("speaking_inquiries_disabled"))
    return new SpeakingInquiryError(
      503,
      "unavailable",
      "Online inquiries are temporarily unavailable. Please use the email link below.",
    );
  return new SpeakingInquiryError(
    503,
    "unavailable",
    "We could not confirm your inquiry. Please try again; retrying the same details will not create a duplicate.",
  );
}
