import { TriangleAlert } from "lucide-react";

/** First-run hint shown when the server has no API key. */
export function SetupNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[10px] border border-warning/30 bg-warning/[0.06] px-4 py-3 text-sm leading-relaxed text-ink"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p>
        <code className="rounded bg-white/5 px-1 font-mono text-[0.9em] text-ink">OPENAI_API_KEY</code> is not set. Add it
        to <code className="rounded bg-white/5 px-1 font-mono text-[0.9em] text-ink">.env.local</code> (or your host&apos;s
        environment variables) and restart the server to start practicing.
      </p>
    </div>
  );
}
