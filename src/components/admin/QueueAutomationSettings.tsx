import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errorMessage";
import { Settings2 } from "lucide-react";
import { Link } from "@/lib/router-compat";
type Settings = Pick<
  Tables<"site_settings_private">,
  | "id"
  | "auto_publish_enabled"
  | "auto_publish_daily_cap"
  | "auto_publish_min_quality"
>;
export default function QueueAutomationSettings({
  settings,
  disabled,
  onSaved,
}: {
  settings: Settings | null;
  disabled: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [baseline, setBaseline] = useState<Settings | null>(null);
  const [cap, setCap] = useState("3");
  const [quality, setQuality] = useState("85");
  const { toast } = useToast();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || disabled || !baseline) return;
    const dailyCap = Number(cap),
      minQuality = Number(quality);
    if (
      !/^\d+$/.test(cap) ||
      !Number.isSafeInteger(dailyCap) ||
      dailyCap < 0 ||
      dailyCap > 100 ||
      !/^\d+$/.test(quality) ||
      minQuality < 0 ||
      minQuality > 100
    ) {
      toast({
        title: "Check your settings",
        description:
          "Use whole numbers from 0 to 100 for the daily cap and minimum quality.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("site_settings_private")
        .update({
          auto_publish_enabled: enabled,
          auto_publish_daily_cap: dailyCap,
          auto_publish_min_quality: minQuality,
        })
        .eq("id", baseline.id)
        .eq("auto_publish_enabled", baseline.auto_publish_enabled)
        .eq("auto_publish_daily_cap", baseline.auto_publish_daily_cap)
        .eq("auto_publish_min_quality", baseline.auto_publish_min_quality)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "These settings changed in another session. Refresh the queue and reopen this dialog before saving.",
        );
      toast({
        title: "Automation settings saved",
        description: enabled
          ? "Eligible content may now be generated and published automatically within your cap."
          : "Future automated runs are paused. An already-running task may still finish.",
      });
      setOpen(false);
      await onSaved();
    } catch (error) {
      toast({
        title: "Settings were not saved",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (next && settings) {
          setBaseline(settings);
          setEnabled(settings.auto_publish_enabled);
          setCap(String(settings.auto_publish_daily_cap));
          setQuality(String(settings.auto_publish_min_quality));
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button className="admin-btn-ghost" disabled={disabled}>
          <Settings2 size={15} />
          Manage automation
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Publishing automation</DialogTitle>
        <DialogDescription>
          Choose whether the content pipeline runs automatically. Enabling it
          may use AI credits and publish articles that pass the checks.
        </DialogDescription>
        {settings ? (
          <form onSubmit={save} className="grid gap-5">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={saving}
              />
              Enable automated generation and publishing
            </label>
            <label className="grid gap-2">
              Daily cap
              <input
                className="admin-input"
                type="number"
                min="0"
                max="100"
                step="1"
                required
                value={cap}
                onChange={(event) => setCap(event.target.value)}
                disabled={saving}
              />
              <span className="text-xs text-muted-foreground">
                Limits automatic drafting and publishing per day. Use 0 to allow
                no new automatic work.
              </span>
            </label>
            <label className="grid gap-2">
              Minimum publishing quality
              <input
                className="admin-input"
                type="number"
                min="0"
                max="100"
                step="1"
                required
                value={quality}
                onChange={(event) => setQuality(event.target.value)}
                disabled={saving}
              />
              <span className="text-xs text-muted-foreground">
                Score out of 100. Originality, sources, fact checks, and other
                publishing rules still apply.
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="admin-btn-ghost"
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="admin-btn-primary"
                type="submit"
                disabled={saving || disabled}
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm">
            Complete{" "}
            <Link to="/admin/setup" className="underline">
              site setup
            </Link>{" "}
            to create the settings for this site.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
