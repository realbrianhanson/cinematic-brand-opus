import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

// Loaded on first open so the marketing pages carry none of the chat bundle.
const SiteChatPanel = lazy(() => import("./SiteChatPanel"));

export default function SiteChat() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className="public-site fixed right-4 z-50 flex flex-col items-end gap-3 print:hidden"
      // Clears the phone-only Summit bar when it is showing.
      style={{ bottom: "calc(1rem + var(--mobile-bar-space, 0px))" }}
    >
      {open && (
        <Suspense
          fallback={
            <div className="rounded-sm border border-white/15 bg-[var(--site-surface,var(--brand-backdrop))] px-4 py-3 text-sm text-white/70">
              Opening chat...
            </div>
          }
        >
          <SiteChatPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? "site-chat-panel" : undefined}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--brand-accent)] px-5 py-3 font-body text-sm font-bold text-[var(--brand-backdrop)] shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
      >
        <MessageCircle size={18} aria-hidden="true" />
        {open ? "Close chat" : "Ask a question"}
      </button>
    </div>
  );
}
