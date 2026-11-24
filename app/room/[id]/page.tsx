import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Room } from "@/components/room/Room";
import { getPersona } from "@/lib/personas";
import { toPublicPersona } from "@/lib/personas/schema";
import { getServerConfig, isConfigured } from "@/lib/server/env";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const persona = getPersona((await params).id);
  return persona ? { title: `Call with ${persona.name}`, description: persona.tagline } : {};
}

export default async function RoomPage({ params }: Props) {
  const persona = getPersona((await params).id);
  if (!persona) notFound();
  const config = getServerConfig();
  return <Room persona={toPublicPersona(persona)} configured={isConfigured(config)} callMaxMinutes={config.callMaxMinutes} />;
}
