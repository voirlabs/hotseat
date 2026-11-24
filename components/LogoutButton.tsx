"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function logout() {
    setFailed(false);
    setPending(true);
    try {
      const res = await fetch("/api/auth", { method: "DELETE" });
      if (!res.ok) throw new Error(`Logout failed (${res.status})`);
      router.replace("/login");
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {failed && (
        <span role="alert" className="text-xs text-danger">
          Couldn&apos;t log out. Try again.
        </span>
      )}
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="flex items-center gap-2 rounded-md transition-colors hover:text-ink disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Log out</span>
        <span className="sr-only sm:hidden">Log out</span>
      </button>
    </div>
  );
}
