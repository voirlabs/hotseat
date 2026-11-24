"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHAT_WINDOW_CHARS,
  CHAT_WINDOW_MESSAGES,
  lastMessages,
  SESSION_MAX_MESSAGES,
  SESSION_WARN_MESSAGES,
} from "@/lib/conversation";
import { postJson } from "@/lib/http";
import type { Difficulty } from "@/lib/difficulty";
import type { ChatMessage } from "@/lib/schemas";

export interface ConversationMessage extends ChatMessage {
  id: string;
  via: "text" | "voice";
  at: number;
  /** The user talked over this reply before it finished playing. */
  interrupted?: boolean;
  /** A spoken turn whose transcript hasn't arrived yet. */
  pending?: boolean;
  /** How long the user spoke for this turn, measured during the call. */
  durationMs?: number;
}

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Id of the persona's opening line, the first message of every conversation. */
export const OPENER_ID = "opener";

const openingMessages = (opener: string): ConversationMessage[] => [
  { id: OPENER_ID, role: "assistant", content: opener, via: "text", at: Date.now() },
];

export const LIMIT_REACHED = "This call has reached its length limit. End it and get your feedback.";

/**
 * The conversation, shared by the text chat and the voice call. Sending a new
 * message aborts any reply that is still streaming, so overlapping speech
 * never produces two answers. `notes` are the user's own material for this
 * session, sent with every message.
 */
export function useConversation(personaId: string, opener: string, notes = "", difficulty?: Difficulty) {
  const [messages, setMessages] = useState<ConversationMessage[]>(() => openingMessages(opener));
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  const notesRef = useRef(notes);
  const difficultyRef = useRef(difficulty);
  useEffect(() => {
    notesRef.current = notes;
    difficultyRef.current = difficulty;
  }, [notes, difficulty]);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: ConversationMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(null);
  }, []);

  /** Send a user message. Resolves with the persona's reply, or null. */
  const send = useCallback(
    async (text: string, via: ConversationMessage["via"]): Promise<ConversationMessage | null> => {
      const content = text.trim();
      if (!content) return null;
      // Leave room for the user's message and the reply.
      if (messagesRef.current.length + 2 > SESSION_MAX_MESSAGES) {
        setError(LIMIT_REACHED);
        return null;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);

      const history = [...messagesRef.current, { id: nextId(), role: "user" as const, content, via, at: Date.now() }];
      commit(history);
      setStreaming("");
      const isCurrent = () => abortRef.current === controller;

      try {
        const res = await postJson(
          "/api/chat",
          {
            personaId,
            notes: notesRef.current || undefined,
            difficulty: difficultyRef.current,
            messages: lastMessages(
              history.filter((m) => !m.pending),
              CHAT_WINDOW_MESSAGES,
              CHAT_WINDOW_CHARS,
            ).map(({ role, content }) => ({
              role,
              content,
            })),
          },
          controller.signal,
        );
        if (!res.body) throw new Error("The server sent an empty response.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let reply = "";
        let cut = false;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            reply += decoder.decode(value, { stream: true });
            if (isCurrent()) setStreaming(reply);
          }
        } catch (err) {
          if (controller.signal.aborted || !reply.trim()) throw new Error("The connection dropped. Try again.", { cause: err });
          // The connection broke mid-reply: keep what arrived, marked as cut.
          cut = true;
        }

        if (!isCurrent()) return null;
        abortRef.current = null;
        setStreaming(null);
        reply = reply.trim();
        if (!reply) {
          setError("The model sent an empty reply. Try again, or check OPENAI_MODEL.");
          return null;
        }
        const message: ConversationMessage = {
          id: nextId(),
          role: "assistant",
          content: reply,
          via,
          at: Date.now(),
          ...(cut ? { interrupted: true } : {}),
        };
        commit([...messagesRef.current, message]);
        if (cut) setError("The reply was cut off. Try again.");
        return message;
      } catch (err) {
        if (controller.signal.aborted) return null;
        // Only send() replaces the controller, and it aborts the old one first,
        // so a call that wasn't aborted is still the current one.
        abortRef.current = null;
        setStreaming(null);
        setError(err instanceof Error ? err.message : "Something went wrong.");
        return null;
      }
    },
    [personaId, commit],
  );

  /** Add a message from a voice call. Returns false when the session is full. */
  const add = useCallback(
    (message: Omit<ConversationMessage, "id" | "at"> & { id?: string }): boolean => {
      if (messagesRef.current.length >= SESSION_MAX_MESSAGES) {
        setError(LIMIT_REACHED);
        return false;
      }
      commit([...messagesRef.current, { id: nextId(), at: Date.now(), ...message }]);
      return true;
    },
    [commit],
  );

  const update = useCallback(
    (id: string, patch: Partial<ConversationMessage>) => {
      commit(messagesRef.current.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      commit(messagesRef.current.filter((m) => m.id !== id));
    },
    [commit],
  );

  const reset = useCallback(() => {
    abort();
    setError(null);
    commit(openingMessages(opener));
  }, [abort, commit, opener]);

  /** The messages right now, including changes not yet rendered. */
  const snapshot = useCallback(() => messagesRef.current, []);

  return {
    messages,
    snapshot,
    streaming,
    busy: streaming !== null,
    error,
    send,
    abort,
    add,
    update,
    remove,
    reset,
    userTurns: messages.filter((m) => m.role === "user" && !m.pending).length,
    nearLimit: messages.length >= SESSION_MAX_MESSAGES - SESSION_WARN_MESSAGES,
    atLimit: messages.length + 2 > SESSION_MAX_MESSAGES,
  };
}
