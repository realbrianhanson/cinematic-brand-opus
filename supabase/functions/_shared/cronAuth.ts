// Shared auth for edge functions that need BOTH manual admin invocation
// AND unattended (pg_cron via pg_net) invocation.
//
// Returns { ok: true, mode: 'cron' | 'admin', userId?: string } if allowed,
// otherwise a Response to return immediately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

export interface CronAuthResult {
  ok: true;
  mode: "cron" | "admin";
  userId?: string;
}

// Module-level cache of the Vault-stored cron secret. Vault is the single
// source of truth so future rotation is one SQL update. TTL ~5 min.
let vaultCronSecret: string | null = null;
let vaultCronSecretFetchedAt = 0;
const VAULT_CRON_SECRET_TTL_MS = 5 * 60 * 1000;

async function getVaultCronSecret(): Promise<string | null> {
  const now = Date.now();
  if (vaultCronSecret && now - vaultCronSecretFetchedAt < VAULT_CRON_SECRET_TTL_MS) {
    return vaultCronSecret;
  }
  const url = Deno.env.get("SUPABASE_URL");
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !srk) return null;
  try {
    const admin = createClient(url, srk);
    const { data, error } = await admin.rpc("get_cron_invocation_secret");
    if (error) {
      console.error("get_cron_invocation_secret RPC failed:", error.message);
      return null;
    }
    const val = typeof data === "string" ? data : null;
    if (val) {
      vaultCronSecret = val;
      vaultCronSecretFetchedAt = now;
    }
    return val;
  } catch (e) {
    console.error("get_cron_invocation_secret threw:", e);
    return null;
  }
}

export async function authorizeCronOrAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<CronAuthResult | Response> {
  const incomingCron = req.headers.get("x-cron-secret");
  if (incomingCron) {
    const envSecret = Deno.env.get("CRON_INVOCATION_SECRET");
    if (envSecret && incomingCron === envSecret) {
      return { ok: true, mode: "cron" };
    }
    const vaultSecret = await getVaultCronSecret();
    if (vaultSecret && incomingCron === vaultSecret) {
      return { ok: true, mode: "cron" };
    }
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Service role bearer also counts as internal.
  const bearer = authHeader.slice("Bearer ".length).trim();
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (srk && bearer === srk) {
    return { ok: true, mode: "cron" };
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await anonClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { ok: true, mode: "admin", userId: user.id };
}
