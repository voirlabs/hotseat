/**
 * Server configuration, read from process.env on every call so that tests
 * and hot reloads pick up changes. Never import this from client code.
 */

export interface OpenAIConfig {
  apiKey: string;
  /** Chat completions endpoint base. Voice calls always use api.openai.com. */
  baseUrl: string;
  chatModel: string;
  /** Speech-to-speech model for voice calls. */
  realtimeModel: string;
  /** Transcribes the user's side of a voice call, for the chat and the scorecard. */
  transcribeModel: string;
  /** ISO-639-1 code, or undefined to let the model detect the language. */
  transcribeLanguage?: string;
}

/** What signs and checks the owner's session. */
export interface AuthConfig {
  /** ADMIN_PASSWORD, at least MIN_PASSWORD_LENGTH characters. */
  password: string;
  /** SESSION_SECRET, or null to derive the signing key from the password. */
  sessionSecret: string | null;
}

/** Why sign-in is unavailable; the login page explains each one. */
export type AuthProblem = "missing-password" | "short-password" | "short-secret";

export const MIN_PASSWORD_LENGTH = 12;
export const MIN_SESSION_SECRET_LENGTH = 32;

export interface ServerConfig {
  /** null when OPENAI_API_KEY is missing: the app shows setup instructions. */
  openai: OpenAIConfig | null;
  /** null when sign-in isn't set up (see authProblem): then the app stays locked. */
  auth: AuthConfig | null;
  rateLimitPerMinute: number;
  trustedProxyHops: number;
  /** Voice calls end after this many minutes, to bound the cost of one session. */
  callMaxMinutes: number;
}

function read(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function readInt(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = Number(read(env, key));
  return Number.isInteger(value) ? value : undefined;
}

/**
 * Hosts that always run one proxy in front of the app which appends the
 * client's address to X-Forwarded-For, detected by an env var they set.
 * Trusting one hop there is safe: the last entry comes from the platform, so
 * a client can't spoof it by sending its own header.
 */
const ONE_PROXY_PLATFORMS = [
  "VERCEL",
  "RENDER",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_ENVIRONMENT",
  "FLY_APP_NAME",
  "DYNO", // Heroku
];

/**
 * TRANSCRIBE_LANGUAGE as the ISO-639-1 code the Realtime API expects. Accepts
 * a locale like "en-US" and keeps the language part. Anything else would make
 * every voice session fail, so it falls back to auto-detection with a warning.
 */
export function parseTranscribeLanguage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const code = value.toLowerCase().split(/[-_]/)[0] ?? "";
  if (/^[a-z]{2}$/.test(code)) return code;
  console.warn(`[env] Ignoring TRANSCRIBE_LANGUAGE="${value}": use a two-letter code like "en". Auto-detecting instead.`);
  return undefined;
}

/**
 * The owner's password and session secret. When either is missing or too
 * short, `auth` is null and nobody can sign in; `problem` says why.
 */
export function getAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): { auth: AuthConfig; problem: null } | { auth: null; problem: AuthProblem } {
  const password = read(env, "ADMIN_PASSWORD");
  const sessionSecret = read(env, "SESSION_SECRET") ?? null;
  if (!password) return { auth: null, problem: "missing-password" };
  if (password.length < MIN_PASSWORD_LENGTH) return { auth: null, problem: "short-password" };
  if (sessionSecret !== null && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    return { auth: null, problem: "short-secret" };
  }
  return { auth: { password, sessionSecret }, problem: null };
}

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiKey = read(env, "OPENAI_API_KEY");
  const limit = readInt(env, "RATE_LIMIT_PER_MINUTE");
  const hops = readInt(env, "TRUSTED_PROXY_HOPS");
  const callMinutes = readInt(env, "CALL_MAX_MINUTES");

  return {
    openai: apiKey
      ? {
          apiKey,
          baseUrl: (read(env, "OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
          chatModel: read(env, "OPENAI_MODEL") ?? "gpt-5.4-mini",
          realtimeModel: read(env, "OPENAI_REALTIME_MODEL") ?? "gpt-realtime-2.1-mini",
          transcribeModel: read(env, "OPENAI_TRANSCRIBE_MODEL") ?? "gpt-4o-transcribe",
          transcribeLanguage: parseTranscribeLanguage(read(env, "TRANSCRIBE_LANGUAGE")),
        }
      : null,
    auth: getAuthConfig(env).auth,
    rateLimitPerMinute: limit !== undefined && limit > 0 ? limit : 30,
    // Elsewhere, ignore forwarding headers unless the operator says how many
    // proxies to trust: trusting a header nobody sets lets clients pick their IP.
    trustedProxyHops:
      hops !== undefined && hops >= 0 ? hops : ONE_PROXY_PLATFORMS.some((key) => read(env, key)) ? 1 : 0,
    callMaxMinutes: callMinutes !== undefined && callMinutes > 0 ? callMinutes : 20,
  };
}

/** Whether the app has an API key, safe to pass to the browser. */
export function isConfigured(config: ServerConfig = getServerConfig()): boolean {
  return config.openai !== null;
}
