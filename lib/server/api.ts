import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getServerConfig, type ServerConfig } from "./env";
import { ProviderError } from "./llm";
import { clientIp, rateLimiter, SHARED_CLIENT } from "./rate-limit";
import { isSameOrigin } from "./request";

export function jsonError(status: number, error: string, headers?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers });
}

interface GuardOptions {
  /**
   * Rate-limit bucket. Each bucket has its own counter per client. "login"
   * isn't counted here: the sign-in route counts failed attempts itself
   * (loginThrottle), so the owner's correct password is never turned away by
   * someone else's requests.
   */
  bucket: "api" | "realtime" | "login";
  /** Skip the session check (used by the login and logout routes). */
  public?: boolean;
}

let warnedSharedBucket = false;

/**
 * Shared checks for every API route: same-origin, session (when a password
 * is configured) and per-client rate limiting. Returns a response to send back
 * if the request should be rejected, otherwise the server config.
 */
export async function guard(
  req: NextRequest,
  opts: GuardOptions,
): Promise<{ config: ServerConfig; client: string; reject?: never } | { reject: NextResponse; config?: never; client?: never }> {
  const config = getServerConfig();

  if (!isSameOrigin(req.headers)) {
    return { reject: jsonError(403, "Cross-origin requests are not allowed") };
  }

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  // Single owner: every route but sign-in needs the owner's session. Without
  // ADMIN_PASSWORD nobody can sign in, so the app stays locked.
  const signedIn = config.auth !== null && (await verifySessionToken(session, config.auth));
  if (!opts.public && !signedIn) return { reject: jsonError(401, "Unauthorized") };

  // Without a trusted proxy there's no reliable client address. Signed-in
  // users then get a bucket per session (tokens are signed, so they can't be
  // made up), and everyone else shares one.
  let client = clientIp(req.headers, config.trustedProxyHops);
  if (client === SHARED_CLIENT && signedIn && session) client = `session:${session}`;
  if (client === SHARED_CLIENT && !warnedSharedBucket && process.env.NODE_ENV === "production") {
    warnedSharedBucket = true;
    console.warn(
      "[rate-limit] TRUSTED_PROXY_HOPS is 0, so clients without a session share one rate limit. Set it to the number of reverse proxies in front of the app.",
    );
  }

  if (opts.bucket === "login") return { config, client };

  const limit =
    opts.bucket === "realtime" ? Math.max(2, Math.floor(config.rateLimitPerMinute / 6)) : config.rateLimitPerMinute;
  const result = rateLimiter.check(`${opts.bucket}:${client}`, limit);
  if (!result.ok) {
    return {
      reject: jsonError(429, "Too many requests. Slow down a little.", {
        "Retry-After": String(result.retryAfterSeconds),
      }),
    };
  }

  return { config, client };
}

/**
 * The request body as text, or null when it is larger than `maxBytes`.
 * Checks the declared Content-Length first, then counts the bytes as they
 * arrive (a chunked request has no length, and the header can lie), and stops
 * reading as soon as the limit is passed.
 */
export async function readBody(req: Request, maxBytes: number): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && !(Number(declared) <= maxBytes)) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Read a JSON body of at most `maxBytes` and validate it against `schema`. */
export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T,
  maxBytes: number,
): Promise<{ data: z.infer<T>; error?: never } | { error: NextResponse; data?: never }> {
  let raw: string | null;
  try {
    raw = await readBody(req, maxBytes);
  } catch {
    return { error: jsonError(400, "Could not read the request body") };
  }
  if (raw === null) return { error: jsonError(413, "Request is too large") };

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { error: jsonError(400, "Invalid JSON body") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: jsonError(400, result.error.issues[0]?.message ?? "Invalid request") };
  }
  return { data: result.data };
}

export function providerErrorResponse(err: unknown, context: string) {
  if (err instanceof ProviderError) {
    console.error(`[${context}]`, err.message, err.detail ?? "");
    if (err.status === 503) return jsonError(503, err.message);
    if (err.status === 429) return jsonError(429, "The AI provider is rate limiting us. Try again shortly.");
    return jsonError(502, "The AI provider returned an error.");
  }
  console.error(`[${context}]`, err);
  return jsonError(500, "Something went wrong.");
}
