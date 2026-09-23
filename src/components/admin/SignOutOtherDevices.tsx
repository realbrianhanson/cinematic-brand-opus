import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Outcome = "done" | "error" | null;

/** Revokes every session for this account except the current browser. */
const SignOutOtherDevices = () => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const confirm = async () => {
    setPending(true);
    setOutcome(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) console.error("Sign out others error:", error.message);
      setOutcome(error ? "error" : "done");
    } catch (err) {
      console.error("Sign out others error:", err);
      setOutcome("error");
    } finally {
      setPending(false);
      setOpen(false);
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{ gap: 12 }}
      aria-labelledby="other-devices-title"
      role="group"
    >
      <h2 id="other-devices-title">Other devices</h2>
      <p className="admin-help">
        Signed in on a shared or lost device? End every other session for this
        account. This browser stays signed in.
      </p>
      {outcome === "done" && (
        <p role="status" className="admin-notice">
          All other devices were signed out. This browser stays signed in.
        </p>
      )}
      {outcome === "error" && (
        <p role="alert" className="admin-notice admin-notice-error">
          Couldn't sign out other devices. Try again.
        </p>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="admin-btn-secondary"
            style={{ alignSelf: "flex-start" }}
            disabled={pending}
          >
            Sign out all other devices
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out all other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              Every other browser and device signed in to this account will be
              signed out and must sign in again. This browser stays signed in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {pending ? "Signing out…" : "Sign out other devices"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SignOutOtherDevices;
