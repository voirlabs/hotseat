"use client";

import { MicOff, Phone, PhoneOff } from "lucide-react";
import type { CallError } from "@/hooks/useRealtimeCall";
import type { PublicPersona } from "@/lib/personas/schema";
import { MAX_NOTES_CHARS } from "@/lib/conversation";
import { DIFFICULTIES, DIFFICULTY_HINT, type Difficulty } from "@/lib/difficulty";
import { cn, firstName } from "@/lib/utils";
import { PersonaAvatar } from "../PersonaAvatar";

export type CallStatus = "idle" | "connecting" | "listening" | "hearing" | "thinking" | "speaking";

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Ready when you are",
  connecting: "Connecting…",
  listening: "Listening…",
  hearing: "Hearing you…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

/** A steady dot: its colour says what the call is doing. */
const STATUS_DOT: Record<CallStatus, string> = {
  idle: "bg-faint",
  connecting: "bg-muted",
  listening: "bg-success",
  hearing: "bg-success",
  thinking: "bg-warning",
  speaking: "bg-accent",
};

const ERROR_TEXT: Record<CallError, string> = {
  insecure: "Microphone access needs HTTPS (or localhost).",
  unsupported: "This browser doesn't support live voice. Try a recent Chrome, Edge, Firefox or Safari.",
  denied:
    "Microphone access is blocked. Click the site icon in your address bar, allow the microphone, then try again.",
  "no-mic": "No microphone found. Plug one in and try again.",
  "signed-out": "Your sign-in has expired. Reload the page and sign in again.",
  session: "Couldn't start the voice session. Check the server logs and your OpenAI key.",
  busy: "Too many voice sessions started in the last minute. Wait a moment, then try again.",
  full: "Two voice calls are already running on this server. End the other one, or wait for it to time out.",
  connection: "The voice connection dropped. Try again.",
  autoplay: "The browser blocked the call audio. Click anywhere on the page to hear it.",
};

interface CallPanelProps {
  persona: PublicPersona;
  status: CallStatus;
  partial: string;
  error: CallError | null;
  /** A non-fatal problem during the call, like a missed turn. */
  notice: string | null;
  voiceAvailable: boolean;
  onStart: () => void;
  onEnd: () => void;
  /** The user's notes for this session, editable before a call. */
  notes: string;
  onNotesChange: (notes: string) => void;
  /** How hard the persona pushes this session; fixed once a call starts. */
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
}

export function CallPanel({ persona, status, partial, error, notice, voiceAvailable, onStart, onEnd, notes, onNotesChange, difficulty, onDifficultyChange }: CallPanelProps) {
  const inCall = status !== "idle";
  const speaking = status === "speaking";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 lg:p-6">
      <div className="panel flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-5 overflow-y-auto p-6 sm:p-8">
        <PersonaAvatar persona={persona} size="lg" speaking={speaking} />
        <div className="text-center">
          <h2 className="text-xl font-medium text-ink">{persona.name}</h2>
          <p className="mt-1 text-sm text-faint">{persona.title}</p>
        </div>
        <p
          role="status"
          className="flex min-h-7 items-center gap-2 rounded-md border border-line-2 bg-bg px-3 py-1 text-[13px] text-muted"
        >
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </p>
        {partial && (
          <p className="max-w-md text-center text-sm text-faint">&ldquo;{partial}&rdquo;</p>
        )}
        {!inCall && (
          <div className="w-full max-w-md border-t border-line pt-4 text-left">
            <p className="eyebrow mb-2">The situation</p>
            <p className="text-[15px] leading-relaxed text-ink">{persona.brief}</p>
            <fieldset className="mt-6">
              <legend className="eyebrow mb-2">Difficulty</legend>
              <div className="inline-flex rounded-[10px] border border-line-2 p-0.5" role="radiogroup">
                {DIFFICULTIES.map((d) => (
                  <label
                    key={d}
                    className={cn(
                      "cursor-pointer rounded-lg px-3 py-1.5 text-[13px] capitalize transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                      difficulty === d ? "bg-accent-strong text-ink" : "text-faint hover:text-ink",
                    )}
                  >
                    <input
                      type="radio"
                      name="difficulty"
                      value={d}
                      checked={difficulty === d}
                      onChange={() => onDifficultyChange(d)}
                      className="sr-only"
                    />
                    {d}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-faint">
                {DIFFICULTY_HINT[difficulty]}
                {difficulty === persona.difficulty && ` ${firstName(persona.name)}'s usual level.`}
              </p>
            </fieldset>
            <details className="group mt-6" open={notes.length > 0 || undefined}>
              <summary className="cursor-pointer text-[13px] font-medium text-accent transition-colors hover:text-ink">
                {notes ? "Your notes (in use)" : "Add your notes (optional)"}
              </summary>
              <label htmlFor="session-notes" className="mt-2 block text-[13px] leading-relaxed text-muted">
                Paste your deck text, one-pager or key numbers. {firstName(persona.name)} will ask about them, and the
                scorecard checks you used them. Kept in this browser only.
              </label>
              <textarea
                id="session-notes"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                maxLength={MAX_NOTES_CHARS}
                rows={5}
                placeholder="e.g. 14 paying agencies, $38k MRR, 20% month on month, 112% net revenue retention…"
                className="field thin-scrollbar mt-2 w-full resize-y px-3 py-2 text-[14px]"
              />
              <p className="mt-1 text-right text-[12px] tabular-nums text-faint">
                {notes.length.toLocaleString("en")} / {MAX_NOTES_CHARS.toLocaleString("en")}
              </p>
            </details>
          </div>
        )}
        {inCall && notes && (
          <p className="rounded-md border border-accent-border bg-accent-strong px-2 py-0.5 text-[12px] text-accent">
            Using your notes
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="flex shrink-0 items-start gap-3 rounded-[10px] border border-danger/35 bg-danger/[0.07] px-4 py-3">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-ink">{ERROR_TEXT[error]}</p>
        </div>
      )}

      {notice && !error && (
        <p
          role="status"
          className="shrink-0 rounded-[10px] border border-warning/30 bg-warning/[0.06] px-4 py-3 text-[13px] leading-relaxed text-ink"
        >
          {notice}
        </p>
      )}

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line pt-3">
        <p className="line-clamp-2 min-w-0 text-[13px] text-faint">
          {voiceAvailable
            ? inCall
              ? "Speak naturally. Interrupt any time."
              : "Start a call and talk out loud, or type in the chat."
            : "Voice calls need OPENAI_API_KEY on the server."}
        </p>
        {inCall ? (
          <button type="button" onClick={onEnd} className="btn btn-danger shrink-0">
            <PhoneOff className="h-4 w-4" aria-hidden="true" /> End call
          </button>
        ) : (
          <button type="button" onClick={onStart} disabled={!voiceAvailable} className="btn btn-primary shrink-0">
            <Phone className="h-4 w-4" aria-hidden="true" /> {error ? "Try again" : "Start call"}
          </button>
        )}
      </div>
    </div>
  );
}
