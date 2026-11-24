/**
 * How the user spoke, measured from the transcript with no model call: their
 * share of the talking, speaking pace, filler words, longest answer and the
 * questions they asked. The scorecard judges what was said; this shows how.
 */

export interface DeliveryInput {
  role: "user" | "assistant";
  content: string;
  via: "text" | "voice";
  /** How long a spoken turn took, when the call measured it. */
  durationMs?: number;
}

export interface Delivery {
  /** The user's share of all words in the conversation, 0-100. */
  talkShare: number;
  /** Over spoken turns with a measured duration; null without enough audio. */
  wordsPerMinute: number | null;
  fillerCount: number;
  fillersPer100Words: number;
  /** Most frequent fillers, most used first. */
  topFillers: { word: string; count: number }[];
  longestAnswerWords: number;
  questionsAsked: number;
}

// Words that pad speech without meaning. "Like", "so" and "actually" are left
// out: they are as often real words as filler, and a false count misleads.
const FILLERS = ["um", "uh", "erm", "er", "hmm", "you know", "i mean", "basically", "literally", "sort of", "kind of"];
const FILLER_RE = new RegExp(`\\b(${FILLERS.map((f) => f.replace(" ", "\\s+")).join("|")})\\b`, "gi");

/** Less than this much measured speech gives a pace too noisy to show. */
const MIN_SPOKEN_MS = 15_000;

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function measureDelivery(messages: DeliveryInput[]): Delivery | null {
  const mine = messages.filter((m) => m.role === "user" && m.content.trim());
  if (mine.length === 0) return null;

  const myWords = mine.reduce((n, m) => n + wordCount(m.content), 0);
  const allWords = messages.reduce((n, m) => n + wordCount(m.content), 0);

  const timed = mine.filter((m) => m.via === "voice" && (m.durationMs ?? 0) > 0);
  const spokenMs = timed.reduce((n, m) => n + (m.durationMs ?? 0), 0);
  const spokenWords = timed.reduce((n, m) => n + wordCount(m.content), 0);

  const counts = new Map<string, number>();
  for (const m of mine) {
    for (const match of m.content.matchAll(FILLER_RE)) {
      const word = match[1]!.toLowerCase().replace(/\s+/g, " ");
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const fillerCount = [...counts.values()].reduce((a, b) => a + b, 0);

  return {
    talkShare: allWords ? Math.round((myWords / allWords) * 100) : 0,
    wordsPerMinute: spokenMs >= MIN_SPOKEN_MS ? Math.round(spokenWords / (spokenMs / 60_000)) : null,
    fillerCount,
    fillersPer100Words: myWords ? Math.round((fillerCount / myWords) * 1000) / 10 : 0,
    topFillers: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word, count]) => ({ word, count })),
    longestAnswerWords: Math.max(...mine.map((m) => wordCount(m.content))),
    questionsAsked: mine.reduce((n, m) => n + (m.content.match(/\?/g)?.length ?? 0), 0),
  };
}

/** A short verdict on pace: about 130-170 words a minute is easy to follow. */
export function paceNote(wpm: number): string {
  return wpm < 110 ? "slow" : wpm > 180 ? "fast" : "easy to follow";
}
