import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Mail, RotateCcw, X } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useSiteConfig } from "@/config/SiteConfigContext";
import {
  SITE_CHAT_LIMITS,
  siteChatErrorMessage,
  toSiteChatRequestMessages,
} from "@/lib/siteChat";
import { chatHistoryKey, readChatHistory } from "@/lib/siteChatHistory";

/** Restore browser-local history; recent messages are sent when asking a question. */
function loadSaved(key: string): UIMessage[] {
  try {
    return readChatHistory(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

const messageText = (message: UIMessage) =>
  message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();

export default function SiteChatPanel({ onClose }: { onClose: () => void }) {
  const { identity } = useSiteConfig();
  const historyKey = chatHistoryKey(identity.siteUrl, identity.name);
  return (
    <SiteChatConversation
      key={historyKey}
      historyKey={historyKey}
      onClose={onClose}
    />
  );
}

function SiteChatConversation({
  onClose,
  historyKey,
}: {
  onClose: () => void;
  historyKey: string;
}) {
  const { identity, sections } = useSiteConfig();
  const initialMessages = useMemo(() => loadSaved(historyKey), [historyKey]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [operationError, setOperationError] = useState<unknown>(null);
  const [stopped, setStopped] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const generation = useRef(0);
  const submittedQuestion = useRef("");

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    regenerate,
    clearError,
  } = useChat({
    id: `site-chat-${resetCount}`,
    messages: resetCount === 0 ? initialMessages : [],
    transport: useMemo(
      () =>
        new DefaultChatTransport({
          api: "/api/chat",
          // Send only recent text turns so the request stays under the server caps.
          prepareSendMessagesRequest: ({ id, messages }) => ({
            body: { id, messages: toSiteChatRequestMessages(messages) },
          }),
        }),
      [],
    ),
  });

  const busy = status === "submitted" || status === "streaming";
  const working = busy || pending;
  async function run(action: () => Promise<void>) {
    if (pendingRef.current || busy) return;
    pendingRef.current = true;
    setPending(true);
    const current = generation.current;
    setOperationError(null);
    setStopped(false);
    clearError();
    try {
      await action();
    } catch (cause) {
      if (generation.current === current) setOperationError(cause);
    } finally {
      if (generation.current === current) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  useEffect(
    () => () => {
      generation.current += 1;
      void Promise.resolve(stop()).catch(() => {});
    },
    [stop],
  );

  useEffect(() => {
    try {
      const recent = toSiteChatRequestMessages(messages);
      if (recent.length)
        window.localStorage.setItem(
          historyKey,
          JSON.stringify({ savedAt: Date.now(), messages: recent }),
        );
      else window.localStorage.removeItem(historyKey);
    } catch {
      /* A full or blocked store only means the chat will not be restored. */
    }
  }, [messages, historyKey]);

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, resetCount]);

  const lastQuestion = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const emailHref = identity.contactEmail
    ? `mailto:${identity.contactEmail}?subject=${encodeURIComponent(
        `Question from ${identity.siteUrl.replace(/^https?:\/\//, "")}`,
      )}&body=${encodeURIComponent(
        lastQuestion ? `${messageText(lastQuestion)}\n\n` : "",
      )}`
    : "";
  const visibleError = error || operationError;

  return (
    <div
      id="site-chat-panel"
      role="dialog"
      aria-label="Website AI assistant"
      aria-modal="false"
      className="flex w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-sm border border-white/15 bg-[var(--site-surface,var(--brand-backdrop))] shadow-2xl"
      style={{
        height:
          "min(34rem, calc(100dvh - 6rem - var(--mobile-bar-space, 0px)))",
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-display text-lg leading-tight text-white">
            Find your next step
          </p>
          <p className="text-xs text-white/55">
            AI assistant · Resources, training and website help
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              generation.current += 1;
              void Promise.resolve(stop()).catch(() => {});
              pendingRef.current = false;
              setPending(false);
              setOperationError(null);
              setStopped(false);
              submittedQuestion.current = "";
              clearError();
              setMessages([]);
              setResetCount((count) => count + 1);
              try {
                window.localStorage.removeItem(historyKey);
              } catch {
                /* Nothing else depends on clearing the saved chat. */
              }
            }}
            aria-label="Start a new conversation"
            className="rounded-sm p-2 text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded-sm p-2 text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <Conversation className="flex-1 bg-transparent">
        <ConversationContent className="gap-4 px-4 py-4">
          {messages.length === 0 && (
            <div className="rounded-sm border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/75">
              <p>
                Ask me where to start, what a resource covers, or how to find
                help with a website download.
              </p>
              <p className="mt-2 text-white/55">
                For anything specific to your business, I will point you to
                email.
              </p>
            </div>
          )}
          {messages.map((message) => {
            const text = messageText(message);
            if (!text) return null;
            return (
              <Message from={message.role} key={message.id}>
                <MessageContent
                  className={
                    message.role === "user"
                      ? "bg-[var(--brand-accent)] text-[var(--brand-backdrop)]"
                      : "bg-transparent p-0 text-white/85"
                  }
                >
                  <MessageResponse>{text}</MessageResponse>
                </MessageContent>
              </Message>
            );
          })}
          {status === "submitted" && (
            <Shimmer className="text-sm text-white/70">Thinking...</Shimmer>
          )}
          {!!visibleError && (
            <p role="alert" className="text-sm text-red-200">
              {siteChatErrorMessage(visibleError)}{" "}
              {emailHref ? "You can also use the email link below." : ""}
            </p>
          )}
          {stopped && !visibleError && (
            <p role="status" className="text-sm text-white/65">
              Response stopped. Any answer shown may be incomplete.
            </p>
          )}
          {(!!visibleError || stopped) &&
            (lastQuestion || submittedQuestion.current) && (
              <button
                type="button"
                disabled={working}
                onClick={() => {
                  void run(() =>
                    lastQuestion &&
                    (!submittedQuestion.current ||
                      messageText(lastQuestion) === submittedQuestion.current)
                      ? regenerate({ messageId: lastQuestion.id })
                      : sendMessage({ text: submittedQuestion.current }),
                  );
                }}
                className="self-start rounded-sm border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
              >
                Retry last question
              </button>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-white/10 px-4 pb-3 pt-3">
        <PromptInput
          onSubmit={(message) => {
            const text = message.text.trim();
            if (!text || working || pendingRef.current) return;
            submittedQuestion.current = text;
            return run(() => sendMessage({ text }));
          }}
        >
          <PromptInputTextarea
            aria-label="Your question"
            ref={textareaRef}
            autoFocus
            disabled={working}
            maxLength={SITE_CHAT_LIMITS.maxTextChars}
            placeholder="Ask a question..."
            className="text-base"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              status={
                working
                  ? status === "streaming"
                    ? "streaming"
                    : "submitted"
                  : status
              }
              onStop={() => {
                setStopped(true);
                const current = generation.current;
                void Promise.resolve(stop()).catch((cause) => {
                  if (generation.current === current) setOperationError(cause);
                });
              }}
            />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-xs leading-relaxed text-white/55">
          Still need a person?{" "}
          {emailHref && (
            <>
              <a
                href={emailHref}
                className="inline-flex items-center gap-1 text-[var(--brand-accent-light)] underline underline-offset-4"
              >
                <Mail size={12} aria-hidden="true" /> Email {identity.name}
              </a>{" "}
              or{" "}
            </>
          )}
          <a
            href={sections.speaking ? "/speaking" : "/support"}
            className="text-[var(--brand-accent-light)] underline underline-offset-4"
          >
            {sections.speaking ? "send an event inquiry" : "get support"}
          </a>
          . History is saved in this browser. Questions are sent to our AI
          service for a reply.
        </p>
      </div>
    </div>
  );
}
