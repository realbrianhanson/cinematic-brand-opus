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
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);

  // Session state only. The auth callback must stay synchronous: awaiting any
  // Supabase call inside it can deadlock the client's internal lock.
  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setSessionResolved(true);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!active) return;
        setUser(session?.user ?? null);
      })
      .catch((e) => {
        console.error("Session load error:", e);
        if (active) setUser(null);
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
      setIsAdmin(false);
      setRoleResolved(true);
      return;
    }

    let stale = false;
    setIsAdmin(false);
    setRoleResolved(false);

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data, error }) => {
        if (stale) return;
        if (error) console.error("Role check error:", error.message);
        setIsAdmin(!error && !!data);
        setRoleResolved(true);
      });

    return () => {
      stale = true;
    };
  }, [userId]);

  const loading = !sessionResolved || !roleResolved;


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
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
