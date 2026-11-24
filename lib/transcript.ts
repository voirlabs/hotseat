import type { PublicPersona } from "@/lib/personas/schema";
import { paceNote, type Delivery } from "@/lib/delivery";
import type { Scorecard } from "@/lib/scorecard";
import { APP_NAME } from "@/lib/site";

export function transcriptMarkdown(
  persona: PublicPersona,
  messages: { role: "user" | "assistant"; content: string; interrupted?: boolean }[],
  scorecard?: Scorecard,
  delivery?: Delivery | null,
  date = new Date(),
): string {
  const lines = [
    `# ${APP_NAME} session with ${persona.name}`,
    "",
    `${persona.title} · ${date.toISOString().slice(0, 10)}`,
    "",
  ];

  if (scorecard) {
    lines.push(`## Scorecard: ${scorecard.overall}/10`, "", `> ${scorecard.verdict}`, "");
    for (const c of scorecard.categories) lines.push(`- **${c.name}**: ${c.score}/10. ${c.note}`);
    if (scorecard.strengths.length) lines.push("", "**What landed**", ...scorecard.strengths.map((s) => `- ${s}`));
    if (scorecard.improvements.length) lines.push("", "**What to fix**", ...scorecard.improvements.map((s) => `- ${s}`));
    if (scorecard.nextQuestion) lines.push("", `**Prepare for:** ${scorecard.nextQuestion}`);
    lines.push("");
  }

  if (delivery) {
    lines.push(
      "## How you sounded",
      "",
      `- Your share of the talking: ${delivery.talkShare}%`,
      `- Pace: ${delivery.wordsPerMinute ? `${delivery.wordsPerMinute} words a minute (${paceNote(delivery.wordsPerMinute)})` : "n/a (needs a voice call)"}`,
      `- Filler words: ${delivery.fillerCount}${delivery.topFillers.length ? ` (${delivery.topFillers.map((f) => `${f.word} ×${f.count}`).join(", ")})` : ""}`,
      `- Longest answer: ${delivery.longestAnswerWords} words`,
      `- Questions you asked: ${delivery.questionsAsked}`,
      "",
    );
  }

  lines.push("## Transcript", "");
  for (const m of messages) {
    const cut = m.interrupted ? " _(you cut in)_" : "";
    lines.push(`**${m.role === "user" ? "You" : persona.name}:** ${m.content}${cut}`, "");
  }
  return lines.join("\n");
}
