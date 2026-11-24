import { PersonaCard } from "@/components/PersonaCard";
import { PracticeHistory } from "@/components/PracticeHistory";
import { SetupNotice } from "@/components/SetupNotice";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { personas } from "@/lib/personas";
import { isConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <div className="max-w-2xl">
          <p className="eyebrow mb-4">Practice room</p>
          <h1 className="display text-[44px] sm:text-[60px]">
            Pick your <em>hot seat</em>
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted">
            Read the situation, then talk it through out loud or in the chat. Hang up for a scorecard on what landed and
            what to fix.
          </p>
        </div>
        {!isConfigured() && <SetupNotice />}
        <section aria-label="Personas" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <PersonaCard key={persona.id} persona={persona} />
          ))}
        </section>
        <PracticeHistory personas={personas.map(({ id, name }) => ({ id, name }))} />
      </main>
      <SiteFooter />
    </div>
  );
}
