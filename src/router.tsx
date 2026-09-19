import { QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

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
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
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
