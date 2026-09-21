import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";
import { buildSystemPrompt, loadProductContext } from "@/lib/siteChat.server";
import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

/** Visitor chats are short by design; this bounds prompt cost and abuse. */
const MAX_MESSAGES = 24;
const MAX_TEXT = 2000;

function sanitize(messages: UIMessage[]): UIMessage[] {
  return messages.slice(-MAX_MESSAGES).map((message) => ({
    ...message,
    parts: (message.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) =>
        part.type === "text"
          ? { ...part, text: String(part.text).slice(0, MAX_TEXT) }
          : part,
      ),
  }));
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { messages?: unknown };
        try {
          body = (await request.json()) as { messages?: unknown };
        } catch {
          return new Response("Invalid request", { status: 400 });
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return new Response("The assistant is not configured", {
            status: 503,
          });
        }

        const messages = sanitize(body.messages as UIMessage[]);
        const system = buildSystemPrompt(await loadProductContext());

        const initialRunId = getLovableAiGatewayRunId(request);
        const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: key,
          headers: {
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "vercel-ai-sdk",
          },
          fetch: runIdFetch.fetch,
        });

        const result = streamText({
          model: lovable.responses("openai/gpt-6-astra"),
          system,
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        return withLovableAiGatewayRunIdHeader(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            headers: getLovableAiGatewayResponseHeaders(undefined, {
              ...(initialRunId
                ? { "X-Lovable-AIG-Run-ID": initialRunId }
                : {}),
            }),
          }),
          runIdFetch,
        );
      },
    },
  },
});
