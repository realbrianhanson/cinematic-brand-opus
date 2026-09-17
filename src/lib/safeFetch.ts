// Re-export of the edge functions' outbound fetch safety helper so the app test
// suite and the deployed functions share one implementation.
export {
  UnsafeUrlError,
  assertPublicHttpUrl,
  isPublicHttpUrl,
  fetchTextBounded,
  type UrlCheckOptions,
  type BoundedFetchOptions,
  type BoundedFetchResult,
} from "../../supabase/functions/_shared/safeFetch";
