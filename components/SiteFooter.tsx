import { REPO_URL } from "@/lib/site";

/** Source and "by Voir Labs" links, under every page except the call room. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-[13px] text-faint sm:px-6">
        <p>Personas are fictional. Feedback is AI-generated.</p>
        <nav aria-label="About" className="flex items-center gap-6">
          <a href={REPO_URL} className="rounded-md transition-colors hover:text-ink">
            Source on GitHub
          </a>
          <a href="https://www.voirlabs.io/" className="rounded-md transition-colors hover:text-ink">
            by Voir Labs
          </a>
        </nav>
      </div>
    </footer>
  );
}
