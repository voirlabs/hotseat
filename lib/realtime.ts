/**
 * Voice calls run on the OpenAI Realtime API, speech to speech: the persona
 * hears the user and answers in its own voice over one WebRTC connection.
 * This module holds the parts that don't touch the browser or the network,
 * so they can be unit tested: the session config and the event mapping.
 */

/** The session the server opens for a call (POST /v1/realtime/calls). */
export function buildRealtimeSession(opts: {
  model: string;
  instructions: string;
  voice: string;
  transcribeModel: string;
  transcribeLanguage?: string;
}) {
  return {
    type: "realtime",
    model: opts.model,
    instructions: opts.instructions,
    output_modalities: ["audio"],
    // Counts audio too (about a minute of speech). Only a backstop: the prompt keeps replies short.
    max_output_tokens: 1500,
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        // The user's words, for the chat and the scorecard.
        transcription: { model: opts.transcribeModel, language: opts.transcribeLanguage },
        // A 0.9 s pause ends the user's turn: long enough to think mid-pitch,
        // short enough that the reply starts in under two seconds. Measured
        // against semantic_vad, which waited anywhere from 1 to 10 s.
        // Talking over the persona stops it (interrupt_response).
        turn_detection: {
          type: "server_vad",
          silence_duration_ms: 900,
          prefix_padding_ms: 300,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: opts.voice },
    },
  };
}

/** What the call UI needs to know, distilled from the server's events. */
export type CallEvent =
  | { kind: "ready" }
  | { kind: "user-speaking" }
  | { kind: "user-stopped" }
  /** The user's turn was committed; its transcript follows. */
  | { kind: "user-turn"; itemId: string }
  | { kind: "user-partial"; itemId: string; delta: string }
  /** The transcript of a user turn. Empty when it was only noise. */
  | { kind: "user-final"; itemId: string; text: string }
  | { kind: "user-failed"; itemId: string }
  | { kind: "reply-started"; responseId: string }
  | { kind: "reply-partial"; responseId: string; delta: string }
  /** A reply finished. `interrupted` when the user cut in before it ended. */
  | { kind: "reply-done"; responseId: string; text: string; interrupted: boolean; failed: boolean }
  | { kind: "audio-started" }
  | { kind: "audio-stopped" }
  | { kind: "error"; message: string };

interface ServerEvent {
  type?: string;
  item_id?: string;
  response_id?: string;
  delta?: string;
  transcript?: string;
  response?: {
    id?: string;
    status?: string;
    status_details?: { error?: { message?: string } };
    output?: { content?: { type?: string; transcript?: string; text?: string }[] }[];
  };
  error?: { message?: string; code?: string };
}

/** Map one data-channel message to a call event, or null for events the UI ignores. */
export function toCallEvent(raw: string): CallEvent | null {
  let e: ServerEvent;
  try {
    e = JSON.parse(raw) as ServerEvent;
  } catch {
    return null;
  }
  switch (e.type) {
    case "session.created":
      return { kind: "ready" };
    case "input_audio_buffer.speech_started":
      return { kind: "user-speaking" };
    case "input_audio_buffer.speech_stopped":
      return { kind: "user-stopped" };
    case "input_audio_buffer.committed":
      return e.item_id ? { kind: "user-turn", itemId: e.item_id } : null;
    case "conversation.item.input_audio_transcription.delta":
      return e.item_id && e.delta ? { kind: "user-partial", itemId: e.item_id, delta: e.delta } : null;
    case "conversation.item.input_audio_transcription.completed":
      return e.item_id ? { kind: "user-final", itemId: e.item_id, text: e.transcript?.trim() ?? "" } : null;
    case "conversation.item.input_audio_transcription.failed":
      return e.item_id ? { kind: "user-failed", itemId: e.item_id } : null;
    case "response.created":
      return e.response?.id ? { kind: "reply-started", responseId: e.response.id } : null;
    case "response.output_audio_transcript.delta":
      return e.response_id && e.delta ? { kind: "reply-partial", responseId: e.response_id, delta: e.delta } : null;
    case "response.done": {
      const r = e.response;
      if (!r?.id) return null;
      const text = (r.output ?? [])
        .flatMap((item) => item.content ?? [])
        .map((c) => c.transcript ?? c.text ?? "")
        .join(" ")
        .trim();
      return {
        kind: "reply-done",
        responseId: r.id,
        text,
        interrupted: r.status === "cancelled",
        failed: r.status === "failed",
      };
    }
    case "output_audio_buffer.started":
      return { kind: "audio-started" };
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      return { kind: "audio-stopped" };
    case "error":
      // Cancelling or clearing a reply that already finished is harmless.
      if (e.error?.code === "response_cancel_not_active" || e.error?.code === "output_audio_buffer_not_active") return null;
      return { kind: "error", message: e.error?.message ?? "Unknown error" };
    default:
      return null;
  }
}

/**
 * Client events that replay an earlier conversation into a new call, so a
 * call started after some typed messages carries on where the chat left off.
 */
export function historyEvents(messages: { role: "user" | "assistant"; content: string }[]) {
  return messages.map((m) => ({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: m.role,
      content: [{ type: m.role === "user" ? "input_text" : "output_text", text: m.content }],
    },
  }));
}

/**
 * Client events that send a typed message into a live call and ask for a
 * spoken reply. Typing cuts in like speaking does: any reply still playing is
 * cancelled and its audio cleared first.
 */
export function textTurnEvents(text: string) {
  return [
    { type: "response.cancel" },
    { type: "output_audio_buffer.clear" },
    ...historyEvents([{ role: "user", content: text }]),
    { type: "response.create" },
  ];
}

/** Ask the persona to open the call with its scripted first line. */
export function openerEvent(opener: string) {
  return {
    type: "response.create",
    response: { instructions: `Open the call by saying exactly this, in character, and nothing else: "${opener}"` },
  };
}
