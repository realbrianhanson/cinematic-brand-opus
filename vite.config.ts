import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
        // Split heavy vendor libs so the public homepage bundle stays small.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@tanstack/react-query")) return "react-query";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react-router")) return "router";
          // Note: don't split recharts/d3 — their internal circular imports
          // trigger a TDZ ReferenceError when bundled into a separate chunk.
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("react-helmet-async")) return "helmet";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("scheduler")
          )
            return "react";
        },
      },
    },
  },
}));
