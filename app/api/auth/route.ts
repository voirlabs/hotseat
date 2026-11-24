import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, passwordsMatch, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { loginRequestSchema } from "@/lib/schemas";
import { guard, jsonError, parseJson } from "@/lib/server/api";
import { loginThrottle } from "@/lib/server/rate-limit";
import { secureCookie } from "@/lib/server/request";
import { APP_URL } from "@/lib/site";

/** A password of at most 256 characters, as JSON. */
const MAX_BODY_BYTES = 2_000;

export async function POST(req: NextRequest) {
  const { config, client, reject } = await guard(req, { bucket: "login", public: true });
  if (reject) return reject;
  if (!config.auth) return jsonError(503, "Sign-in isn't set up on the server. Reload the sign-in page for details.");

  const { data, error } = await parseJson(req, loginRequestSchema, MAX_BODY_BYTES);
  if (error) return error;

  const allowed = loginThrottle.check(client);
  if (!allowed.ok) {
    return jsonError(429, "Too many failed sign-ins. Wait a little, then try again.", {
      "Retry-After": String(allowed.retryAfterSeconds),
    });
  }

  if (!(await passwordsMatch(data.password, config.auth.password))) {
    loginThrottle.failed(client);
    return jsonError(401, "Wrong password.");
  }
  loginThrottle.succeeded(client);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(config.auth), {
    httpOnly: true,
    secure: secureCookie(req.headers, req.nextUrl, APP_URL),
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  // Not the login bucket: a flood of login attempts must not block logging out.
  const { reject } = await guard(req, { bucket: "api", public: true });
  if (reject) return reject;
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
