import { personaSchema, type Persona } from "./schema";

import seedSkeptic from "@/personas/seed-skeptic.json";
import operatorAngel from "@/personas/operator-angel.json";
import growthPartner from "@/personas/growth-partner.json";
import skepticalCto from "@/personas/skeptical-cto.json";
import firstTimeFounder from "@/personas/first-time-founder.json";
import procurementLead from "@/personas/procurement-lead.json";

/**
 * Persona registry. To add a persona, drop a JSON file in /personas and
 * import it here. `pnpm test` fails if a file is not registered.
 */
const rawPersonas: unknown[] = [
  seedSkeptic,
  operatorAngel,
  growthPartner,
  skepticalCto,
  firstTimeFounder,
  procurementLead,
];

export const personas: Persona[] = rawPersonas.map((raw, i) => {
  const result = personaSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid persona at index ${i}: ${result.error.message}`);
  }
  return result.data;
});

export function getPersona(id: string): Persona | undefined {
  return personas.find((p) => p.id === id);
}

export { personaSchema } from "./schema";
