import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Lockup } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <Lockup size={34} className="mb-10" />
      <p className="eyebrow mb-4">Error 404</p>
      <h1 className="display mb-4 text-[44px] sm:text-[48px]">
        Page <em>not found</em>
      </h1>
      <p className="mb-8 max-w-sm text-balance text-[15px] leading-relaxed text-muted">
        This call doesn&apos;t exist or has moved. Head back and pick one from the list.
      </p>
      <Link href="/" className="btn btn-primary h-11">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All calls
      </Link>
    </main>
  );
}
