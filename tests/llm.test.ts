import { describe, expect, it } from "vitest";
import { reasoningEffort } from "@/lib/server/llm";

describe("reasoningEffort", () => {
  it("only applies to reasoning models", () => {
    expect(reasoningEffort("gpt-4.1-mini", "none")).toBeUndefined();
    expect(reasoningEffort("llama3.1", "low")).toBeUndefined();
    expect(reasoningEffort("gpt-5.4-mini", undefined)).toBeUndefined();
  });

  it("falls back to each family's lowest effort", () => {
    expect(reasoningEffort("gpt-5.4-mini", "none")).toBe("none");
    expect(reasoningEffort("gpt-5-mini", "none")).toBe("minimal");
    expect(reasoningEffort("o3", "none")).toBe("low");
    expect(reasoningEffort("gpt-5.5", "low")).toBe("low");
  });
});
