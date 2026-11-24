import { z } from "zod";
import {
  CHAT_WINDOW_CHARS,
  CHAT_WINDOW_MESSAGES,
  FEEDBACK_MAX_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_NOTES_CHARS,
  SESSION_MAX_MESSAGES,
} from "@/lib/conversation";
import { DIFFICULTIES } from "@/lib/difficulty";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

const personaId = z.string().min(1).max(64);

/** How hard the persona pushes this session; the persona's own level when absent. */
const difficulty = z.enum(DIFFICULTIES).optional();

/** The user's own material for this session. Never stored on the server. */
const notes = z
  .string()
  .trim()
  .max(MAX_NOTES_CHARS, { message: `Keep your notes under ${MAX_NOTES_CHARS.toLocaleString("en")} characters.` })
  .optional();

function conversation(maxMessages: number, maxChars: number) {
  return z
    .array(chatMessageSchema)
    .min(1)
    .max(maxMessages, { message: "This call is too long. End it and get your feedback." })
    .refine((m) => m.reduce((n, x) => n + x.content.length, 0) <= maxChars, {
      message: "This call is too long. End it and get your feedback.",
    });
}

export const chatRequestSchema = z.object({
  personaId,
  notes,
  difficulty,
  messages: conversation(CHAT_WINDOW_MESSAGES, CHAT_WINDOW_CHARS).refine((m) => m.at(-1)?.role === "user", {
    message: "Last message must be from the user",
  }),
});

export const feedbackRequestSchema = z.object({
  personaId,
  notes,
  difficulty,
  messages: conversation(SESSION_MAX_MESSAGES, FEEDBACK_MAX_CHARS).refine(
    (m) => m.some((x) => x.role === "user"),
    { message: "Say something first" },
  ),
  /** True when the browser dropped the start of a very long call. */
  truncated: z.boolean().default(false),
});

/** Starting a voice call: the browser's WebRTC offer plus what the session is built from. */
export const realtimeRequestSchema = z.object({
  personaId,
  notes,
  difficulty,
  sdp: z
    .string()
    .max(20_000)
    .refine((s) => s.startsWith("v="), { message: "Invalid SDP offer" }),
});

/** Hanging up a voice call: the id the server sent back in X-Call-Id. */
export const realtimeEndSchema = z.object({
  callId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, { message: "Invalid call id" }),
});

export const loginRequestSchema = z.object({
  password: z.string().min(1).max(256),
});
