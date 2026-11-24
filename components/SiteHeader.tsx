import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-6 text-sm text-muted">
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
