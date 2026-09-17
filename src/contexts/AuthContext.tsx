import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [role, setRole] = useState<{ userId: string; isAdmin: boolean } | null>(null);

  // Session state only. The auth callback must stay synchronous: awaiting any
  // Supabase call inside it can deadlock the client's internal lock.
  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      receivedAuthEvent = true;
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
  // so privileges never carry across a user switch or a sign-out.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }

    let stale = false;
    setRole(null);

    Promise.resolve(supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle())
      .then(({ data, error }) => {
        if (stale) return;
        if (error) console.error("Role check error:", error.message);
        setRole({ userId, isAdmin: !error && !!data });
      })
      .catch((error: unknown) => {
        if (stale) return;
        console.error("Role check failed:", error);
        setRole({ userId, isAdmin: false });
      });

    return () => {
      stale = true;
    };
  }, [userId]);

  const isAdmin = !!userId && role?.userId === userId && role.isAdmin;
  const loading = !sessionResolved || (!!userId && role?.userId !== userId);


  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
