import { z } from "zod";
import { DIFFICULTIES } from "@/lib/difficulty";
import { SCENARIO_IDS } from "@/lib/scenarios";

/** The voices the OpenAI Realtime API speaks with. */
const REALTIME_VOICES = ["alloy", "ash", "ballad", "cedar", "coral", "echo", "marin", "sage", "shimmer", "verse"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb color");

export const personaSchema = z.object({
  /** URL slug. Must match the file name in /personas. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be kebab-case"),
  /** Fictional display name. Do not use real people. */
  name: z.string().min(1).max(40),
  /** Role shown under the name, e.g. "Partner, seed-stage fund". */
  title: z.string().min(1).max(60),
  /** Which kind of call this is. See lib/scenarios.ts. */
  scenario: z.enum(SCENARIO_IDS),
  /** One-line summary shown on the persona card. */
  tagline: z.string().min(1).max(160),
  /** The situation, shown to the user before the call and given to the model. */
  brief: z.string().min(1).max(500),
  difficulty: z.enum(DIFFICULTIES),
  /** First thing the persona says when the meeting starts. */
  opener: z.string().min(1).max(300),
  /** Voice, temperament and habits. Injected into the system prompt. */
  style: z.string().min(1).max(1200),
  /** Topics this persona always pushes on. Drives their questions. */
  probesFor: z.array(z.string().min(1).max(80)).min(1).max(6),
  /** Things that make this persona walk away. */
  dealBreakers: z.array(z.string().min(1).max(120)).max(5).default([]),
  avatar: z.object({
    initials: z.string().min(1).max(3),
    from: hex,
    to: hex,
  }),
  voice: z
    .object({
      /** Realtime voice. Checked here so a typo fails `pnpm test`, not a live call. */
      openai: z.enum(REALTIME_VOICES).default("alloy"),
      /** How the persona sounds: pace, tone, manner. Added to the call instructions. */
      instructions: z.string().max(300).optional(),
    })
    .default({ openai: "alloy" }),
});

export type Persona = z.infer<typeof personaSchema>;

/**
 * What the browser gets for a call: the persona minus what its prompt is built
 * from (style, probes, deal-breakers, voice), which stays on the server.
 */
export type PublicPersona = Pick<
  Persona,
  "id" | "name" | "title" | "scenario" | "tagline" | "brief" | "difficulty" | "opener" | "avatar"
>;

export function toPublicPersona(p: Persona): PublicPersona {
  const { id, name, title, scenario, tagline, brief, difficulty, opener, avatar } = p;
  return { id, name, title, scenario, tagline, brief, difficulty, opener, avatar };
}
