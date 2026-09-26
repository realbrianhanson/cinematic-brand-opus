import { Fragment, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RedirectRuleForm from "./RedirectRuleForm";
import {
  createRule,
  deleteRule,
  fetchRedirectRules,
  REDIRECT_KEYS,
  updateRule,
  type RedirectRule,
  type RuleDraft,
} from "./redirectsData";
import {
  confirmDiscardAdminDraft,
  useConfigurationDraftGuard,
} from "./useConfigurationDraftGuard";
import { withTimeout } from "@/lib/withTimeout";
import { errorMessage } from "@/lib/errorMessage";
import { formatRedirectDate } from "./redirectFormat";

const NEW_RULE = "new";
const EMPTY_RULE = { from_path: "", to_path: "", status_code: 301, note: null };

export default function RedirectRulesTable({
  rules,
  suggestionsId,
}: {
  rules: RedirectRule[];
  suggestionsId: string;
}) {
  const client = useQueryClient();
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState("");
  const reloadingRef = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<RedirectRule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RedirectRule | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: REDIRECT_KEYS.rules });
    void client.invalidateQueries({ queryKey: REDIRECT_KEYS.missing });
  };
  const save = useMutation({
    mutationFn: ({
      rule,
      draft,
    }: {
      rule: RedirectRule | null;
      draft: RuleDraft;
    }) => (rule ? updateRule(rule, draft) : createRule(draft)),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ rule, active }: { rule: RedirectRule; active: boolean }) =>
      updateRule(rule, { is_active: active }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (rule: RedirectRule) => deleteRule(rule),
    onSettled: refresh,
  });
  const actionError =
    reloadError || toggle.error?.message || remove.error?.message;

  const busy =
    save.isPending || toggle.isPending || remove.isPending || reloading;
  useConfigurationDraftGuard(!!editing, busy);
  const openForm = (key: string | null) => {
    if (busy || (editing && !confirmDiscardAdminDraft())) return;
    save.reset();
    setEditingRule(rules.find((rule) => rule.id === key) ?? null);
    setEditing(key);
  };
  const reloadSaved = async () => {
    if (
      busy ||
      reloadingRef.current ||
      (editing && !confirmDiscardAdminDraft())
    )
      return;
    reloadingRef.current = true;
    setReloading(true);
    try {
      await client.fetchQuery({
        queryKey: REDIRECT_KEYS.rules,
        queryFn: () => withTimeout(fetchRedirectRules()),
        retry: false,
      });
      setEditing(null);
      setEditingRule(null);
      save.reset();
      toggle.reset();
      remove.reset();
      setReloadError("");
    } catch (error) {
      setReloadError(
        `Could not reload saved rules. Your draft is still here. ${errorMessage(error)}`,
      );
    } finally {
      reloadingRef.current = false;
      setReloading(false);
    }
  };
  const form = (rule: RedirectRule | null) => (
    <RedirectRuleForm
      key={editing}
      initial={rule ?? EMPTY_RULE}
      fromEditable={!rule}
      suggestionsId={suggestionsId}
      busy={busy}
      pendingLabel={reloading ? "Reloading…" : "Saving…"}
      serverError={save.error?.message ?? null}
      onSubmit={(draft) => save.mutate({ rule, draft })}
      onCancel={() => openForm(null)}
    />
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="admin-btn-secondary"
        disabled={busy}
        onClick={() => openForm(editing === NEW_RULE ? null : NEW_RULE)}
        aria-expanded={editing === NEW_RULE}
      >
        <Plus size={15} aria-hidden /> Add a rule
      </button>
      {editing && form(editingRule)}
      {(save.error || actionError) && (
        <button
          type="button"
          className="admin-btn-secondary"
          disabled={busy}
          onClick={() => void reloadSaved()}
        >
          Reload saved rules
        </button>
      )}
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {rules.length === 0 ? (
        <p className="admin-help">No rules yet</p>
      ) : (
        <div className="admin-conversion-table-wrap">
          <table className="admin-conversion-table" aria-label="Redirect rules">
            <thead>
              <tr>
                <th scope="col">Old address</th>
                <th scope="col">Goes to</th>
                <th scope="col">Type</th>
                <th scope="col">Visits</th>
                <th scope="col">Last used</th>
                <th scope="col">On</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <Fragment key={rule.id}>
                  <tr className={rule.is_active ? undefined : "opacity-60"}>
                    <td className="break-all font-mono">
                      {rule.from_path}
                      {rule.note && (
                        <span className="mt-1 block font-sans text-muted-foreground">
                          {rule.note}
                        </span>
                      )}
                    </td>
                    <td className="break-all font-mono">{rule.to_path}</td>
                    <td className="whitespace-nowrap">
                      {rule.status_code === 301 ? "Permanent" : "Temporary"}
                    </td>
                    <td>{rule.hits.toLocaleString()}</td>
                    <td className="whitespace-nowrap">
                      {formatRedirectDate(rule.last_hit_at)}
                    </td>
                    <td>
                      <Switch
                        checked={rule.is_active}
                        disabled={busy || !!editing}
                        aria-label={`Rule for ${rule.from_path} is ${rule.is_active ? "on" : "off"}`}
                        onCheckedChange={(active) =>
                          toggle.mutate({ rule, active })
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={busy}
                        aria-label={`Edit rule for ${rule.from_path}`}
                        aria-expanded={editing === rule.id}
                        onClick={() =>
                          openForm(editing === rule.id ? null : rule.id)
                        }
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={busy}
                        aria-label={`Delete rule for ${rule.from_path}`}
                        onClick={() => {
                          if (!editing || confirmDiscardAdminDraft()) {
                            setEditing(null);
                            setPendingDelete(rule);
                          }
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Visitors to {pendingDelete?.from_path} will see Page not found
              instead
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep rule</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
