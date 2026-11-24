import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import type { Difficulty } from "@/lib/difficulty";
import type { PublicPersona } from "@/lib/personas/schema";
import { LogoMark } from "../Logo";
import { DifficultyBadge } from "../DifficultyBadge";
import { PersonaAvatar } from "../PersonaAvatar";

interface RoomHeaderProps {
  persona: PublicPersona;
  /** The level chosen for this session. */
  difficulty: Difficulty;
  /** A finished scorecard exists for the current conversation. */
  hasScorecard: boolean;
  /** Why feedback isn't available yet, or null when it is. */
  feedbackBlocked: string | null;
  onFeedback: () => void;
  onViewScorecard: () => void;
}

export function RoomHeader({ persona, difficulty, hasScorecard, feedbackBlocked, onFeedback, onViewScorecard }: RoomHeaderProps) {
  return (
    <header className="z-50 shrink-0 border-b border-line bg-bg">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-4 md:gap-4 md:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <LogoMark size={24} className="hidden sm:block" />
          <span className="sr-only sm:not-sr-only">All calls</span>
        </Link>
        <div className="h-5 w-px shrink-0 bg-line-2" aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-3">
          <PersonaAvatar persona={persona} size="sm" />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-medium leading-tight text-ink">{persona.name}</h1>
            <p className="truncate text-xs text-faint">{persona.title}</p>
          </div>
          <DifficultyBadge difficulty={difficulty} className="ml-1 hidden md:inline-flex" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {hasScorecard ? (
            <button type="button" onClick={onViewScorecard} className="btn btn-primary px-4">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">View scorecard</span>
              <span className="sm:hidden">Scorecard</span>
            </button>
          ) : (
            <>
              {feedbackBlocked && (
                <p id="feedback-blocked" className="hidden text-[13px] text-faint lg:block">
                  {feedbackBlocked}
                </p>
              )}
              <button
                type="button"
                onClick={onFeedback}
                disabled={feedbackBlocked !== null}
                aria-describedby={feedbackBlocked ? "feedback-blocked" : undefined}
                title={feedbackBlocked ?? undefined}
                className="btn btn-primary px-4"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">End &amp; get feedback</span>
                <span className="sm:hidden">Feedback</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
