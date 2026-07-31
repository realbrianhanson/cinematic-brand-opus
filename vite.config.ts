import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    build: {
      target: "es2020",
      cssCodeSplit: true,
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Only split libs that don't touch React at module-init time.
          // Splitting react/react-dom or React-consuming libs into separate
          // chunks causes TDZ ("Cannot access '_' before initialization")
          // errors at runtime, so keep them with the main bundle.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
          },
        },
      },
    },
  },
});
