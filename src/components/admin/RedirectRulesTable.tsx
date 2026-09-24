import { Fragment, useState } from "react";
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
  REDIRECT_KEYS,
  updateRule,
  type RedirectRule,
  type RuleDraft,
} from "./redirectsData";
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
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RedirectRule | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: REDIRECT_KEYS.rules });
    void client.invalidateQueries({ queryKey: REDIRECT_KEYS.missing });
  };
  const save = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: RuleDraft }) =>
      id ? updateRule(id, draft) : createRule(draft),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateRule(id, { is_active: active }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSettled: refresh,
  });
  const actionError = toggle.error?.message ?? remove.error?.message;

  const openForm = (key: string | null) => {
    save.reset();
    setEditing(key);
  };
  const form = (rule: RedirectRule | null) => (
    <RedirectRuleForm
      initial={rule ?? EMPTY_RULE}
      fromEditable={!rule}
      suggestionsId={suggestionsId}
      busy={save.isPending}
      serverError={save.error?.message ?? null}
      onSubmit={(draft) => save.mutate({ id: rule?.id ?? null, draft })}
      onCancel={() => setEditing(null)}
    />
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="admin-btn-secondary"
        onClick={() => openForm(editing === NEW_RULE ? null : NEW_RULE)}
        aria-expanded={editing === NEW_RULE}
      >
        <Plus size={15} aria-hidden /> Add a rule
      </button>
      {editing === NEW_RULE && form(null)}
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
                        disabled={toggle.isPending}
                        aria-label={`Rule for ${rule.from_path} is ${rule.is_active ? "on" : "off"}`}
                        onCheckedChange={(active) =>
                          toggle.mutate({ id: rule.id, active })
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        type="button"
                        className="admin-btn-ghost"
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
                        aria-label={`Delete rule for ${rule.from_path}`}
                        onClick={() => setPendingDelete(rule)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                  {editing === rule.id && (
                    <tr>
                      <td colSpan={7}>{form(rule)}</td>
                    </tr>
                  )}
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
              Visitors to {pendingDelete?.from_path} will go to the home page
              instead
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep rule</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
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
