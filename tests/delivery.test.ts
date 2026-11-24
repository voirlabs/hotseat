import { describe, expect, it } from "vitest";
import { measureDelivery, paceNote, type DeliveryInput } from "@/lib/delivery";

const user = (content: string, durationMs?: number): DeliveryInput => ({ role: "user", content, via: durationMs ? "voice" : "text", durationMs });
const them = (content: string): DeliveryInput => ({ role: "assistant", content, via: "voice" });

describe("measureDelivery", () => {
  it("returns null before the user has said anything", () => {
    expect(measureDelivery([them("What are you building?")])).toBeNull();
  });

  it("measures share, pace, fillers, longest answer and questions", () => {
    const d = measureDelivery([
      them("What are you building and why now?"), // 7 words
      user("Um, so we build scheduling software for home care agencies, you know, and um it works.", 6_000), // 16 words
      them("How many customers?"), // 3 words
      user("Fourteen paying agencies. What would you need to see to take a second meeting?", 5_000), // 14 words
    ])!;
    expect(d.talkShare).toBe(75); // 30 of 40
    expect(d.wordsPerMinute).toBeNull(); // 11 s of audio is too little to judge pace
    expect(d.fillerCount).toBe(3);
    expect(d.topFillers).toEqual([{ word: "um", count: 2 }, { word: "you know", count: 1 }]);
    expect(d.fillersPer100Words).toBe(10);
    expect(d.longestAnswerWords).toBe(16);
    expect(d.questionsAsked).toBe(1);
  });

  it("computes pace only from timed voice turns", () => {
    const words = Array.from({ length: 50 }, () => "word").join(" ");
    const d = measureDelivery([user(words, 20_000), user("typed answer with no timing")])!;
    expect(d.wordsPerMinute).toBe(150);
  });

  it("does not count ordinary words that can be fillers", () => {
    const d = measureDelivery([user("I like it, so we actually shipped it.")])!;
    expect(d.fillerCount).toBe(0);
  });
});

describe("paceNote", () => {
  it("labels pace", () => {
    expect(paceNote(95)).toBe("slow");
    expect(paceNote(150)).toBe("easy to follow");
    expect(paceNote(200)).toBe("fast");
  });
});
