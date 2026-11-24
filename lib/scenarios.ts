/**
 * A scenario is the kind of call you're practicing. It decides how the
 * persona frames the conversation and what the scorecard measures.
 */
export const SCENARIO_IDS = ["investor", "client"] as const;
type ScenarioId = (typeof SCENARIO_IDS)[number];

interface Scenario {
  /** Who the user is, from the persona's point of view. */
  userRole: string;
  /** What the persona is deciding by the end of the call. */
  goal: string;
  /** Scorecard categories, in display order. */
  rubric: readonly string[];
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  investor: {
    userRole: "a founder pitching their startup to you for investment",
    goal: "decide whether to take a second meeting",
    rubric: [
      "Problem & market",
      "Product & insight",
      "Traction & evidence",
      "Business model",
      "Team",
      "Clarity & delivery",
    ],
  },
  client: {
    userRole: "someone from a software agency or freelance team trying to win your project",
    goal: "decide whether to move forward with them",
    rubric: [
      "Discovery questions",
      "Understanding the need",
      "Handling objections",
      "Credibility & proof",
      "Clarity & confidence",
      "Next steps agreed",
    ],
  },
};
