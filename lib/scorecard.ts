import { z } from "zod";

const score = z.coerce.number().transform((n) => Math.min(10, Math.max(1, Math.round(n))));

/** Over-long text is cut rather than rejected: a wordy model still gives a scorecard. */
const text = (max: number) => z.string().transform((s) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s));
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).transform((a) => a.slice(0, max));

const scorecardSchema = z.object({
  overall: score,
  verdict: z.string().min(1).pipe(text(600)),
  categories: list(z.object({ name: z.string().min(1).pipe(text(60)), score, note: text(400).default("") }), 8).refine(
    (a) => a.length >= 1,
  ),
  strengths: list(text(300), 5).default([]),
  improvements: list(text(300), 5).default([]),
  nextQuestion: text(400).optional(),
});

export type Scorecard = z.infer<typeof scorecardSchema>;

/**
 * The JSON schema the model must answer with (OpenAI structured outputs), so
 * the reply always has every field and only the scenario's category names.
 */
export function scorecardJsonSchema(rubric: readonly string[]) {
  const text = { type: "string" };
  const list = { type: "array", items: text };
  return {
    name: "scorecard",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "verdict", "categories", "strengths", "improvements", "nextQuestion"],
      properties: {
        overall: { type: "integer" },
        verdict: text,
        categories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "score", "note"],
            properties: { name: { type: "string", enum: [...rubric] }, score: { type: "integer" }, note: text },
          },
        },
        strengths: list,
        improvements: list,
        nextQuestion: text,
      },
    },
  };
}

/**
 * Extract and validate the scorecard JSON from a model reply. With a rubric,
 * categories come back in rubric order and any duplicates are dropped.
 */
export function parseScorecard(text: string, rubric?: readonly string[]): Scorecard | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let card: Scorecard;
  try {
    const result = scorecardSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!result.success) return null;
    card = result.data;
  } catch {
    return null;
  }
  if (rubric) {
    const byName = new Map(card.categories.map((c) => [c.name, c]));
    const ordered = rubric.flatMap((name) => byName.get(name) ?? []);
    if (ordered.length) card = { ...card, categories: ordered };
  }
  return card;
}
