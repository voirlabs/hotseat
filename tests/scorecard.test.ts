import { describe, expect, it } from "vitest";
import { getPersona } from "@/lib/personas";
import { personas } from "@/lib/personas";
import { buildFeedbackSystemPrompt, buildPersonaSystemPrompt } from "@/lib/prompt";
import { SCENARIOS } from "@/lib/scenarios";
import { parseScorecard, scorecardJsonSchema } from "@/lib/scorecard";

describe("parseScorecard", () => {
  const valid = {
    overall: 7,
    verdict: "I'd take a second meeting.",
    categories: [{ name: "Team", score: 8, note: "Strong." }],
    strengths: ["Clear problem"],
    improvements: ["Show retention"],
    nextQuestion: "What is your churn?",
  };

  it("parses JSON wrapped in prose or code fences", () => {
    const parsed = parseScorecard("Sure!\n```json\n" + JSON.stringify(valid) + "\n```");
    expect(parsed?.overall).toBe(7);
    expect(parsed?.categories[0]?.name).toBe("Team");
  });

  it("trims over-long text and lists instead of rejecting the scorecard", () => {
    const parsed = parseScorecard(
      JSON.stringify({ ...valid, verdict: "x".repeat(900), strengths: ["a", "b", "c", "d", "e", "f", "g"] }),
    );
    expect(parsed?.verdict.length).toBe(600);
    expect(parsed?.verdict.endsWith("…")).toBe(true);
    expect(parsed?.strengths).toHaveLength(5);
  });

  it("clamps and rounds scores", () => {
    const parsed = parseScorecard(JSON.stringify({ ...valid, overall: 14, categories: [{ name: "Team", score: "3.6" }] }));
    expect(parsed?.overall).toBe(10);
    expect(parsed?.categories[0]?.score).toBe(4);
  });

  it("orders categories by the rubric and drops unknown or repeated ones", () => {
    const rubric = ["Team", "Business model"];
    const parsed = parseScorecard(
      JSON.stringify({
        ...valid,
        categories: [
          { name: "Business model", score: 5, note: "" },
          { name: "Team", score: 8, note: "" },
          { name: "Made up", score: 9, note: "" },
        ],
      }),
      rubric,
    );
    expect(parsed?.categories.map((c) => c.name)).toEqual(["Team", "Business model"]);
  });

  it("builds a strict JSON schema limited to the rubric's categories", () => {
    const { schema } = scorecardJsonSchema(SCENARIOS.investor.rubric);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.properties.categories.items.properties.name.enum).toEqual([...SCENARIOS.investor.rubric]);
  });

  it("returns null for invalid output", () => {
    expect(parseScorecard("no json here")).toBeNull();
    expect(parseScorecard("{ not json }")).toBeNull();
    expect(parseScorecard(JSON.stringify({ overall: 5 }))).toBeNull();
  });
});

describe("prompts", () => {
  const persona = getPersona("seed-skeptic")!;

  it("includes the persona's focus and honesty rule", () => {
    const prompt = buildPersonaSystemPrompt(persona);
    expect(prompt).toContain(persona.name);
    for (const topic of persona.probesFor) expect(prompt).toContain(topic);
    expect(prompt).toContain(persona.brief);
    expect(prompt).toMatch(/AI practice partner/);
  });

  it.each(personas.map((p) => [p.id, p] as const))("%s feedback prompt uses its scenario rubric", (_, p) => {
    const prompt = buildFeedbackSystemPrompt(p);
    for (const c of SCENARIOS[p.scenario].rubric) expect(prompt).toContain(c);
  });

  it("has personas for every scenario", () => {
    for (const id of Object.keys(SCENARIOS)) expect(personas.some((p) => p.scenario === id)).toBe(true);
  });
});
