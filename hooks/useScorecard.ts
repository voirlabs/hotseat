"use client";

import { useCallback, useRef, useState } from "react";
import type { ConversationMessage } from "@/hooks/useConversation";
import { FEEDBACK_MAX_CHARS, lastMessages, SESSION_MAX_MESSAGES } from "@/lib/conversation";
import { postJson } from "@/lib/http";
import { readHistory, recordHistory } from "@/hooks/useHistory";
import { forPersona, type HistoryEntry } from "@/lib/history";
import type { Difficulty } from "@/lib/difficulty";
import type { Scorecard } from "@/lib/scorecard";

export type ScorecardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `previous` is your last scorecard with this persona, for the trend. */
  | { status: "done"; scorecard: Scorecard; previous: HistoryEntry | null };

/**
 * Requests and keeps the scorecard for a conversation. The result belongs to
 * the exact messages it was generated from, so it disappears as soon as the
 * conversation moves on.
 */
export function useScorecard(
  personaId: string,
  messages: ConversationMessage[],
  notes = "",
  difficulty?: Difficulty,
) {
  const [result, setResult] = useState<{ state: ScorecardState; forMessages: ConversationMessage[] } | null>(null);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(0);

  /** Score `latest`, or the rendered messages. Pass `latest` when the conversation changed this tick. */
  const request = useCallback(async (latest?: ConversationMessage[]) => {
    const id = ++requestRef.current;
    const forMessages = latest ?? messages;
    const update = (state: ScorecardState) => {
      if (requestRef.current === id) setResult({ state, forMessages });
    };

    setOpen(true);
    update({ status: "loading" });
    // A spoken turn still waiting for its transcript has nothing to judge yet.
    const said = forMessages.filter((m) => !m.pending);
    const sent = lastMessages(said, SESSION_MAX_MESSAGES, FEEDBACK_MAX_CHARS);
    try {
      const res = await postJson("/api/feedback", {
        personaId,
        notes: notes || undefined,
        difficulty,
        messages: sent.map(({ role, content }) => ({ role, content })),
        truncated: sent.length < said.length,
      });
      const body = (await res.json()) as { scorecard?: Scorecard };
      if (!body.scorecard) throw new Error("Couldn't generate feedback.");
      // Keep it in this browser's history, and remember the session before it.
      const previous = forPersona(readHistory(), personaId)[0] ?? null;
      if (requestRef.current === id) {
        recordHistory({
          at: Date.now(),
          personaId,
          overall: body.scorecard.overall,
          categories: body.scorecard.categories.map(({ name, score }) => ({ name, score })),
        });
      }
      update({ status: "done", scorecard: body.scorecard, previous });
    } catch (err) {
      update({ status: "error", message: err instanceof Error ? err.message : "Couldn't generate feedback." });
    }
  }, [messages, notes, personaId, difficulty]);

  const state = result && result.forMessages === messages ? result.state : null;

  return {
    state,
    open: open && state !== null,
    request,
    show: useCallback(() => setOpen(true), []),
    close: useCallback(() => setOpen(false), []),
  };
}
