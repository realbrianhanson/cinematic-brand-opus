/**
 * Server-only helpers for the Lovable AI Gateway.
 *
 * The gateway mints an `X-Lovable-AIG-Run-ID` per request that correlates an
 * app call with gateway usage logs. Never mint one in app code: capture the one
 * the gateway returns and resend it on follow-up calls.
 */

export const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function getLovableAiGatewayRunId(request: Request): string | undefined {
  return request.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined;
}

export interface LovableAiGatewayRunIdFetch {
  fetch: typeof fetch;
  /** Run id captured from the most recent gateway response, if any. */
  getRunId(): string | undefined;
}

export function createLovableAiGatewayRunIdFetch(
  initialRunId?: string,
): LovableAiGatewayRunIdFetch {
  let runId = initialRunId;
  const wrapped: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER))
      headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
    const response = await fetch(input as RequestInfo, { ...init, headers });
    runId = response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? runId;
    return response;
  };
  return { fetch: wrapped, getRunId: () => runId };
}

export function getLovableAiGatewayResponseHeaders(
  base?: HeadersInit,
  extra?: Record<string, string>,
): Headers {
  const headers = new Headers(base);
  for (const [key, value] of Object.entries(extra ?? {}))
    if (value) headers.set(key, value);
  return headers;
}

export function withLovableAiGatewayRunIdHeader(
  response: Response,
  runIdFetch: LovableAiGatewayRunIdFetch,
): Response {
  const runId = runIdFetch.getRunId();
  if (!runId) return response;
  const headers = new Headers(response.headers);
  headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
