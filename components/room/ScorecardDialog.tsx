"use client";

import { useEffect, useRef } from "react";
import { Download, RotateCcw, X } from "lucide-react";
import type { ScorecardState } from "@/hooks/useScorecard";
import { paceNote, type Delivery } from "@/lib/delivery";
import { trendBetween } from "@/lib/history";
import type { PublicPersona } from "@/lib/personas/schema";
import { cn, firstName } from "@/lib/utils";

interface Props {
  persona: PublicPersona;
  state: ScorecardState;
  /** How the user spoke, measured from the transcript. */
  delivery: Delivery | null;
  onClose: () => void;
  onRetry: () => void;
  onNewCall: () => void;
  onDownload: () => void;
}

/** Green from 8, amber from 5, red below. */
function tone(score: number) {
  return score >= 8 ? "success" : score >= 5 ? "warning" : "danger";
}
const TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

/** "↑ from 4" in green, "↓ from 7" in red, or "same as last time". */
function Change({ from, to }: { from: number; to: number }) {
  if (from === to) return <span className="text-[12px] text-faint">same as last time</span>;
  const up = to > from;
  return (
    <span className={cn("text-[12px] tabular-nums", up ? "text-success" : "text-danger")}>
      <span aria-hidden="true">{up ? "↑" : "↓"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span> from {from}
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-card px-3 py-3">
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className="mt-1 text-[15px] font-medium tabular-nums text-ink">
        {value}
        {note && <span className="ml-2 text-[12px] text-muted">{note}</span>}
      </dd>
    </div>
  );
}

export function ScorecardDialog({ persona, state, delivery, onClose, onRetry, onNewCall, onDownload }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const trend = state.status === "done" && state.previous ? trendBetween(state.previous, state.scorecard) : null;
  const changes = new Map(trend?.categories.map((c) => [c.name, c]) ?? []);
  // The one area to work on first gets the accent: the lowest score (the first, on a tie).
  const lowest =
    state.status === "done"
      ? state.scorecard.categories.reduce((at, c, i, all) => (c.score < all[at]!.score ? i : at), 0)
      : -1;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="scorecard-title"
      aria-busy={state.status === "loading"}
      className="m-auto max-h-[90dvh] w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-2 bg-surface-2 p-0 text-ink shadow-[0_24px_64px_rgb(0_0_0/0.6)] backdrop:bg-black/70"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <p className="eyebrow mb-1">Scorecard</p>
            <h2 id="scorecard-title" className="display text-[28px]">
              {persona.name}&apos;s <em>notes</em>
            </h2>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          {state.status === "loading" && (
            <div role="status" className="flex flex-col items-center gap-3 py-12 text-sm text-muted">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-hidden="true" />
              {persona.name} is writing up notes…
            </div>
          )}

          {state.status === "error" && (
            <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center text-sm text-ink">
              <p>{state.message}</p>
              <button type="button" onClick={onRetry} className="btn btn-secondary">
                Try again
              </button>
            </div>
          )}

          {state.status === "done" && (
            <div className="space-y-8">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex h-20 shrink-0 items-center justify-center rounded-xl border border-line bg-card px-5">
                  <span className="text-[36px] font-medium leading-none tabular-nums">
                    <span className={TEXT[tone(state.scorecard.overall)]}>{state.scorecard.overall}</span>
                    <span className="text-faint">/10</span>
                  </span>
                </div>
                <div className="min-w-0 space-y-2">
                  <blockquote className="text-[15px] leading-relaxed text-ink">
                    &ldquo;{state.scorecard.verdict}&rdquo;
                  </blockquote>
                  {trend && (
                    <p className="text-[12px] text-muted">
                      Overall vs your last call with {firstName(persona.name)}: <Change from={trend.overall.from} to={trend.overall.to} />
                    </p>
                  )}
                </div>
              </div>

              <ul className="space-y-4">
                {state.scorecard.categories.map((c, i) => (
                  <li key={i}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">{c.name}</span>
                      <span className="flex items-center gap-2">
                        {changes.get(c.name) && <Change from={changes.get(c.name)!.from} to={c.score} />}
                        <span className={cn("font-medium tabular-nums", TEXT[tone(c.score)])}>{c.score}/10</span>
                      </span>
                    </div>
                    <div className="mb-2 h-1 overflow-hidden rounded-sm bg-white/[0.06]" aria-hidden="true">
                      <div
                        className={cn("h-full rounded-sm", i === lowest ? "bg-accent" : "bg-faint")}
                        style={{ width: `${c.score * 10}%` }}
                      />
                    </div>
                    {c.note && <p className="text-[13px] leading-relaxed text-muted">{c.note}</p>}
                  </li>
                ))}
              </ul>

              {delivery && (
                <section aria-labelledby="delivery-title" className="border-t border-line pt-6">
                  <h3 id="delivery-title" className="eyebrow mb-3">
                    How you sounded
                  </h3>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Stat label="Your share of the talking" value={`${delivery.talkShare}%`} />
                    <Stat
                      label="Pace"
                      value={delivery.wordsPerMinute ? `${delivery.wordsPerMinute} wpm` : "n/a"}
                      note={delivery.wordsPerMinute ? paceNote(delivery.wordsPerMinute) : "needs a voice call"}
                    />
                    <Stat
                      label="Filler words"
                      value={String(delivery.fillerCount)}
                      note={delivery.topFillers.length ? delivery.topFillers.map((f) => `${f.word} ×${f.count}`).join(", ") : undefined}
                    />
                    <Stat label="Longest answer" value={`${delivery.longestAnswerWords} words`} />
                    <Stat label="Questions you asked" value={String(delivery.questionsAsked)} />
                  </dl>
                  {persona.scenario === "client" && (
                    <p className="mt-2 text-[13px] text-muted">
                      On a discovery call, the buyer talking more than you is usually a good sign.
                    </p>
                  )}
                </section>
              )}

              <div className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
                <FeedbackList title="What landed" items={state.scorecard.strengths} />
                <FeedbackList title="What to fix" items={state.scorecard.improvements} />
              </div>

              {state.scorecard.nextQuestion && (
                <div className="rounded-xl border border-accent-border bg-accent-strong px-4 py-3">
                  <p className="eyebrow mb-1 text-accent">Prepare for this</p>
                  <p className="text-[15px] text-ink">{state.scorecard.nextQuestion}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-4 sm:px-6 [&>.btn]:flex-1 sm:[&>.btn]:flex-none">
          {state.status !== "loading" && (
            <button type="button" onClick={onDownload} className="btn btn-secondary">
              <Download className="h-4 w-4" aria-hidden="true" />
              {/* One text node, so the button's gap doesn't split the label. */}
              <span>
                Download<span className="hidden sm:inline">{state.status === "done" ? " Markdown" : " transcript"}</span>
              </span>
            </button>
          )}
          {state.status === "done" && (
            <button
              type="button"
              onClick={() => {
                ref.current?.close();
                onNewCall();
              }}
              className="btn btn-primary"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> New call
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="eyebrow mb-3">{title}</h3>
      <ul className="space-y-2 text-sm leading-relaxed text-ink">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
