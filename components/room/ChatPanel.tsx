"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { ConversationMessage } from "@/hooks/useConversation";
import { MAX_MESSAGE_CHARS } from "@/lib/conversation";
import type { PublicPersona } from "@/lib/personas/schema";
import { cn, firstName } from "@/lib/utils";
import { PersonaAvatar } from "../PersonaAvatar";

interface ChatPanelProps {
  persona: PublicPersona;
  messages: ConversationMessage[];
  streaming: string | null;
  /** True while a reply blocks sending the next message. */
  busy: boolean;
  error: string | null;
  /** Why the input is disabled, or null when the user can type. */
  disabledReason: string | null;
  onSend: (text: string) => void;
}

function TypingDots() {
  return (
    <span className="flex h-5 items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

const bubble = "whitespace-pre-wrap rounded-2xl border px-4 py-2 text-[15px] leading-6";
const theirs = "rounded-tl-md border-line-2 bg-card text-ink";
const mine = "rounded-tr-md border-accent-border bg-accent-strong text-ink";

export function ChatPanel({ persona, messages, streaming, busy, error, disabledReason, onSend }: ChatPanelProps) {
  const disabled = disabledReason !== null;
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. Setting scrollTop only moves this panel,
  // never the page, and doesn't animate on every streamed chunk.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, streaming, error]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || disabled) return;
    setInput("");
    onSend(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={streaming !== null}
        aria-label={`Conversation with ${persona.name}`}
        className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            {m.role === "assistant" && <PersonaAvatar persona={persona} size="sm" />}
            <div className={cn("flex max-w-[85%] flex-col gap-1", m.role === "user" && "items-end")}>
              <span className="sr-only">{m.role === "user" ? "You" : persona.name}:</span>
              <div className={cn(bubble, m.role === "assistant" ? theirs : mine)}>
                {m.pending && !m.content ? (
                  <>
                    <TypingDots />
                    <span className="sr-only">{m.role === "user" ? "Transcribing" : "Replying"}</span>
                  </>
                ) : (
                  m.content
                )}
              </div>
              {(m.via === "voice" || m.interrupted) && (
                <span className="flex items-center gap-2 px-1 text-[12px] text-faint">
                  {m.via === "voice" && <span>Voice</span>}
                  {m.via === "voice" && m.interrupted && <span aria-hidden="true">·</span>}
                  {m.interrupted && <span>You cut in</span>}
                </span>
              )}
            </div>
          </div>
        ))}

        {streaming !== null && (
          // Hidden from screen readers while streaming; the finished message is announced once.
          <div className="flex gap-3" aria-hidden="true">
            <PersonaAvatar persona={persona} size="sm" />
            <div className={cn(bubble, theirs, "max-w-[85%]")}>{streaming || <TypingDots />}</div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-[10px] border border-danger/35 bg-danger/[0.07] px-4 py-3 text-[13px] text-ink">
            {error}
          </p>
        )}
      </div>

      <form
        className="shrink-0 border-t border-line p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message {persona.name}
          </label>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={disabledReason ?? `Message ${firstName(persona.name)}…`}
            rows={1}
            maxLength={MAX_MESSAGE_CHARS}
            disabled={disabled}
            aria-describedby="chat-hint"
            className="field thin-scrollbar field-sizing-content max-h-32 min-h-11 flex-1 resize-none px-4 py-2.5 leading-6"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy || disabled}
            aria-label="Send"
            className="btn btn-primary h-11 w-11 shrink-0 p-0"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p id="chat-hint" className="mt-2 hidden text-center text-[12px] text-faint sm:block">
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
