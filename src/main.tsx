import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Recover from stale lazy-chunk references after a redeploy.
// When the hashed chunk filename changes, the old index.html in the
// user's tab tries to fetch a filename that no longer exists on the CDN
// and React Router surfaces a blank screen. A one-shot reload pulls the
// fresh index.html and its new chunk map.
const RELOAD_KEY = "__chunk_reload_at";
const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed/i.test(
    msg,
  );
const maybeReload = (msg: string) => {
  if (!isChunkLoadError(msg)) return;
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return; // avoid reload loops
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
};
window.addEventListener("error", (e) => maybeReload(e.message || ""));
window.addEventListener("unhandledrejection", (e) => {
  const msg = (e.reason && (e.reason.message || String(e.reason))) || "";
  maybeReload(msg);
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
