"use client";

import { useEffect } from "react";
import { Lockup } from "@/components/Logo";

// Shown in place of a page that failed to load.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main role="alert" className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <Lockup size={34} className="mb-10" />
      <p className="eyebrow mb-4">Error</p>
      <h1 className="display mb-4 text-[44px] sm:text-[48px]">
        Something <em>went wrong</em>
      </h1>
      <p className="mb-8 max-w-sm text-balance text-[15px] leading-relaxed text-muted">
        This page couldn&apos;t load. It&apos;s usually temporary, so try again.
      </p>
      <button type="button" onClick={() => reset()} className="btn btn-primary h-11">
        Try again
      </button>
    </main>
  );
}
