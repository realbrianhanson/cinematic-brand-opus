import { useState, useRef, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  experimentCopySchema,
  experimentProgress,
  loadOfferExperiments,
  type OfferExperiment,
} from "@/lib/offerExperiments";
import QueryNotice from "./QueryNotice";
import { withTimeout } from "@/lib/withTimeout";

export default function OfferExperiments() {
  const queryClient = useQueryClient();
  const saveAttempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const query = useQuery({
    queryKey: ["offer-experiments"],
    queryFn: loadOfferExperiments,
    staleTime: 30000,
  });
  const offers = useQuery({
    queryKey: ["experiment-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id,title,kind")
        .eq("status", "published")
        .eq("checkout_mode", "native")
        .eq("funnel_only", false)
        .order("title");
      if (error) throw new Error("Offers could not be loaded.");
      return data;
    },
  });
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget,
      values = new FormData(form);
    const copy = experimentCopySchema.safeParse({
      headline: String(values.get("headline") || "").trim(),
      subheadline: String(values.get("subheadline") || "").trim(),
      ctaText: String(values.get("ctaText") || "").trim(),
    });
    if (!copy.success) {
      setError(
        "Complete the alternate headline, supporting copy and button label.",
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      const input = {
        _offer_id: String(values.get("offer")),
        _name: String(values.get("name") || "").trim(),
        _hypothesis: String(values.get("hypothesis") || "").trim(),
        _variant_b: copy.data,
        _minimum_per_variant: Number(values.get("sample")),
        _minimum_days: Number(values.get("days")),
      };
      const fingerprint = JSON.stringify(input);
      if (saveAttempt.current?.fingerprint !== fingerprint)
        saveAttempt.current = { fingerprint, id: crypto.randomUUID() };
      const { error: failure } = await withTimeout(
        Promise.resolve(
          supabase.rpc("admin_offer_experiment_create", {
            ...input,
            _request_id: saveAttempt.current.id,
          }),
        ),
        15000,
      );
      if (failure) throw new Error(failure.message);
      saveAttempt.current = null;
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["offer-experiments"] });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Experiment could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }
  async function transition(
    experiment: OfferExperiment,
    state: "running" | "stopped",
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const { error: failure } = await supabase.rpc(
        "admin_offer_experiment_transition",
        { _id: experiment.id, _version: experiment.version, _state: state },
      );
      if (failure) throw new Error(failure.message);
      await queryClient.invalidateQueries({ queryKey: ["offer-experiments"] });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Experiment could not be updated.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Offer optimization</p>
          <h1>Controlled copy tests</h1>
          <p className="admin-help">
            Compare one clear message change on the same native offer. Prices,
            files, guarantees and checkout stay consistent.
          </p>
        </div>
        <button
          className="admin-btn-secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh results
        </button>
      </header>
      <section className="admin-card admin-section">
        <h2>Plan the test before starting</h2>
        <p className="admin-help">
          Each consenting session gets a stable 50/50 assignment. Only a
          displayed variant enters the denominator; only fulfilled free claims
          or provider-confirmed live payments count as conversions. Signed-in,
          preview, opted-out and privacy-signal traffic is excluded. External
          checkout tests require a separate verified attribution connection.
        </p>
        <p className="admin-help">
          Choose a sample size from your baseline conversion rate and the
          smallest improvement worth acting on. The defaults are planning
          placeholders, not a power calculation. Reach both the duration and
          sample target before reviewing the result. These reports do not
          declare a statistical winner. Stopping is final; changing the offer
          stops its test automatically.
        </p>
      </section>
      <section className="admin-card admin-section">
        <h2>Create a draft test</h2>
        <QueryNotice
          loading={offers.isPending}
          error={offers.error}
          retry={() => offers.refetch()}
        />
        {offers.data && !offers.data.length && (
          <p className="admin-help">
            Publish a native offer before creating a test.{" "}
            <Link to="/admin/offers" search={{ tab: "offers" }}>
              Open offers
            </Link>
            .
          </p>
        )}
        {offers.data && offers.data.length > 0 && (
          <form onSubmit={create} className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="admin-label">
                Offer
                <select className="admin-input" name="offer" required>
                  {offers.data.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.title} ·{" "}
                      {offer.kind === "free"
                        ? "free claims"
                        : "live paid orders"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-label">
                Test name
                <input
                  className="admin-input"
                  name="name"
                  required
                  maxLength={100}
                  placeholder="A clearer outcome in the headline"
                />
              </label>
            </div>
            <label className="admin-label block">
              Hypothesis
              <textarea
                className="admin-input"
                name="hypothesis"
                required
                minLength={10}
                maxLength={2000}
                placeholder="For this audience, this message should improve completed claims because…"
              />
            </label>
            <p className="admin-help">
              A is a snapshot of the current page. B changes only the three
              fields below. Use accurate claims and a button label that
              describes the real action.
            </p>
            <label className="admin-label block">
              B headline
              <input
                className="admin-input"
                name="headline"
                required
                maxLength={300}
              />
            </label>
            <label className="admin-label block">
              B supporting copy
              <textarea
                className="admin-input"
                name="subheadline"
                maxLength={1000}
              />
            </label>
            <label className="admin-label block">
              B button label
              <input
                className="admin-input"
                name="ctaText"
                required
                maxLength={80}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="admin-label">
                Minimum exposed sessions per variant
                <input
                  className="admin-input"
                  name="sample"
                  type="number"
                  min={100}
                  max={1000000}
                  step={1}
                  defaultValue={1000}
                  required
                />
              </label>
              <label className="admin-label">
                Minimum full days
                <input
                  className="admin-input"
                  name="days"
                  type="number"
                  min={7}
                  max={90}
                  step={1}
                  defaultValue={14}
                  required
                />
              </label>
            </div>
            <button className="admin-btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save draft test"}
            </button>
          </form>
        )}
      </section>
      {error && (
        <p role="alert" className="admin-alert admin-alert-error">
          {error}
        </p>
      )}
      <QueryNotice
        loading={query.isPending}
        error={query.error}
        retry={() => query.refetch()}
      />
      {query.data?.length === 0 && (
        <p className="admin-help">
          No tests yet. Drafts do not change the public page.
        </p>
      )}
      {query.data?.map((experiment) => {
        const progress = experimentProgress(experiment);
        return (
          <section
            key={experiment.id}
            className="admin-card admin-section space-y-4"
          >
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="admin-eyebrow">
                  {experiment.state} · {experiment.offer_title}
                </p>
                <h2>{experiment.name}</h2>
                <p className="admin-help">{experiment.hypothesis}</p>
              </div>
              <div className="flex gap-2 items-start">
                {experiment.state === "draft" && (
                  <button
                    className="admin-btn-primary"
                    disabled={pending}
                    onClick={() => void transition(experiment, "running")}
                  >
                    Start 50/50 test
                  </button>
                )}
                {experiment.state !== "stopped" && (
                  <button
                    className="admin-btn-secondary"
                    disabled={pending}
                    onClick={() => void transition(experiment, "stopped")}
                  >
                    {experiment.state === "draft" ? "Close draft" : "Stop test"}
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(["a", "b"] as const).map((variant) => {
                const copy = experiment[`variant_${variant}`],
                  result = experiment.results.find(
                    (row) => row.variant === variant,
                  );
                return (
                  <article
                    key={variant}
                    className="rounded-lg border border-[hsl(var(--admin-border))] p-4"
                  >
                    <h3>Variant {variant.toUpperCase()}</h3>
                    <p className="font-semibold mt-2">{copy.headline}</p>
                    <p className="admin-help">{copy.subheadline}</p>
                    <p className="admin-help">Button: {copy.ctaText}</p>
                    <p className="mt-3">
                      {result?.conversions ?? 0}{" "}
                      {experiment.metric === "free_claim"
                        ? "confirmed free claims"
                        : "confirmed live paid sessions"}{" "}
                      / {result?.sessions ?? 0} exposed sessions
                    </p>
                    <p className="admin-help">
                      {result?.sessions
                        ? `${((100 * result.conversions) / result.sessions).toFixed(1)}% conversion`
                        : "Waiting for measured exposure"}{" "}
                      · {result?.test_payments ?? 0} test payment sessions ·{" "}
                      {result?.refunded_sessions ?? 0} refunded sessions
                    </p>
                  </article>
                );
              })}
            </div>
            <p className="admin-help">
              {progress.readyForReview
                ? "Planned sample and duration reached. Review uncertainty and traffic balance before making a decision."
                : `Still below the planned sample or duration: ${experiment.minimum_per_variant.toLocaleString()} sessions per variant and ${experiment.minimum_days} days.`}{" "}
              Elapsed: {progress.days.toFixed(1)} days. {experiment.end_reason}
            </p>
          </section>
        );
      })}
      <p className="admin-help">
        Privacy choices remove associated observations. Measurement is retained
        for 90 days; older reports lose expired sessions. Results describe
        consenting sessions, not every visitor or unique person. Returning
        visitors can enter a new session; short client-side text changes can
        occur before interaction. No payment or booking is inferred from a
        click.
      </p>
    </div>
  );
}
