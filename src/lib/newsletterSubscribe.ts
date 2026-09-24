import { supabase } from "@/integrations/supabase/client";
import {
  interpretSubscribeResult,
  type SubscribeUiResult,
} from "@/lib/newsletterClient";

/**
 * Calls the double opt-in `newsletter-subscribe` endpoint. The endpoint only
 * records a pending subscriber and sends a confirmation email; nobody is added
 * to the list until they click that link. Never throws.
 */
export async function subscribeToNewsletter(
  email: string,
  source: string,
): Promise<SubscribeUiResult> {
  let status = 200;
  let payload: unknown = null;
  try {
    const { data, error } = await supabase.functions.invoke(
      "newsletter-subscribe",
      { body: { email, source } },
    );
    if (error) {
      const res = (error as { context?: Response }).context;
      if (res && typeof res.status === "number") {
        status = res.status;
        payload = await Promise.resolve()
          .then(() => res.clone().json())
          .catch(() => null);
      } else {
        status = 0;
      }
    } else {
      payload = data;
    }
  } catch {
    status = 0;
  }
  return interpretSubscribeResult(status, payload);
}
