"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Phone } from "lucide-react";
import { LIMIT_REACHED, OPENER_ID, useConversation } from "@/hooks/useConversation";
import { useRealtimeCall } from "@/hooks/useRealtimeCall";
import { useNotes } from "@/hooks/useNotes";
import { useScorecard } from "@/hooks/useScorecard";
import { CHAT_WINDOW_CHARS, CHAT_WINDOW_MESSAGES, MAX_MESSAGE_CHARS, lastMessages } from "@/lib/conversation";
import type { PublicPersona } from "@/lib/personas/schema";
import { measureDelivery } from "@/lib/delivery";
import type { Difficulty } from "@/lib/difficulty";
import type { CallEvent } from "@/lib/realtime";
import { APP_NAME } from "@/lib/site";
import { transcriptMarkdown } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import { SetupNotice } from "../SetupNotice";
import { CallPanel, type CallStatus } from "./CallPanel";
import { ChatPanel } from "./ChatPanel";
import { RoomHeader } from "./RoomHeader";
import { ScorecardDialog } from "./ScorecardDialog";

const MIN_TURNS_FOR_FEEDBACK = 2;
const MISSED_TURN = "Didn't catch that. Try saying it again.";
/** A spoken turn whose transcript never arrives is dropped after this long. */
const TRANSCRIPT_TIMEOUT_MS = 15_000;
/** "Thinking…" falls back to "Listening…" if no reply starts in this long. */
const REPLY_TIMEOUT_MS = 10_000;

type CallPhase = Exclude<CallStatus, "idle" | "connecting">;

/** A spoken turn longer than one message allows is cut, so the chat and scorecard still accept it. */
const fitTurn = (text: string) =>
  text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS - 1).trimEnd()}…` : text;

export function Room({
  persona,
  configured,
  callMaxMinutes,
}: {
  persona: PublicPersona;
  configured: boolean;
  callMaxMinutes: number;
}) {
  const [notes, setNotes] = useNotes(persona.id);
  const [difficulty, setDifficulty] = useState<Difficulty>(persona.difficulty);
  const convo = useConversation(persona.id, persona.opener, notes, difficulty);
  const scorecard = useScorecard(persona.id, convo.messages, notes, difficulty);

  const [phase, setPhase] = useState<CallPhase>("listening");
  const [partial, setPartial] = useState("");
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"call" | "chat">("call");
  /** Messages already seen in the chat tab on small screens, for the "new" badge. */
  const [seenMessages, setSeenMessages] = useState(1);

  /** The response that speaks the opener: "pending" until the server names it. */
  const openerRef = useRef<string | null>(null);
  /** Ends the call from inside call events; set once endCall exists. */
  const endCallRef = useRef<() => void>(() => {});
  /** When the user started speaking, and how long their last stretch of speech lasted. */
  const speechStartRef = useRef<number | null>(null);
  const lastSpeechMsRef = useRef<number | undefined>(undefined);
  const { add, update, remove, snapshot } = convo;

  const handleEvent = useCallback(
    (e: CallEvent) => {
      switch (e.kind) {
        case "user-speaking":
          speechStartRef.current = performance.now();
          setPhase("hearing");
          setCallNotice(null);
          break;
        case "user-stopped":
          // The pause that ends the turn isn't speech, so it isn't counted.
          lastSpeechMsRef.current =
            speechStartRef.current === null ? undefined : performance.now() - speechStartRef.current;
          speechStartRef.current = null;
          setPhase("thinking");
          break;
        case "user-turn":
          // A placeholder keeps the user's words in order; the transcript fills it in.
          // A full session can't take another turn: end the call so the user can get feedback.
          if (
            !add({ id: e.itemId, role: "user", content: "", via: "voice", pending: true, durationMs: lastSpeechMsRef.current })
          ) {
            endCallRef.current();
          }
          lastSpeechMsRef.current = undefined;
          setPartial("");
          setTimeout(() => {
            if (!snapshot().some((m) => m.id === e.itemId && m.pending)) return;
            remove(e.itemId);
            setCallNotice(MISSED_TURN);
          }, TRANSCRIPT_TIMEOUT_MS);
          break;
        case "user-partial":
          setPartial((p) => p + e.delta);
          break;
        case "user-final": {
          setPartial("");
          if (!e.text) {
            remove(e.itemId);
            break;
          }
          // Two spoken turns in a row (the persona never got a word in) are one answer.
          const all = snapshot();
          const at = all.findIndex((m) => m.id === e.itemId);
          const before = all[at - 1];
          // Only while the joined answer still fits in one message.
          const joined = before ? `${before.content} ${e.text}` : "";
          if (
            at > 0 &&
            before?.role === "user" &&
            before.via === "voice" &&
            !before.pending &&
            joined.length <= MAX_MESSAGE_CHARS
          ) {
            const durationMs = (before.durationMs ?? 0) + (all[at]?.durationMs ?? 0) || undefined;
            update(before.id, { content: joined, durationMs });
            remove(e.itemId);
          } else {
            update(e.itemId, { content: fitTurn(e.text), pending: false });
          }
          break;
        }
        case "user-failed":
          setPartial("");
          remove(e.itemId);
          setCallNotice(MISSED_TURN);
          break;
        case "reply-started":
          setPhase((p) => (p === "speaking" ? p : "thinking"));
          if (openerRef.current === "pending") openerRef.current = e.responseId;
          // Like the user's turns, the reply takes its place in the chat now and fills in as it's spoken.
          else if (!add({ id: e.responseId, role: "assistant", content: "", via: "voice", pending: true })) endCallRef.current();
          break;
        case "reply-partial":
          if (e.responseId !== openerRef.current) {
            const reply = snapshot().find((m) => m.id === e.responseId);
            if (reply?.pending) update(e.responseId, { content: reply.content + e.delta });
          }
          break;
        case "reply-done":
          setPhase((p) => (p === "thinking" ? "listening" : p));
          if (e.responseId === openerRef.current) {
            // The opener is already the first message; just note how it went.
            openerRef.current = null;
            update(OPENER_ID, { via: "voice", interrupted: e.interrupted || undefined });
          } else if (e.text) {
            update(e.responseId, { content: fitTurn(e.text), pending: false, interrupted: e.interrupted || undefined });
          } else {
            remove(e.responseId);
            if (e.failed) setCallNotice(`${persona.name} couldn't answer that. Try saying it again.`);
          }
          break;
        case "audio-started":
          setPhase("speaking");
          break;
        case "audio-stopped":
          setPhase((p) => (p === "speaking" ? "listening" : p));
          break;
        case "error":
          setCallNotice(`The voice service reported an error: ${e.message}`);
          break;
      }
    },
    [add, update, remove, snapshot, persona.name],
  );

  const call = useRealtimeCall(persona.id, handleEvent);
  const inCall = call.connection !== "idle";

  const startCall = useCallback(() => {
    setPhase("listening");
    setPartial("");
    setCallNotice(null);
    convo.abort();
    // A fresh call opens with the persona's first line; otherwise the call
    // picks up the conversation so far.
    const fresh = convo.userTurns === 0;
    openerRef.current = fresh ? "pending" : null;
    const said = convo.messages.filter((m) => !m.pending);
    void call.start({
      history: fresh
        ? []
        : lastMessages(said, CHAT_WINDOW_MESSAGES, CHAT_WINDOW_CHARS).map(({ role, content }) => ({ role, content })),
      opener: fresh ? persona.opener : undefined,
      notes,
      difficulty,
    });
  }, [call, convo, difficulty, notes, persona.opener]);

  /**
   * When a call ends, by hanging up or a dropped connection: a reply cut off
   * stays in the chat, marked as cut; turns still waiting for a transcript
   * can't get one now.
   */
  const settleCall = useCallback(() => {
    for (const m of snapshot()) {
      if (!m.pending) continue;
      if (m.role === "assistant" && m.content.trim()) update(m.id, { pending: false, interrupted: true });
      else remove(m.id);
    }
    openerRef.current = null;
    setPartial("");
    setPhase("listening");
  }, [remove, snapshot, update]);

  const endCall = useCallback(() => {
    call.stop();
    settleCall();
  }, [call, settleCall]);

  // A call that drops on its own is settled the same way.
  const wasInCallRef = useRef(false);
  useEffect(() => {
    if (call.connection !== "idle") {
      wasInCallRef.current = true;
    } else if (wasInCallRef.current) {
      wasInCallRef.current = false;
      settleCall();
    }
  }, [call.connection, settleCall]);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  // Bound the cost of a single session.
  useEffect(() => {
    if (call.connection !== "live") return;
    const timer = setTimeout(
      () => {
        endCall();
        setCallNotice(`Calls end after ${callMaxMinutes} minutes on this server. Start another to keep going.`);
      },
      callMaxMinutes * 60_000,
    );
    return () => clearTimeout(timer);
    // Only (re)arm when a call goes live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.connection, callMaxMinutes]);

  // Never sit on "Thinking…" if the reply never comes.
  useEffect(() => {
    if (!inCall || phase !== "thinking") return;
    const timer = setTimeout(() => setPhase("listening"), REPLY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [inCall, phase]);

  const callStatus: CallStatus =
    call.connection === "idle" ? "idle" : call.connection === "connecting" ? "connecting" : phase;

  const sendText = useCallback(
    (text: string) => {
      if (call.connection === "live") {
        if (add({ role: "user", content: text, via: "text" }) && !call.sendText(text)) {
          setCallNotice("The call isn't connected. Your message is in the chat; end the call to keep typing.");
        }
        return;
      }
      void convo.send(text, "text");
    },
    [add, call, convo],
  );

  const requestFeedback = useCallback(() => {
    endCall();
    convo.abort();
    // Hanging up can add the reply that was cut off, so score what's there now.
    void scorecard.request(convo.snapshot());
  }, [convo, endCall, scorecard]);

  const newCall = useCallback(() => {
    endCall();
    convo.reset();
  }, [convo, endCall]);

  const downloadTranscript = useCallback(() => {
    const said = convo.messages.filter((m) => !m.pending);
    const md = transcriptMarkdown(
      persona,
      said,
      scorecard.state?.status === "done" ? scorecard.state.scorecard : undefined,
      measureDelivery(said),
    );
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${APP_NAME.toLowerCase().replace(/\W+/g, "-")}-${persona.id}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [convo.messages, persona, scorecard.state]);

  const unseen = Math.max(0, convo.messages.length - seenMessages);

  const feedbackBlocked = !configured
    ? "Set OPENAI_API_KEY first"
    : convo.busy
      ? "Wait for the reply"
      : convo.userTurns < MIN_TURNS_FOR_FEEDBACK
        ? `Answer at least ${MIN_TURNS_FOR_FEEDBACK} questions first`
        : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <RoomHeader
        persona={persona}
        difficulty={difficulty}
        hasScorecard={scorecard.state?.status === "done"}
        feedbackBlocked={feedbackBlocked}
        onFeedback={requestFeedback}
        onViewScorecard={scorecard.show}
      />

      {!configured && (
        <div className="shrink-0 px-4 pt-4 md:px-6">
          <SetupNotice />
        </div>
      )}
      {configured && convo.nearLimit && (
        <p role="status" className="shrink-0 border-b border-warning/20 bg-warning/[0.06] px-4 py-2 text-center text-[13px] text-ink">
          {convo.atLimit ? LIMIT_REACHED : "This call is close to its length limit. Wrap up and get your feedback."}
        </p>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section
          id="panel-call"
          aria-label="Voice call"
          className={cn("min-w-0 flex-1", mobileTab === "chat" ? "hidden md:block" : "block")}
        >
          <CallPanel
            persona={persona}
            status={callStatus}
            partial={inCall ? partial : ""}
            error={call.error}
            // On small screens the chat isn't visible during a call.
            notice={callNotice ?? (inCall ? convo.error : null)}
            voiceAvailable={configured}
            onStart={startCall}
            onEnd={endCall}
            notes={notes}
            onNotesChange={setNotes}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
          />
        </section>
        <section
          id="panel-chat"
          aria-label="Chat"
          className={cn(
            "w-full border-line bg-surface md:w-[400px] md:shrink-0 md:border-l",
            mobileTab === "call" ? "hidden md:block" : "block",
          )}
        >
          <ChatPanel
            persona={persona}
            messages={convo.messages}
            streaming={convo.streaming}
            // In a call, typing cuts in like speaking does; only a typed reply blocks the next message.
            busy={convo.busy}
            error={convo.error}
            disabledReason={
              !configured
                ? "Chat needs OPENAI_API_KEY"
                : convo.atLimit
                  ? "This call is full"
                  : call.connection === "connecting"
                    ? "Connecting the call…"
                    : null
            }
            onSend={sendText}
          />
        </section>
      </div>

      <nav aria-label="Room view" className="flex shrink-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
        {(
          [
            { id: "call", label: "Voice call", icon: Phone },
            { id: "chat", label: "Chat", icon: MessageSquare },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === "call") setSeenMessages(convo.messages.length);
              setMobileTab(id);
            }}
            aria-pressed={mobileTab === id}
            aria-controls={`panel-${id}`}
            className={cn(
              "flex h-12 flex-1 items-center justify-center gap-2 text-[13px] transition-colors",
              mobileTab === id ? "-mt-px border-t-2 border-accent text-ink" : "text-faint",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            {id === "chat" && mobileTab === "call" && unseen > 0 && (
              <span className="rounded-md bg-accent px-1.5 text-[12px] font-medium tabular-nums text-bg">
                {unseen}
                <span className="sr-only"> new</span>
              </span>
            )}
          </button>
        ))}
      </nav>

      {scorecard.open && scorecard.state && (
        <ScorecardDialog
          persona={persona}
          state={scorecard.state}
          delivery={measureDelivery(convo.messages.filter((m) => !m.pending))}
          onClose={scorecard.close}
          onRetry={requestFeedback}
          onDownload={downloadTranscript}
          onNewCall={newCall}
        />
      )}
    </div>
  );
}
