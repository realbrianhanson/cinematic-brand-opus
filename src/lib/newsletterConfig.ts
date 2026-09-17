// Single source of truth for newsletter configuration helpers.
//
// The implementation lives in supabase/functions/_shared/newsletterConfig.ts so
// the Deno edge functions and the TanStack server routes share exactly the same
// validation, escaping and URL derivation. That file intentionally contains no
// Deno / browser globals and no remote imports, so it is safe to import here.

export * from "../../supabase/functions/_shared/newsletterConfig";
