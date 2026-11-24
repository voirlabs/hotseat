import { describe, expect, it } from "vitest";
import { getPersona } from "@/lib/personas";
import { buildPersonaSystemPrompt } from "@/lib/prompt";
import { buildRealtimeSession, historyEvents, openerEvent, textTurnEvents, toCallEvent } from "@/lib/realtime";

const ev = (o: object) => toCallEvent(JSON.stringify(o));

describe("buildRealtimeSession", () => {
  it("opens a speech-to-speech session that leaves room to pause mid-answer", () => {
    const session = buildRealtimeSession({
      model: "gpt-realtime-2.1-mini",
      instructions: "Be Morgan.",
      voice: "cedar",
      transcribeModel: "gpt-4o-transcribe",
      transcribeLanguage: "en",
    });
    expect(session).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1-mini",
      instructions: "Be Morgan.",
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: { model: "gpt-4o-transcribe", language: "en" },
          turn_detection: { type: "server_vad", silence_duration_ms: 900, interrupt_response: true, create_response: true },
        },
        output: { voice: "cedar" },
      },
    });
  });
});

describe("toCallEvent", () => {
  it("maps the user's side of a turn", () => {
    expect(ev({ type: "input_audio_buffer.speech_started" })).toEqual({ kind: "user-speaking" });
    expect(ev({ type: "input_audio_buffer.committed", item_id: "u1" })).toEqual({ kind: "user-turn", itemId: "u1" });
    expect(ev({ type: "conversation.item.input_audio_transcription.delta", item_id: "u1", delta: "We " })).toEqual({
      kind: "user-partial",
      itemId: "u1",
      delta: "We ",
    });
    expect(ev({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: " We sell. " })).toEqual({
      kind: "user-final",
      itemId: "u1",
      text: "We sell.",
    });
  });

  it("reads the spoken reply's transcript and whether the user cut in", () => {
    const done = (status: string) =>
      ev({
        type: "response.done",
        response: { id: "r1", status, output: [{ content: [{ type: "output_audio", transcript: "Why now?" }] }] },
      });
    expect(done("completed")).toEqual({ kind: "reply-done", responseId: "r1", text: "Why now?", interrupted: false, failed: false });
    expect(done("cancelled")).toMatchObject({ interrupted: true });
    expect(done("failed")).toMatchObject({ failed: true });
  });

  it("ignores noise: unknown events, bad JSON and harmless cancel errors", () => {
    expect(ev({ type: "rate_limits.updated" })).toBeNull();
    expect(toCallEvent("not json")).toBeNull();
    expect(ev({ type: "error", error: { code: "response_cancel_not_active", message: "x" } })).toBeNull();
    expect(ev({ type: "error", error: { code: "output_audio_buffer_not_active", message: "x" } })).toBeNull();
    expect(ev({ type: "error", error: { message: "Bad" } })).toEqual({ kind: "error", message: "Bad" });
  });
});

describe("client events", () => {
  it("replays history with the right content types", () => {
    const [user, assistant] = historyEvents([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Why now?" },
    ]);
    expect(user).toMatchObject({ item: { role: "user", content: [{ type: "input_text", text: "Hi" }] } });
    expect(assistant).toMatchObject({ item: { role: "assistant", content: [{ type: "output_text", text: "Why now?" }] } });
  });

  it("asks for a spoken reply after a typed message, and scripts the opener", () => {
    const events = textTurnEvents("Hello");
    expect(events.slice(0, 2)).toEqual([{ type: "response.cancel" }, { type: "output_audio_buffer.clear" }]);
    expect(events.at(-1)).toEqual({ type: "response.create" });
    expect(openerEvent("You've got ten minutes.").response.instructions).toContain('"You\'ve got ten minutes."');
  });
});

describe("call instructions", () => {
  it("adds spoken-call guidance and the persona's voice notes only in call mode", () => {
    const persona = getPersona("seed-skeptic")!;
    const call = buildPersonaSystemPrompt(persona, "call");
    const chat = buildPersonaSystemPrompt(persona, "chat");
    expect(call).toContain("live voice call");
    expect(call).toContain(persona.voice.instructions!);
    expect(chat).not.toContain("live voice call");
    expect(chat).not.toContain("\n\n\n");
  });
});
