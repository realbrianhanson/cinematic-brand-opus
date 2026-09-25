import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import QueryNotice from "./QueryNotice";
import MissingPagesTable from "./MissingPagesTable";
import RedirectRulesTable from "./RedirectRulesTable";
import {
  fetchMissingPages,
  fetchPathSuggestions,
  fetchRedirectRules,
  REDIRECT_KEYS,
  STATIC_SUGGESTIONS,
} from "./redirectsData";

const SUGGESTIONS_STALE_MS = 5 * 60 * 1000;

export default function RedirectsManager() {
  const suggestionsId = useId();
  const missing = useQuery({
    queryKey: REDIRECT_KEYS.missing,
    queryFn: fetchMissingPages,
  });
  const rules = useQuery({
    queryKey: REDIRECT_KEYS.rules,
    queryFn: fetchRedirectRules,
  });
  const suggestions = useQuery({
    queryKey: REDIRECT_KEYS.suggestions,
    queryFn: fetchPathSuggestions,
    staleTime: SUGGESTIONS_STALE_MS,
  });

  return (
    <div className="space-y-10">
      <header>
        <p className="admin-eyebrow">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Redirects
        </h1>
        <div className="mt-3 max-w-2xl space-y-2 text-sm text-muted-foreground">
          <p>
            When someone opens a link to a page that doesn't exist, they go to a
            helpful Page not found screen unless a redirect rule is saved
          </p>
          <p>
            Add a rule when a better page exists so old links land in the right
            place
          </p>
        </div>
      </header>

      <datalist id={suggestionsId}>
        {(suggestions.data ?? STATIC_SUGGESTIONS).map((s) => (
          <option key={s.path} value={s.path} label={s.label} />
        ))}
      </datalist>

      <section aria-labelledby="missing-pages-heading" className="space-y-4">
        <div>
          <h2 id="missing-pages-heading" className="text-lg font-semibold">
            Missing pages
          </h2>
          <p className="admin-help mt-1">
            These addresses were not found, busiest first. Choose a relevant
            replacement for the ones that matter
          </p>
        </div>
        <QueryNotice
          loading={missing.isLoading}
          error={missing.error}
          retry={() => void missing.refetch()}
        />
        {missing.data &&
          (missing.data.length === 0 ? (
            <p className="admin-help">No missing pages yet</p>
          ) : (
            <MissingPagesTable
              pages={missing.data}
              suggestionsId={suggestionsId}
            />
          ))}
      </section>

      <section aria-labelledby="redirect-rules-heading" className="space-y-4">
        <div>
          <h2 id="redirect-rules-heading" className="text-lg font-semibold">
            Redirect rules
          </h2>
          <p className="admin-help mt-1">
            A rule sends an old address to its relevant replacement. Leave
            unrelated missing addresses as Page not found
          </p>
        </div>
        <QueryNotice
          loading={rules.isLoading}
          error={rules.error}
          retry={() => void rules.refetch()}
        />
        {rules.data && (
          <RedirectRulesTable
            rules={rules.data}
            suggestionsId={suggestionsId}
          />
        )}
      </section>
    </div>
  );
}
