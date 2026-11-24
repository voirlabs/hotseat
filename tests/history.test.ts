import { describe, expect, it } from "vitest";
import { addEntry, forPersona, parseHistory, trendBetween, type HistoryEntry } from "@/lib/history";

const entry = (at: number, personaId: string, overall: number, traction = 4): HistoryEntry => ({
  at,
  personaId,
  overall,
  categories: [
    { name: "Traction & evidence", score: traction },
    { name: "Team", score: 6 },
  ],
});

describe("history", () => {
  it("keeps newest first, de-duplicates and caps", () => {
    let list: HistoryEntry[] = [];
    for (let i = 1; i <= 5; i++) list = addEntry(list, entry(i, "a", i), 3);
    expect(list.map((e) => e.at)).toEqual([5, 4, 3]);
    expect(addEntry(list, entry(5, "a", 9), 3).filter((e) => e.at === 5)).toHaveLength(1);
  });

  it("filters by persona", () => {
    const list = [entry(3, "a", 5), entry(2, "b", 6), entry(1, "a", 4)];
    expect(forPersona(list, "a").map((e) => e.at)).toEqual([3, 1]);
  });

  it("compares a session with the previous one, by category", () => {
    const t = trendBetween(entry(1, "a", 5, 4), {
      overall: 7,
      categories: [
        { name: "Traction & evidence", score: 6 },
        { name: "Business model", score: 5 },
      ],
    });
    expect(t.overall).toEqual({ name: "Overall", from: 5, to: 7 });
    expect(t.categories).toEqual([{ name: "Traction & evidence", from: 4, to: 6 }]);
  });

  it("ignores corrupt storage", () => {
    expect(parseHistory("{not json")).toEqual([]);
    expect(parseHistory('[{"at":1},{"at":2,"personaId":"a","overall":5,"categories":[]}]')).toHaveLength(1);
    expect(parseHistory(null)).toEqual([]);
  });
});
