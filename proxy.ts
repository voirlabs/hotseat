import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getAuthConfig } from "@/lib/server/env";
import { isHttps } from "@/lib/server/request";

/** Paths that stay reachable without a session, matched exactly: the login flow and brand assets. */
export const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth",
  "/robots.txt",
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/opengraph-image.png",
  "/logo.svg",
]);

/**
 * Page-level gate: everything but sign-in needs the owner's session (from
 * ADMIN_PASSWORD; without it nothing opens). API routes enforce the same check
 * themselves (see lib/server/api.ts), so this is not the only line of defence.
 */
export async function proxy(req: NextRequest) {
  return withHsts(req, await gate(req));
}

async function gate(req: NextRequest) {
  const { auth } = getAuthConfig();
  const { pathname, search } = req.nextUrl;
  const authed = auth !== null && (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, auth));

  if (pathname === "/login" && authed) {
    return NextResponse.redirect(new URL(safeRedirectPath(req.nextUrl.searchParams.get("next")), req.url));
  }
  if (authed || PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

/**
 * HSTS, only when the browser reached us over https: sent over plain http
 * (local or LAN use) it would be ignored anyway. Without `includeSubDomains`
 * or `preload`, so it never affects other sites on the owner's domain.
 */
function withHsts(req: NextRequest, res: NextResponse) {
  if (isHttps(req.headers, req.nextUrl)) res.headers.set("Strict-Transport-Security", "max-age=31536000");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
