import sanitize from "sanitize-html";
import { htmlPolicy } from "../../supabase/functions/_shared/htmlPolicy";

/** Pure, DOM-free sanitization: identical output during SSR and hydration. */
export function safeHtml(value: string | null | undefined): string {
  return sanitize(value ?? "", htmlPolicy);
}
