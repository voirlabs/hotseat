/**
 * Request checks that don't depend on Next.js, so they can be unit tested.
 */

/**
 * CSRF check for mutations. Browsers send Origin on every POST and DELETE;
 * it must name this host. Only the host is compared, not the scheme, because
 * behind a TLS-terminating proxy the app itself sees plain http. Requests
 * without Origin come from non-browser clients and can't carry a victim's
 * cookies, so they pass.
 */
export function isSameOrigin(headers: Headers): boolean {
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (origin === null) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // includes the literal "null" origin of sandboxed frames
  }
  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host"));
  return host !== undefined && originHost === host;
}

/** Whether the browser reached us over https, directly or through a proxy. */
export function isHttps(headers: Headers, url: URL): boolean {
  return (firstValue(headers.get("x-forwarded-proto")) ?? url.protocol.replace(/:$/, "")) === "https";
}

/**
 * Whether the session cookie gets the Secure flag: always when the public URL
 * (NEXT_PUBLIC_APP_URL) is https, even if a proxy forgets X-Forwarded-Proto.
 * Otherwise follow the connection: a Secure cookie is silently dropped on
 * plain http (say, `pnpm start` on a LAN address), which would bounce the
 * owner back to the login page forever.
 */
export function secureCookie(headers: Headers, url: URL, appUrl: string): boolean {
  return appUrl.startsWith("https://") || isHttps(headers, url);
}

function firstValue(header: string | null): string | undefined {
  return header?.split(",")[0]?.trim() || undefined;
}
