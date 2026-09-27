import { useEffect, useRef, useState } from "react";
import CallFunnelExperience from "@/components/call-funnels/CallFunnelExperience";
import {
  CallApiError,
  getCallApplicationState,
  submitCallApplication,
  type CallSubmit,
} from "@/lib/callFunnelsClient";
import { newFunnelToken } from "@/lib/funnelJourneysClient";
import type {
  CallAnswers,
  CallApplicationState,
  CallContact,
  CallPublication,
} from "@/lib/callFunnels";

export default function CallFunnelPage({
  publication,
}: {
  publication: CallPublication | null;
}) {
  return publication ? (
    <CallSession
      key={`${publication.id}:${publication.revision}`}
      publication={publication}
    />
  ) : (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-3xl">This funnel is not available</h1>
      <p className="mt-5">
        It may be private or paused. Please check back or contact the team.
      </p>
      <a className="mt-5 inline-block underline" href="/support">
        Get help
      </a>
    </main>
  );
}
function CallSession({ publication }: { publication: CallPublication }) {
  const [state, setState] = useState<CallApplicationState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const token = useRef("");
  const pending = useRef<CallSubmit | null>(null);
  const storageKey = `call-access:${publication.id}`;
  useEffect(() => {
    let active = true;
    let cached = "";
    try {
      cached = sessionStorage.getItem(storageKey) ?? "";
    } catch {
      /* optional */
    }
    if (!/^[a-f0-9]{64}$/.test(cached)) {
      setLoaded(true);
      return;
    }
    token.current = cached;
    getCallApplicationState(cached)
      .then((value) => {
        if (active) setState(value);
      })
      .catch((e) => {
        if (!active) return;
        // A request may still be committing when this tab reloads. Keep an unknown
        // capability so another submission cannot create a second application.
        if (e instanceof CallApiError && e.status === 404) {
          return;
        }
        if (e instanceof CallApiError && e.status === 410) {
          token.current = "";
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* optional */
          }
        } else {
          setError(
            "Your earlier submission could not be checked. Reload to recover it before starting again.",
          );
          setUncertain(true);
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);
  function accept(value: CallApplicationState) {
    setState(value);
    pending.current = null;
    setUncertain(false);
    setError("");
    return value;
  }
  async function submit(
    answers: CallAnswers,
    contact: CallContact,
    consent: boolean,
  ) {
    if (!consent)
      throw new Error(
        "Please agree to contact about this application before continuing.",
      );
    if (!token.current) {
      token.current = newFunnelToken();
      try {
        sessionStorage.setItem(storageKey, token.current);
      } catch {
        /* page works in memory */
      }
    }
    if (!pending.current)
      pending.current = {
        slug: publication.slug,
        revision: publication.revision,
        token: token.current,
        requestId: crypto.randomUUID(),
        answers: structuredClone(answers),
        contact: { ...contact },
        consent: true,
      };
    try {
      return accept(await submitCallApplication(pending.current));
    } catch (e) {
      if (
        e instanceof CallApiError &&
        [400, 404, 410, 422, 429].includes(e.status)
      ) {
        pending.current = null;
      } else {
        setUncertain(true);
        setError(
          "Your submission could not be confirmed. Check its status or retry the original submission below; this will not create a duplicate.",
        );
      }
      throw e;
    }
  }
  async function refresh() {
    return accept(await getCallApplicationState(token.current));
  }
  async function recover(retry: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (retry && pending.current)
        accept(await submitCallApplication(pending.current));
      else await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your submission is still unconfirmed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!loaded)
    return (
      <main className="mx-auto max-w-xl px-6 py-24" role="status">
        Checking your application…
      </main>
    );
  const pinned = state
    ? {
        ...publication,
        revision: state.revision,
        config: state.config,
        proof: state.proof,
      }
    : publication;
  return (
    <>
      {uncertain && (
        <main className="mx-auto max-w-xl px-6 py-24">
          <h1 className="text-3xl">Recover your submission</h1>
          <p className="mt-5" role="alert">
            {error}
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <button
              disabled={busy}
              className="rounded border border-current px-5 py-3"
              onClick={() => void recover(false)}
            >
              Check submission status
            </button>
            {pending.current && (
              <button
                disabled={busy}
                className="rounded border border-current px-5 py-3"
                onClick={() => void recover(true)}
              >
                Retry original submission
              </button>
            )}
          </div>
          <a className="mt-6 inline-block underline" href="/support">
            Contact support
          </a>
        </main>
      )}
      <div hidden={uncertain}>
        <CallFunnelExperience
          publication={pinned}
          initialState={state}
          onSubmit={submit}
          onRefreshState={refresh}
        />
      </div>
    </>
  );
}
