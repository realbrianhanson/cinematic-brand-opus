/**
 * Where a missing page should send the visitor. Shared by the server entry
 * (direct loads and crawlers) and the in-app not-found screen (navigation
 * inside the site). A saved rule wins; otherwise the path is recorded for the
 * admin Redirects page and the visitor goes home. Failures always go home.
 */
import {
  buildRedirectLocation,
  HOME_PATH,
  validateRedirectTarget,
  type RedirectStatus,
  type UserAgentClass,
} from "../../supabase/functions/_shared/redirectPaths";

export type RedirectRule = { to_path: string; status_code: number };

export type NotFoundLookup = {
  resolve: (path: string) => Promise<RedirectRule | null>;
  record: (
    path: string,
    referrer: string | null,
    uaClass: UserAgentClass,
  ) => Promise<void>;
};

export type MissingPageVisit = {
  /** Normalized path (see normalizeRedirectPath). */
  path: string;
  /** Raw query string of the visit, carried to site-path destinations. */
  search: string;
  referrer: string | null;
  uaClass: UserAgentClass;
};

export type MissingPageDestination = {
  location: string;
  status: RedirectStatus;
  fromRule: boolean;
};

type Rpc = (
  fn: "resolve_redirect" | "record_not_found",
  args: Record<string, unknown>,
) => { abortSignal: (signal: AbortSignal) => PromiseLike<RpcResult> };
type RpcResult = { data: unknown; error: { message: string } | null };

/** Adapts a Supabase client (anon key) to the two public database functions. */
export function supabaseNotFoundLookup(
  client: { rpc: unknown },
  signal: AbortSignal,
): NotFoundLookup {
  const rpc = (client.rpc as Rpc).bind(client);
  return {
    async resolve(path) {
      const { data, error } = await rpc("resolve_redirect", {
        p_path: path,
      }).abortSignal(signal);
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return (row as RedirectRule | undefined) ?? null;
    },
    async record(path, referrer, uaClass) {
      const { error } = await rpc("record_not_found", {
        p_path: path,
        p_referrer: referrer,
        p_ua_class: uaClass,
      }).abortSignal(signal);
      if (error) throw new Error(error.message);
    },
  };
}

function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("lookup timed out"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("lookup timed out")), remaining);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fromRule(
  rule: RedirectRule | null,
  search: string,
): MissingPageDestination | null {
  if (!rule) return null;
  const target = validateRedirectTarget(rule.to_path);
  if (!target.ok) return null;
  return {
    location: buildRedirectLocation(target.value, search),
    status: rule.status_code === 301 ? 301 : 302,
    fromRule: true,
  };
}

export async function findMissingPageDestination(
  visit: MissingPageVisit,
  lookup: NotFoundLookup,
  timeoutMs: number,
): Promise<MissingPageDestination> {
  const home: MissingPageDestination = {
    location: buildRedirectLocation(HOME_PATH, visit.search),
    status: 302,
    fromRule: false,
  };
  const deadline = Date.now() + timeoutMs;
  try {
    const rule = fromRule(
      await withDeadline(lookup.resolve(visit.path), deadline),
      visit.search,
    );
    if (rule) return rule;
    await withDeadline(
      lookup.record(visit.path, visit.referrer, visit.uaClass),
      deadline,
    );
  } catch (error) {
    console.error("[not-found] redirect lookup failed", visit.path, error);
  }
  return home;
}
