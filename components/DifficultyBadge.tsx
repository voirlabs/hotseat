import type { Difficulty } from "@/lib/difficulty";
import { cn } from "@/lib/utils";

const DOT: Record<Difficulty, string> = {
  friendly: "bg-success",
  balanced: "bg-warning",
  tough: "bg-danger",
};

/** A status dot in the level's colour, then the level as a quiet label. */
export function DifficultyBadge({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[12px] font-medium capitalize leading-4 text-faint", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[difficulty])} aria-hidden="true" />
      <span className="sr-only">Difficulty: </span>
      {difficulty}
    </span>
  );
}
