import type { NextRequest } from "next/server";
import { getPersona } from "@/lib/personas";
import { buildPersonaSystemPrompt } from "@/lib/prompt";
import { buildRealtimeSession } from "@/lib/realtime";
import { realtimeEndSchema, realtimeRequestSchema } from "@/lib/schemas";
import { guard, jsonError, parseJson } from "@/lib/server/api";
import { callIdFromLocation, callRegistry, HANGUP_GRACE_MS, hangUpCall, MAX_ACTIVE_CALLS } from "@/lib/server/calls";

/** An SDP offer (~20 KB at most) plus the user's notes (8,000 characters, up to 4 bytes each in UTF-8). */
const MAX_BODY_BYTES = 64_000;

/**
 * Starts a voice call. The browser sends its WebRTC offer here as JSON with
 * the persona id and any notes; we open an OpenAI Realtime session for that persona with the
 * server-side key and return OpenAI's answer, so the key, model, voice and
 * instructions never come from or reach the client. Audio then flows directly
 * between the browser and OpenAI, with events on the "oai-events" channel.
 *
 * The server caps how many calls run at once and hangs each one up after
 * CALL_MAX_MINUTES (see lib/server/calls.ts). The call id goes back to the
 * browser in X-Call-Id so it can report hanging up (DELETE below).
 */
export async function POST(req: NextRequest) {
  const { config, reject } = await guard(req, { bucket: "realtime" });
  if (reject) return reject;
  if (!config.openai) return jsonError(503, "OPENAI_API_KEY is not set on the server.");

  const { data, error } = await parseJson(req, realtimeRequestSchema, MAX_BODY_BYTES);
  if (error) return error;

  const persona = getPersona(data.personaId);
  if (!persona) return jsonError(404, "Persona not found");

  const session = buildRealtimeSession({
    model: config.openai.realtimeModel,
    instructions: buildPersonaSystemPrompt(persona, "call", {
      notes: data.notes,
      difficulty: data.difficulty,
    }),
    voice: persona.voice.openai,
    transcribeModel: config.openai.transcribeModel,
    transcribeLanguage: config.openai.transcribeLanguage,
  });

  const slot = callRegistry.reserve();
  if (slot === null) {
    return jsonError(409, `${MAX_ACTIVE_CALLS} voice calls are already running on this server. End one first.`);
  }

  const form = new FormData();
  form.set("sdp", data.sdp);
  form.set("session", JSON.stringify(session));

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.openai.apiKey}` },
      body: form,
      signal: req.signal,
    });
  } catch (err) {
    callRegistry.release(slot);
    console.error("[realtime] could not reach OpenAI", err);
    return jsonError(502, "Could not reach OpenAI to start the voice session.");
  }

  if (!res.ok) {
    callRegistry.release(slot);
    console.error("[realtime] OpenAI error", res.status, (await res.text().catch(() => "")).slice(0, 500));
    return jsonError(502, "Could not start the voice session.");
  }

  const callId = callIdFromLocation(res.headers.get("location"));
  if (!callId) console.warn("[realtime] OpenAI sent no call id, so this call can't be hung up from the server");
  const { apiKey } = config.openai;
  callRegistry.started(slot, callId, config.callMaxMinutes * 60_000 + HANGUP_GRACE_MS, (id) => {
    console.warn(`[realtime] call ${id} reached CALL_MAX_MINUTES; hanging up`);
    void hangUpCall(apiKey, id);
  });

  const headers: Record<string, string> = { "Content-Type": "application/sdp", "Cache-Control": "no-store" };
  if (callId) headers["X-Call-Id"] = callId;
  let answer: string;
  try {
    answer = await res.text();
  } catch (err) {
    if (callId) {
      callRegistry.ended(callId);
      void hangUpCall(apiKey, callId);
    }
    console.error("[realtime] could not read OpenAI's answer", err);
    return jsonError(502, "Could not start the voice session.");
  }
  return new Response(answer, { headers });
}

/** The browser hung up: free the call's slot and make sure OpenAI ends it too. */
export async function DELETE(req: NextRequest) {
  const { config, reject } = await guard(req, { bucket: "api" });
  if (reject) return reject;
  const { data, error } = await parseJson(req, realtimeEndSchema, 1_000);
  if (error) return error;

  if (!callRegistry.ended(data.callId)) return jsonError(404, "No such call");
  if (config.openai) await hangUpCall(config.openai.apiKey, data.callId);
  return new Response(null, { status: 204 });
}
