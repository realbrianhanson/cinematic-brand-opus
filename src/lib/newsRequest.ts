// Re-export of the edge function's news request validation so the app test
// suite and the deployed function share one implementation.
export {
  MAX_NEWS_BODY_BYTES,
  isUuid,
  validateNewsRequest,
  type NewsRequestValidation,
} from "../../supabase/functions/_shared/newsRequest";
