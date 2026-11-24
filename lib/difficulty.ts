/**
 * How hard the persona pushes. Each persona has its own level; the user can
 * pick another for one session, which changes the call, chat and scorecard.
 * Kept free of zod so the client bundle stays small.
 */
export const DIFFICULTIES = ["friendly", "balanced", "tough"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  friendly: "Supportive, with room to think.",
  balanced: "Fair: warm when you're sharp, firm when you're vague.",
  tough: "Demanding: every claim needs a number or proof.",
};
