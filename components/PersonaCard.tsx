import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Persona } from "@/lib/personas/schema";
import { DifficultyBadge } from "./DifficultyBadge";
import { PersonaAvatar } from "./PersonaAvatar";
import { PersonaProgress } from "./PracticeHistory";

export function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <Link
      href={`/room/${persona.id}`}
      className="panel group flex flex-col gap-4 p-5 transition-colors hover:border-line-2 hover:bg-[#1b1820] focus-visible:border-line-2"
    >
      <div className="flex items-center justify-between gap-3">
        <PersonaAvatar persona={persona} size="sm" className="h-12 w-12 text-base" />
        <DifficultyBadge difficulty={persona.difficulty} />
      </div>
      <div>
        <h3 className="text-lg font-medium leading-tight text-ink">
          {persona.name}
        </h3>
        <p className="mt-1 text-[13px] text-faint">{persona.title}</p>
      </div>
      <p className="text-sm leading-relaxed text-muted">{persona.tagline}</p>
      <PersonaProgress personaId={persona.id} />
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
        {/* Two topics, one per row, so every card's Start row lines up. */}
        <ul className="flex min-w-0 flex-col items-start gap-2" aria-label="Pushes on">
          {persona.probesFor.slice(0, 2).map((topic) => (
            <li key={topic} className="max-w-full truncate rounded-md border border-line-2 px-2 py-0.5 text-[12px] text-muted">
              {topic}
            </li>
          ))}
        </ul>
        <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted transition-colors group-hover:text-ink">
          Start <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
