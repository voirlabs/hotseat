import type { NextRequest } from "next/server";
import { getPersona } from "@/lib/personas";
import { buildPersonaSystemPrompt } from "@/lib/prompt";
import { chatRequestSchema } from "@/lib/schemas";
import { guard, jsonError, parseJson, providerErrorResponse } from "@/lib/server/api";
import { streamChat } from "@/lib/server/llm";

/**
 * Up to 32,000 characters of messages and notes (CHAT_WINDOW_CHARS plus
 * MAX_NOTES_CHARS), up to 4 bytes each in UTF-8, plus JSON overhead.
 */
const MAX_BODY_BYTES = 140_000;

export async function POST(req: NextRequest) {
  const { config, reject } = await guard(req, { bucket: "api" });
  if (reject) return reject;
  if (!config.openai) return jsonError(503, "OPENAI_API_KEY is not set on the server.");

  const { data, error } = await parseJson(req, chatRequestSchema, MAX_BODY_BYTES);
  if (error) return error;

  const persona = getPersona(data.personaId);
  if (!persona) return jsonError(404, "Persona not found");

  let stream: AsyncGenerator<string>;
  try {
    stream = await streamChat(config.openai, {
      system: buildPersonaSystemPrompt(persona, "chat", { notes: data.notes, difficulty: data.difficulty }),
      messages: data.messages,
      maxTokens: 300,
      temperature: 0.8,
      // Replies are short and conversational; thinking first only adds delay.
      reasoning: "none",
      signal: req.signal,
    });
  } catch (err) {
    return providerErrorResponse(err, "chat");
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await stream.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        if (!req.signal.aborted) console.error("[chat] stream error", err);
        controller.error(err);
      }
    },
    async cancel() {
      await stream.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
