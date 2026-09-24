import { Fragment, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight } from "lucide-react";
import RedirectRuleForm from "./RedirectRuleForm";
import {
  createRule,
  REDIRECT_KEYS,
  type MissingPage,
  type RuleDraft,
} from "./redirectsData";
import { formatRedirectDate } from "./redirectFormat";

function referrerLabel(referrer: string | null) {
  if (!referrer) return "Direct or unknown";
  return referrer.replace(/^https?:\/\//, "");
}

export default function MissingPagesTable({
  pages,
  suggestionsId,
}: {
  pages: MissingPage[];
  suggestionsId: string;
}) {
  const client = useQueryClient();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (draft: RuleDraft) => createRule(draft),
    onSuccess: () => {
      setOpenPath(null);
      void client.invalidateQueries({ queryKey: REDIRECT_KEYS.missing });
      void client.invalidateQueries({ queryKey: REDIRECT_KEYS.rules });
    },
  });

  return (
    <div className="admin-conversion-table-wrap">
      <table className="admin-conversion-table" aria-label="Missing pages">
        <thead>
          <tr>
            <th scope="col">Page</th>
            <th scope="col">Visits</th>
            <th scope="col">Last seen</th>
            <th scope="col">Came from</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <Fragment key={page.path}>
              <tr>
                <td className="break-all font-mono">
                  {page.path}
                  {page.last_user_agent_class === "bot" && (
                    <span className="ml-2 rounded border border-border px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
                      Crawler
                    </span>
                  )}
                </td>
                <td>{page.hits.toLocaleString()}</td>
                <td className="whitespace-nowrap">
                  {formatRedirectDate(page.last_seen)}
                </td>
                <td className="break-all text-muted-foreground">
                  {referrerLabel(page.last_referrer)}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="admin-btn-secondary whitespace-nowrap"
                    aria-label={`Redirect ${page.path} to another page`}
                    aria-expanded={openPath === page.path}
                    onClick={() => {
                      create.reset();
                      setOpenPath(openPath === page.path ? null : page.path);
                    }}
                  >
                    <CornerDownRight size={14} aria-hidden /> Redirect to…
                  </button>
                </td>
              </tr>
              {openPath === page.path && (
                <tr>
                  <td colSpan={5}>
                    <RedirectRuleForm
                      initial={{
                        from_path: page.path,
                        to_path: "",
                        status_code: 301,
                        note: null,
                      }}
                      fromEditable={false}
                      suggestionsId={suggestionsId}
                      busy={create.isPending}
                      serverError={create.error?.message ?? null}
                      onSubmit={(draft) => create.mutate(draft)}
                      onCancel={() => setOpenPath(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
