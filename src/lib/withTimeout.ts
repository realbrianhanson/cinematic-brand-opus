import { supabase } from "@/integrations/supabase/client";

export async function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out. Please try again.")), ms)
  );
  return Promise.race([promise, timeout]);
}

/** Refresh the auth session before a mutation to prevent silent token hangs */
export async function ensureFreshSession() {
  try {
    await withTimeout(supabase.auth.getSession(), 5000);
  } catch {
    // If session refresh times out, proceed anyway — the mutation will fail with 401 if truly expired
  }
}

/** Wrap a mutation body: refresh session + apply timeout */
export async function safeMutation<T>(fn: () => Promise<T>, ms = 15000): Promise<T> {
  await ensureFreshSession();
  return withTimeout(fn(), ms);
}
