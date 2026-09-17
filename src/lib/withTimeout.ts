import { supabase } from "@/integrations/supabase/client";

export async function withTimeout<T>(
  promise: Promise<T>,
  ms = 15000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            "Request timed out. Check whether the operation completed before retrying.",
          ),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
export async function safeMutation<T>(
  fn: () => Promise<T>,
  ms = 15000,
): Promise<T> {
  await ensureFreshSession();
  return withTimeout(fn(), ms);
}
