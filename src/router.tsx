import { QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { toast } from "@/hooks/use-toast";
import {
  mutationErrorToast,
  queryRetry,
  queryRetryDelay,
  shouldToastMutationError,
} from "@/lib/queryResilience";

export const getRouter = () => {
  const queryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: () => {
        for (const key of [
          "admin-post-stats",
          "admin-recent-posts",
          "admin-newsletter-subscriber-stats",
          "admin-stale-pages-count",
          "admin-indexing-stats",
        ])
          void queryClient.invalidateQueries({ queryKey: [key] });
      },
      // No admin action may fail silently. Mutations with their own onError
      // (or meta.errorToast === false) already report the error themselves.
      onError: (error, _variables, _onMutateResult, mutation) => {
        console.error("[mutation] failed", error);
        if (!shouldToastMutationError(mutation)) return;
        toast(mutationErrorToast(error, mutation.meta));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Retry only transient failures (5xx, PGRST002, network) with backoff.
        retry: queryRetry,
        retryDelay: (failureCount) => queryRetryDelay(failureCount),
      },
      // Writes are not idempotent: never replay them automatically.
      mutations: { retry: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
