"use client";

import { useHistory } from "@/hooks/useHistory";
import { forPersona } from "@/lib/history";

const SHOWN = 6;

function formatDate(at: number) {
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Your recent scorecards in this browser, with the change since the call before. */
export function PracticeHistory({ personas }: { personas: { id: string; name: string }[] }) {
  const { list, clear } = useHistory();
  if (list.length === 0) return null;
  const nameOf = new Map(personas.map((p) => [p.id, p.name]));

  return (
    <section aria-labelledby="history-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-line pb-4">
        <h2 id="history-title" className="text-xl font-medium text-ink">
          Your practice
        </h2>
        <p className="text-sm text-faint">
          Kept in this browser only.{" "}
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Clear your practice history from this browser?")) clear();
            }}
            className="rounded underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink"
          >
            Clear history
          </button>
        </p>
      </div>
      <ul className="divide-y divide-line">
        {list.slice(0, SHOWN).map((entry) => {
          const before = forPersona(list, entry.personaId).find((e) => e.at < entry.at);
          const change = before ? entry.overall - before.overall : null;
          return (
            <li key={entry.at} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="min-w-0 truncate text-ink">
                {nameOf.get(entry.personaId) ?? entry.personaId}
                <span className="ml-2 text-faint">{formatDate(entry.at)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 tabular-nums">
                {change !== null && change !== 0 && (
                  <span className={change > 0 ? "text-success" : "text-danger"}>
                    {change > 0 ? "↑" : "↓"} {Math.abs(change)}
                  </span>
                )}
                <span className="font-medium text-ink">{entry.overall}/10</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "3 calls · last 6/10" on a persona card, once you've practised with them. */
export function PersonaProgress({ personaId }: { personaId: string }) {
  const { list } = useHistory();
  const mine = forPersona(list, personaId);
  if (mine.length === 0) return null;
  return (
    <p className="text-[12px] tabular-nums text-faint">
      {mine.length} {mine.length === 1 ? "call" : "calls"} · last {mine[0]!.overall}/10
    </p>
  );
}
