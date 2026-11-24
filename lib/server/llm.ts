import type { ChatMessage } from "@/lib/schemas";
import type { OpenAIConfig } from "./env";
import { parseSse } from "./sse";

interface ChatParams {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** How hard a reasoning model thinks first. Ignored by other models. */
  reasoning?: "none" | "low";
  /** A JSON schema the reply must match (OpenAI structured outputs). */
  jsonSchema?: { name: string; schema: object };
  signal?: AbortSignal;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const isReasoningModel = (model: string) => /^(o\d|gpt-5)/.test(model);

/**
 * The reasoning_effort to send, or undefined for models that don't take one.
 * "none" exists from gpt-5.1 on; the original gpt-5 family's floor is
 * "minimal" and the o-series' is "low".
 */
export function reasoningEffort(model: string, effort: "none" | "low" | undefined): string | undefined {
  if (!effort || !isReasoningModel(model)) return undefined;
  if (effort === "none" && !/^gpt-5\.\d/.test(model)) return model.startsWith("gpt-5") ? "minimal" : "low";
  return effort;
}

async function* streamOpenAI(config: OpenAIConfig, p: ChatParams): AsyncGenerator<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    signal: p.signal,
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.chatModel,
      stream: true,
      max_completion_tokens: p.maxTokens,
      // Reasoning models reject a custom temperature.
      ...(p.temperature !== undefined && !isReasoningModel(config.chatModel) ? { temperature: p.temperature } : {}),
      ...(reasoningEffort(config.chatModel, p.reasoning) ? { reasoning_effort: reasoningEffort(config.chatModel, p.reasoning) } : {}),
      ...(p.jsonSchema
        ? { response_format: { type: "json_schema", json_schema: { ...p.jsonSchema, strict: true } } }
        : {}),
      messages: [{ role: "system", content: p.system }, ...p.messages],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(`Chat request failed (${res.status})`, res.status, detail.slice(0, 500));
  }

  for await (const data of parseSse(res.body)) {
    if (data === "[DONE]") return;
    const json = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null } }[];
      error?: { message?: string };
    };
    if (json.error) throw new ProviderError(json.error.message ?? "OpenAI stream error", 502);
    const text = json.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

/**
 * Start a streaming completion. Resolves once the provider has accepted the
 * request (so HTTP errors surface before we start streaming to the client),
 * then yields text chunks.
 */
export async function streamChat(config: OpenAIConfig, params: ChatParams): Promise<AsyncGenerator<string>> {
  const gen = streamOpenAI(config, params);
  const first = await gen.next();

  return (async function* () {
    if (!first.done) yield first.value;
    yield* gen;
  })();
}

export async function completeChat(config: OpenAIConfig, params: ChatParams): Promise<string> {
  let text = "";
  for await (const chunk of await streamChat(config, params)) text += chunk;
  return text;
}
