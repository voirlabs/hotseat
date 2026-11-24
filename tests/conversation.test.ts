import { describe, expect, it } from "vitest";
import { lastMessages } from "@/lib/conversation";

const msgs = (...contents: string[]) => contents.map((content) => ({ content }));

describe("lastMessages", () => {
  it("returns everything when under both limits", () => {
    const all = msgs("a", "b", "c");
    expect(lastMessages(all, 10, 100)).toEqual(all);
  });

  it("keeps the most recent messages up to the count limit", () => {
    expect(lastMessages(msgs("a", "b", "c", "d"), 2, 100)).toEqual(msgs("c", "d"));
  });

  it("keeps the most recent messages up to the character limit", () => {
    expect(lastMessages(msgs("aaaa", "bbb", "cc", "d"), 10, 6)).toEqual(msgs("bbb", "cc", "d"));
  });

  it("stops at the first message that doesn't fit, never skipping ahead", () => {
    expect(lastMessages(msgs("a", "long message", "b"), 10, 5)).toEqual(msgs("b"));
  });

  it("handles empty input", () => {
    expect(lastMessages([], 5, 5)).toEqual([]);
  });
});
