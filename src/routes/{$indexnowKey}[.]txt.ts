import { createFileRoute } from "@tanstack/react-router";

// IndexNow key-verification file: https://<site>/<key>.txt returns the key.
// Static routes such as /llms.txt rank above this dynamic segment.
export const Route = createFileRoute("/{$indexnowKey}.txt")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [{ indexNowKeyFileResponse }, { createPublicServerClient }] =
          await Promise.all([
            import("@/lib/indexnowKeyFile"),
            import("@/lib/publicData.server"),
          ]);
        return indexNowKeyFileResponse(
          params.indexnowKey,
          async (candidate) => {
            const client = createPublicServerClient();
            // Added in 20260923151000; not yet in the generated types.
            const rpc = client.rpc.bind(client) as unknown as (
              fn: "indexnow_key_file",
              args: { candidate: string },
            ) => Promise<{
              data: string | null;
              error: { message: string } | null;
            }>;
            const { data, error } = await rpc("indexnow_key_file", {
              candidate,
            });
            if (error) throw new Error(error.message);
            return data;
          },
        );
      },
    },
  },
});
