import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, RefreshCw } from "lucide-react";
import OfferShell from "@/components/OfferShell";
import OfferRecovery from "@/components/OfferRecovery";
import OfferSections from "@/components/offers/OfferSections";
import { readPresentation } from "@/lib/offerBuilder";
import {
  invokeOfferApi,
  isOfferToken,
  offerPrice,
  persistOfferToken,
  restoreOfferToken,
  retryToken,
  safeOfferRedirect,
  type OfferAccess as AccessData,
  type OfferClaim,
} from "@/lib/offers";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded border border-white/25 px-5 py-3 font-semibold disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";
export default function OfferAccess() {
  const [token, setToken] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [data, setData] = useState<AccessData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const [parent, setParent] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [now, setNow] = useState(Date.now());
  const childToken = useRef<{ id: string; token: string } | null>(null);
  const currentToken = useRef("");
  useEffect(() => {
    function readAccessToken() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const supplied = fragment.get("token");
      const accessToken =
        new URLSearchParams(window.location.search).get("recover") === "1"
          ? ""
          : supplied !== null
            ? isOfferToken(supplied)
              ? supplied
              : ""
            : restoreOfferToken();
      if (window.location.hash)
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname,
        );
      if (accessToken) persistOfferToken(accessToken);
      setInitialized(true);
      if (currentToken.current === accessToken) return;
      currentToken.current = accessToken;
      setToken(accessToken);
      setBusy("");
      setData(null);
      setError("");
      setNotice("");
      setCopyFallback("");
      setParent("");
      setRecoveryToken("");
      childToken.current = null;
      try {
        const previous = sessionStorage.getItem(`offer-parent:${accessToken}`);
        if (isOfferToken(previous)) setParent(previous);
      } catch {
        /* Optional navigation only. */
      }
    }
    readAccessToken();
    window.addEventListener("hashchange", readAccessToken);
    return () => window.removeEventListener("hashchange", readAccessToken);
  }, []);
  const refresh = useCallback(async () => {
    if (!token) return;
    const result = await invokeOfferApi<AccessData>({
      action: "status",
      token,
    });
    if (currentToken.current !== token) return;
    setData(result);
    setError("");
    return result;
  }, [token]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await invokeOfferApi<AccessData>({
          action: "status",
          token,
        });
        if (!active || currentToken.current !== token) return;
        setData(result);
        setError("");
        if (
          (result.order.status === "pending" ||
            result.delivery_state === "processing") &&
          ++attempts < 20
        )
          timer = setTimeout(poll, 3000);
      } catch (err) {
        if (active && currentToken.current === token)
          setError(
            err instanceof Error
              ? err.message
              : "Your download could not be loaded.",
          );
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [token]);
  useEffect(() => {
    if (!data?.next_offer_deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data?.next_offer_deadline]);
  async function act(action: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (err) {
      if (currentToken.current === token)
        setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      if (currentToken.current === token) setBusy("");
    }
  }
  async function acceptNext() {
    const next = data?.next_offer;
    if (!next) return;
    if (childToken.current?.id !== next.id)
      childToken.current = { id: next.id, token: retryToken(next.id, token) };
    const nextToken = childToken.current.token;
    try {
      sessionStorage.setItem(`offer-parent:${nextToken}`, token);
    } catch {
      /* The original access link remains valid. */
    }
    persistOfferToken(nextToken);
    setRecoveryToken(nextToken);
    const result = await invokeOfferApi<OfferClaim>({
      action: "claim",
      offer_id: next.id,
      token: nextToken,
      parent_token: token,
    });
    if (currentToken.current !== token) return;
    window.location.assign(
      safeOfferRedirect(result.checkout_url || result.access_url),
    );
  }
  const expiredNext =
    !!data?.next_offer_deadline &&
    new Date(data.next_offer_deadline).getTime() <= now;
  const next = expiredNext ? null : data?.next_offer;
  const upsell = readPresentation(next?.presentation)?.upsell;
  const thanks = readPresentation(data?.presentation)?.thankYou;
  return (
    <OfferShell focused={upsell?.focusMode}>
      <div className="max-w-3xl mx-auto">
        <p
          className="text-sm font-bold tracking-widest uppercase mb-4"
          style={{ color: "var(--brand-accent)" }}
        >
          Your resources
        </p>
        <h1 className="font-display text-4xl md:text-5xl leading-tight">
          {data?.order.title || "Your download"}
        </h1>
        {!initialized || (token && !data && !error) ? (
          <p role="status" className="mt-6 text-white/75">
            Loading your access…
          </p>
        ) : !token ? (
          <p className="mt-6 text-white/80">
            Open the complete access link you saved after requesting your
            download. This page needs that private link to find your resource.
          </p>
        ) : null}
        {initialized && (!token || (error && !data)) && <OfferRecovery />}
        {data && (
          <section
            className="mt-8 p-6 md:p-8 rounded-lg border border-white/20 bg-white/[0.035]"
            aria-label="Download access"
          >
            {data.order.status === "fulfilled" ? (
              <>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-green-300" aria-hidden="true" />
                  <h2 className="font-display text-2xl">
                    {thanks?.headline || "Your download is ready"}
                  </h2>
                </div>
                {(thanks?.body || data.thank_you_message) && (
                  <p className="mt-4 text-white/80 whitespace-pre-line">
                    {thanks?.body || data.thank_you_message}
                  </p>
                )}
                {thanks?.firstStep && (
                  <div className="mt-5 rounded border border-white/15 p-4">
                    <h3 className="font-semibold">Your first step</h3>
                    <p className="mt-2 whitespace-pre-line text-white/80">
                      {thanks.firstStep}
                    </p>
                  </div>
                )}
                <p className="mt-4 text-sm text-white/70 break-words">
                  {data.order.asset_name}
                </p>
                <button
                  className={`${buttonClass} mt-6`}
                  disabled={!!busy}
                  style={{
                    background: "var(--brand-accent)",
                    color: "var(--brand-backdrop)",
                  }}
                  onClick={() =>
                    void act("download", async () => {
                      const file = await invokeOfferApi<{
                        url: string;
                        filename: string;
                      }>({ action: "download", token });
                      if (currentToken.current !== token) return;
                      const link = document.createElement("a");
                      link.href = safeOfferRedirect(file.url);
                      link.download = file.filename;
                      link.rel = "noreferrer noopener";
                      link.target = "_blank";
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                    })
                  }
                >
                  <Download size={18} aria-hidden="true" />
                  {busy === "download" ? "Preparing…" : "Download file"}
                </button>
              </>
            ) : data.order.status === "pending" ? (
              <>
                <h2 className="font-display text-2xl">
                  Waiting for payment confirmation
                </h2>
                <p className="mt-4 text-white/80">
                  Your file will unlock once payment is confirmed. If you left
                  checkout, you can continue below. Some payment methods take
                  longer to confirm.
                </p>
                {data.checkout_url && (
                  <a
                    href={data.checkout_url}
                    rel="noreferrer"
                    className={`${buttonClass} mt-6`}
                  >
                    Continue checkout · {offerPrice(data.order)}
                  </a>
                )}
                <button
                  className={`${buttonClass} mt-4 sm:ml-3`}
                  disabled={!!busy}
                  onClick={() =>
                    void act("refresh", async () => {
                      await refresh();
                    })
                  }
                >
                  <RefreshCw size={17} aria-hidden="true" />
                  Check payment status
                </button>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl">
                  {data.order.status === "refunded"
                    ? "This purchase was refunded"
                    : data.order.status === "expired"
                      ? "This checkout has expired"
                      : "Payment was not completed"}
                </h2>
                <p className="mt-4 text-white/80">
                  {data.order.status === "refunded"
                    ? "Download access for this purchase is no longer available."
                    : "No download has been unlocked. Contact us if you need help or believe payment was completed."}
                </p>
                <button
                  className={`${buttonClass} mt-5`}
                  disabled={!!busy}
                  onClick={() =>
                    void act("refresh", async () => {
                      await refresh();
                    })
                  }
                >
                  Refresh status
                </button>
              </>
            )}
            <div className="border-t border-white/15 mt-7 pt-5">
              <button
                className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
                onClick={() =>
                  void act("copy", async () => {
                    try {
                      await navigator.clipboard.writeText(data.access_url);
                      if (currentToken.current !== token) return;
                      setNotice(
                        "Access link copied. Save it somewhere private.",
                      );
                    } catch {
                      if (currentToken.current === token)
                        setCopyFallback(data.access_url);
                    }
                  })
                }
              >
                <Copy size={15} aria-hidden="true" />
                Copy my private access link
              </button>
              <p className="mt-2 text-xs leading-relaxed text-white/65">
                Save this link before leaving. Anyone with it can access your
                resource.
              </p>
              {data.order.status === "fulfilled" && (
                <div className="mt-5 text-sm leading-relaxed text-white/75">
                  <p>
                    {data.delivery_state === "sent"
                      ? "Your access email was accepted by the email provider. Check your inbox and spam folder; delivery is not guaranteed."
                      : data.delivery_state === "processing"
                        ? "Your access email is being prepared. You can download now and save this private link."
                        : data.delivery_state === "needs_review"
                          ? "We couldn’t confirm the access email. Save your private link or use email recovery below."
                          : data.delivery_ready
                            ? "Your access email has not been confirmed. Your download is available here."
                            : "Email delivery is currently unavailable. Save your private link to return to this download."}
                  </p>
                  {data.delivery_ready &&
                    data.delivery_state !== "sent" &&
                    data.delivery_state !== "needs_review" && (
                      <button
                        disabled={!!busy}
                        className={`${buttonClass} mt-3`}
                        onClick={() =>
                          void act("email", async () => {
                            const result = await invokeOfferApi<{
                              delivery_state: AccessData["delivery_state"];
                            }>({ action: "email_access", token });
                            if (currentToken.current !== token) return;
                            setData((current) =>
                              current
                                ? {
                                    ...current,
                                    delivery_state: result.delivery_state,
                                  }
                                : current,
                            );
                            setNotice(
                              result.delivery_state === "sent"
                                ? "Access email accepted by the provider. Check your inbox and spam folder."
                                : "The email has not been confirmed yet. Save your private link and try again in a minute, or contact support.",
                            );
                          })
                        }
                      >
                        {busy === "email"
                          ? "Checking email…"
                          : "Retry access email"}
                      </button>
                    )}
                  <a
                    href="/offer-access?recover=1"
                    className="mt-3 block underline underline-offset-4"
                  >
                    Recover access by email
                  </a>
                </div>
              )}
              {copyFallback && (
                <label className="block mt-3 text-sm">
                  Select and copy your private link
                  <input
                    readOnly
                    value={copyFallback}
                    onFocus={(event) => event.target.select()}
                    className="mt-2 block w-full rounded border border-white/25 bg-black/30 p-3"
                  />
                </label>
              )}
            </div>
          </section>
        )}
        {next && (
          <section
            className="mt-8 rounded-lg border p-6 md:p-8"
            style={{ borderColor: "var(--brand-accent)" }}
            aria-label="Optional follow-up offer"
          >
            <p className="text-xs uppercase tracking-widest text-white/70">
              {upsell?.eyebrow || "An optional next step"}
            </p>
            <h2 className="font-display text-3xl mt-3">
              {upsell?.headline || next.title}
            </h2>
            <p className="mt-4 leading-relaxed text-white/85">
              {upsell?.subheadline || next.summary}
            </p>
            {next.cover_url && (
              <img
                src={next.cover_url}
                alt={next.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="max-h-64 mt-5 rounded object-contain"
              />
            )}
            <div className="mt-5 space-y-3 text-white/80 leading-relaxed">
              <OfferSections
                sections={upsell?.sections || []}
                fallback={next.body}
                actionLabel={upsell?.ctaText || "See this offer"}
                onAction={() =>
                  document.getElementById("accept-follow-up")?.focus()
                }
              />
            </div>
            <p className="font-bold text-xl mt-5">
              {offerPrice(next)}
              {next.kind === "paid" && (
                <span className="text-sm font-normal text-white/70">
                  {" "}
                  · one payment
                </span>
              )}
            </p>
            {data?.next_offer_deadline && (
              <p className="mt-3 text-sm text-white/75">
                Start checkout by{" "}
                {new Date(data.next_offer_deadline).toLocaleString()} to take
                this offer. Your original download stays available.
              </p>
            )}
            <div className="flex flex-wrap gap-3 mt-6">
              <button
                id="accept-follow-up"
                className={buttonClass}
                style={{
                  background: "var(--brand-accent)",
                  color: "var(--brand-backdrop)",
                }}
                disabled={
                  !!busy || (next.kind === "paid" && !data?.payments_ready)
                }
                onClick={() => void act("accept", acceptNext)}
              >
                {busy === "accept"
                  ? "Opening…"
                  : next.kind === "free"
                    ? upsell?.ctaText || "Get this free resource"
                    : `${upsell?.ctaText || "Continue to checkout"} · ${offerPrice(next)}`}
              </button>
              <button
                className={buttonClass}
                disabled={!!busy}
                onClick={() =>
                  void act("decline", async () => {
                    await invokeOfferApi({ action: "decline", token });
                    await refresh();
                    if (currentToken.current !== token) return;
                    setNotice(
                      "Follow-up offer declined. Your original download is still available.",
                    );
                  })
                }
              >
                No thanks
              </button>
            </div>
            {upsell?.ctaMicrocopy && (
              <p className="mt-3 text-sm text-white/75">
                {upsell.ctaMicrocopy}
              </p>
            )}
            {next.kind === "paid" && (
              <p className="mt-3 text-sm text-white/75">
                You will review and confirm this separate payment at checkout.
              </p>
            )}
            {next.kind === "paid" && !data?.payments_ready && (
              <p className="mt-3 text-sm text-white/75">
                This purchase is not available yet.
              </p>
            )}
          </section>
        )}
        {expiredNext && (
          <p className="mt-6 text-white/75">
            The follow-up offer window has ended. Your original download stays
            available.
          </p>
        )}
        {error && (
          <div role="alert" className="mt-6 text-red-300">
            <p>{error}</p>
            {recoveryToken && (
              <a
                className="inline-block underline mt-3"
                href={`/offer-access#token=${recoveryToken}`}
              >
                Check follow-up access
              </a>
            )}
            {token && !data && (
              <button
                className={`${buttonClass} mt-3`}
                onClick={() =>
                  void act("refresh", async () => {
                    await refresh();
                  })
                }
              >
                Try again
              </button>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="mt-5 text-green-200">
            {notice}
          </p>
        )}
        {parent && (
          <a
            className="inline-block mt-8 underline underline-offset-4 text-white/80"
            href={`/offer-access#token=${parent}`}
          >
            Back to your previous resource
          </a>
        )}
      </div>
    </OfferShell>
  );
}
