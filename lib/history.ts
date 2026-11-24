/**
 * Past scorecards, kept in this browser so you can see whether you're getting
 * better. Pure helpers here; hooks/useHistory.ts reads and writes storage.
 */

export interface HistoryEntry {
  /** When the scorecard was made (ms since epoch); also its id. */
  at: number;
  personaId: string;
  overall: number;
  categories: { name: string; score: number }[];
}

interface ScoreChange {
  name: string;
  from: number;
  to: number;
}

interface Trend {
  overall: ScoreChange;
  categories: ScoreChange[];
}

/** Enough for a trend without storage growing forever. */
const MAX_HISTORY = 60;

/** Newest first, capped. */
export function addEntry(list: HistoryEntry[], entry: HistoryEntry, max = MAX_HISTORY): HistoryEntry[] {
  return [entry, ...list.filter((e) => e.at !== entry.at)].slice(0, max);
}

/** This persona's sessions, newest first. */
export function forPersona(list: HistoryEntry[], personaId: string): HistoryEntry[] {
  return list.filter((e) => e.personaId === personaId);
}

/** How a session compares with the one before it, category by category. */
export function trendBetween(previous: HistoryEntry, current: Pick<HistoryEntry, "overall" | "categories">): Trend {
  const before = new Map(previous.categories.map((c) => [c.name, c.score]));
  return {
    overall: { name: "Overall", from: previous.overall, to: current.overall },
    categories: current.categories.flatMap((c) => {
      const from = before.get(c.name);
      return from === undefined ? [] : [{ name: c.name, from, to: c.score }];
    }),
  };
}

/** Read stored history, dropping anything malformed. */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is HistoryEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.at === "number" &&
        typeof e.personaId === "string" &&
        typeof e.overall === "number" &&
        Array.isArray(e.categories),
    );
  } catch {
    return [];
  }
}
