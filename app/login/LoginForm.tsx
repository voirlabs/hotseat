"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { safeRedirectPath } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(safeRedirectPath(next));
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      const wait = Number(res.headers.get("retry-after"));
      setError(
        res.status === 429
          ? `Too many failed sign-ins. Try again in ${wait > 0 ? `${wait} second${wait === 1 ? "" : "s"}` : "a few minutes"}.`
          : (data.error ?? "Sign-in failed. Try again."),
      );
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-muted">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "password-error" : undefined}
            className={cn("field h-11 px-4 pr-12", error && "border-danger/70")}
            required
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition-colors hover:text-ink"
          >
            {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {error && (
          <p id="password-error" role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
      <button type="submit" disabled={loading || !password} className="btn btn-primary h-11 w-full">
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#151417]/30 border-t-[#151417]" aria-hidden="true" />
        )}
        {loading ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
      </button>
    </form>
  );
}
