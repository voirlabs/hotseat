import { describe, expect, it } from "vitest";
import { getPersona } from "@/lib/personas";
import { buildFeedbackSystemPrompt, buildPersonaSystemPrompt } from "@/lib/prompt";
import { chatRequestSchema } from "@/lib/schemas";

const tough = getPersona("seed-skeptic")!;

describe("difficulty", () => {
  it("uses the persona's own level when none is chosen", () => {
    expect(tough.difficulty).toBe("tough");
    expect(buildPersonaSystemPrompt(tough, "chat", { difficulty: "tough" })).toBe(buildPersonaSystemPrompt(tough, "chat"));
  });

  it("overrides the temperament for one session", () => {
    const friendly = buildPersonaSystemPrompt(tough, "call", { difficulty: "friendly" });
    expect(friendly).toContain("You are supportive");
    expect(friendly).not.toContain("You are demanding");
  });

  it("tells the scorecard how strictly to grade", () => {
    expect(buildFeedbackSystemPrompt(tough)).toContain("grade strictly");
    expect(buildFeedbackSystemPrompt(tough, { difficulty: "friendly" })).toContain("be encouraging");
    expect(buildFeedbackSystemPrompt(tough, { difficulty: "balanced" })).not.toMatch(/grade strictly|be encouraging/);
  });

  it("is optional and rejects unknown levels", () => {
    const base = { personaId: "seed-skeptic", messages: [{ role: "user", content: "Hi" }] };
    expect(chatRequestSchema.parse(base).difficulty).toBeUndefined();
    expect(chatRequestSchema.safeParse({ ...base, difficulty: "brutal" }).success).toBe(false);
  });
});
