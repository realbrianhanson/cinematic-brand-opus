import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { initialRecoveryHint } from "@/lib/authRecovery";
import { withTimeout } from "@/lib/withTimeout";

type RoleOutcome = "admin" | "none" | "error";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  /** The role lookup failed (network, timeout, server error) — not a "no". */
  roleError: boolean;
  /** A retry of a failed role lookup is in flight. */
  roleRechecking: boolean;
  recheckRole: () => void;
  /** The current session came from a password-recovery link. */
  passwordRecovery: boolean;
  endPasswordRecovery: () => void;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  roleError: false,
  roleRechecking: false,
  recheckRole: () => {},
  passwordRecovery: false,
  endPasswordRecovery: () => {},
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const DEFAULT_ROLE_RETRY_DELAYS_MS = [600, 1800, 5000];
const DEFAULT_ROLE_TIMEOUT_MS = 8000;

async function lookupAdminRole(
  userId: string,
  timeoutMs: number,
): Promise<RoleOutcome> {
  try {
    const { data, error } = await withTimeout(
      Promise.resolve(
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle(),
      ),
      timeoutMs,
    );
    if (error) {
      console.error("Role check error:", error.message);
      return "error";
    }
    return data ? "admin" : "none";
  } catch (error: unknown) {
    console.error("Role check failed:", error);
    return "error";
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
  /** Backoff between automatic retries of a failed role lookup. */
  roleRetryDelaysMs?: number[];
  roleTimeoutMs?: number;
}

export const AuthProvider = ({
  children,
  roleRetryDelaysMs = DEFAULT_ROLE_RETRY_DELAYS_MS,
  roleTimeoutMs = DEFAULT_ROLE_TIMEOUT_MS,
}: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [role, setRole] = useState<{
    userId: string;
    status: RoleOutcome;
  } | null>(null);
  const [roleRechecking, setRoleRechecking] = useState(false);
  const [roleNonce, setRoleNonce] = useState(0);
  const [passwordRecovery, setPasswordRecovery] = useState(
    initialRecoveryHint.kind === "recovery",
  );

  // Session state only. The auth callback must stay synchronous: awaiting any
  // Supabase call inside it can deadlock the client's internal lock.
  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      receivedAuthEvent = true;
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "SIGNED_OUT") setPasswordRecovery(false);
      setUser(session?.user ?? null);
      setSessionResolved(true);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!active || receivedAuthEvent) return;
        setUser(session?.user ?? null);
      })
      .catch((e) => {
        console.error("Session load error:", e);
        if (active && !receivedAuthEvent) setUser(null);
      })
      .finally(() => {
        if (active) setSessionResolved(true);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Role lookup happens outside the auth callback, keyed to the current user,
  // so privileges never carry across a user switch or a sign-out. A failed
  // lookup stays distinct from a definite "no admin role" and is retried with
  // backoff; access still fails closed until the answer is "admin".
  const userId = user?.id ?? null;
  const retryKey = roleRetryDelaysMs.join(",");
  useEffect(() => {
    if (!userId) {
      setRole(null);
      setRoleRechecking(false);
      return;
    }

    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = retryKey ? retryKey.split(",").map(Number) : [];
    setRole((previous) => (previous?.userId === userId ? previous : null));

    const attempt = async (index: number) => {
      const outcome = await lookupAdminRole(userId, roleTimeoutMs);
      if (stale) return;
      setRole({ userId, status: outcome });
      const delay = outcome === "error" ? delays[index] : undefined;
      if (delay === undefined) {
        setRoleRechecking(false);
        return;
      }
      setRoleRechecking(true);
      timer = setTimeout(() => void attempt(index + 1), delay);
    };
    void attempt(0);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [userId, roleNonce, retryKey, roleTimeoutMs]);

  const currentRole = userId && role?.userId === userId ? role : null;
  const isAdmin = currentRole?.status === "admin";
  const roleError = currentRole?.status === "error";
  const loading = !sessionResolved || (!!userId && !currentRole);

  const recheckRole = useCallback(() => {
    setRoleRechecking(true);
    setRoleNonce((n) => n + 1);
  }, []);
  const endPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      console.error("Sign out error:", e);
    }
    setUser(null);
    setRole(null);
    setPasswordRecovery(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        roleError,
        roleRechecking: roleError && roleRechecking,
        recheckRole,
        passwordRecovery: !!user && passwordRecovery,
        endPasswordRecovery,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
