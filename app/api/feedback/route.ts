import { NextResponse, type NextRequest } from "next/server";
import { getPersona } from "@/lib/personas";
import { buildFeedbackSystemPrompt, formatTranscript } from "@/lib/prompt";
import { feedbackRequestSchema } from "@/lib/schemas";
import { SCENARIOS } from "@/lib/scenarios";
import { parseScorecard, scorecardJsonSchema } from "@/lib/scorecard";
import { guard, jsonError, parseJson, providerErrorResponse } from "@/lib/server/api";
import { completeChat } from "@/lib/server/llm";

/**
 * Up to 68,000 characters of transcript and notes (FEEDBACK_MAX_CHARS plus
 * MAX_NOTES_CHARS), up to 4 bytes each in UTF-8, plus JSON overhead.
 */
const MAX_BODY_BYTES = 300_000;

export async function POST(req: NextRequest) {
  const { config, reject } = await guard(req, { bucket: "api" });
  if (reject) return reject;
  if (!config.openai) return jsonError(503, "OPENAI_API_KEY is not set on the server.");

  const { data, error } = await parseJson(req, feedbackRequestSchema, MAX_BODY_BYTES);
  if (error) return error;

  const persona = getPersona(data.personaId);
  if (!persona) return jsonError(404, "Persona not found");

  const { rubric } = SCENARIOS[persona.scenario];
  try {
    const reply = await completeChat(config.openai, {
      system: buildFeedbackSystemPrompt(persona, { notes: data.notes, difficulty: data.difficulty }),
      messages: [
        {
          role: "user",
          content: `${data.truncated ? "The start of this long call was cut. Judge only what is shown.\n\n" : ""}Here is the transcript of the call:\n\n<transcript>\n${formatTranscript(persona, data.messages)}\n</transcript>\n\nReturn the JSON scorecard now.`,
        },
      ],
      // Room for a short think before the JSON on reasoning models.
      maxTokens: 4000,
      temperature: 0.3,
      reasoning: "low",
      jsonSchema: scorecardJsonSchema(rubric),
      signal: req.signal,
    });

    const scorecard = parseScorecard(reply, rubric);
    if (!scorecard) {
      console.error("[feedback] could not parse scorecard", reply.slice(0, 500));
      return jsonError(502, "The model returned feedback in an unexpected format. Try again.");
    }
    return NextResponse.json({ scorecard }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return providerErrorResponse(err, "feedback");
  }
}
