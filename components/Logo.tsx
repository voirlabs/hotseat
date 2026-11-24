import Image from "next/image";
import Link from "next/link";
import { APP_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

/** The Hotseat mark, served unchanged from public/logo.svg. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return <Image src="/logo.svg" alt="" width={size} height={size} priority className={cn("shrink-0", className)} />;
}

/** Lockup: the mark plus the lowercase product name at 0.8x the mark, spaced 0.4x. */
export function Lockup({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center font-medium leading-none tracking-[-0.04em] text-ink", className)}
      style={{ gap: Math.round(size * 0.4), fontSize: Math.round(size * 0.8) }}
    >
      <LogoMark size={size} />
      {APP_NAME.toLowerCase()}
    </span>
  );
}

/** The lockup as a link home, for headers. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${APP_NAME} home`}
      className={cn("inline-flex rounded-md transition-opacity hover:opacity-85", className)}
    >
      <Lockup size={size} />
    </Link>
  );
}
