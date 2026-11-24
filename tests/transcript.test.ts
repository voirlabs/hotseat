import { describe, expect, it } from "vitest";
import { getPersona } from "@/lib/personas";
import { measureDelivery } from "@/lib/delivery";
import { transcriptMarkdown } from "@/lib/transcript";

const persona = getPersona("seed-skeptic")!;
const date = new Date("2026-01-02T10:00:00Z");

describe("transcriptMarkdown", () => {
  it("writes a dated transcript with speaker names", () => {
    const md = transcriptMarkdown(
      persona,
      [
        { role: "assistant", content: "What are you building?" },
        { role: "user", content: "A scheduling tool." },
      ],
      undefined,
      undefined,
      date,
    );
    expect(md).toContain(`# Hotseat session with ${persona.name}`);
    expect(md).toContain("2026-01-02");
    expect(md).toContain(`**${persona.name}:** What are you building?`);
    expect(md).toContain("**You:** A scheduling tool.");
    expect(md).not.toContain("## Scorecard");
  });

  it("marks replies the user talked over", () => {
    const md = transcriptMarkdown(persona, [{ role: "assistant", content: "So the market is", interrupted: true }], undefined, undefined, date);
    expect(md).toContain(`**${persona.name}:** So the market is _(you cut in)_`);
  });

  it("includes the scorecard when there is one", () => {
    const md = transcriptMarkdown(
      persona,
      [{ role: "user", content: "Hi" }],
      {
        overall: 6,
        verdict: "Promising, but vague on numbers.",
        categories: [{ name: "Team", score: 7, note: "Clear roles." }],
        strengths: ["Crisp intro"],
        improvements: ["Bring cohort data"],
        nextQuestion: "Why now?",
      },
      undefined,
      date,
    );
    expect(md).toContain("## Scorecard: 6/10");
    expect(md).toContain("- **Team**: 7/10. Clear roles.");
    expect(md).toContain("**Prepare for:** Why now?");
  });

  it("includes how the user sounded", () => {
    const messages = [
      { role: "assistant" as const, content: "Why now?", via: "voice" as const },
      { role: "user" as const, content: "Um, because care agencies just got funding.", via: "voice" as const },
    ];
    const md = transcriptMarkdown(persona, messages, undefined, measureDelivery(messages), date);
    expect(md).toContain("## How you sounded");
    expect(md).toContain("- Filler words: 1 (um ×1)");
    expect(md).toContain("- Pace: n/a (needs a voice call)");
  });
});
