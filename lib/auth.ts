/**
 * Stateless session cookies signed with HMAC-SHA256 (Web Crypto, so it runs
 * in both route handlers and the proxy).
 *
 * The signing key depends on ADMIN_PASSWORD and, when set, SESSION_SECRET, so
 * changing either one signs every session out. With SESSION_SECRET the key is
 * an HMAC of the password under the secret. Without it the key is derived
 * from the password with PBKDF2, so a leaked cookie can't be used to guess the
 * password quickly. Signing out deletes the cookie in the browser; a copied
 * cookie stays valid until it expires or the password or secret changes.
 */

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** What the signing key is made from (AuthConfig in lib/server/env.ts). */
interface SessionKeySource {
  password: string;
  sessionSecret: string | null;
}

const TOKEN_VERSION = "v2";
/** OWASP's 2023 recommendation for PBKDF2-HMAC-SHA256. Runs once per process. */
export const PBKDF2_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(material: BufferSource, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, usages);
}

async function deriveKey({ password, sessionSecret }: SessionKeySource): Promise<CryptoKey> {
  let material: ArrayBuffer;
  if (sessionSecret) {
    const secretKey = await hmacKey(encoder.encode(sessionSecret), ["sign"]);
    material = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(`session/v2:${password}`));
  } else {
    const base = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    material = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode("hotseat/session/v2"), iterations: PBKDF2_ITERATIONS },
      base,
      256,
    );
  }
  return hmacKey(material, ["sign", "verify"]);
}

/** The signing key, derived once per password and secret. */
function sessionKey(source: SessionKeySource): Promise<CryptoKey> {
  const id = `${source.sessionSecret ?? ""}\u0000${source.password}`;
  let key = keyCache.get(id);
  if (!key) {
    // Settings rarely change, so a few entries are plenty.
    if (keyCache.size >= 4) keyCache.delete(keyCache.keys().next().value!);
    key = deriveKey(source);
    key.catch(() => keyCache.delete(id));
    keyCache.set(id, key);
  }
  return key;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** A token `v2.<expires>.<nonce>.<signature>`; the random nonce makes every sign-in's token unique. */
export async function createSessionToken(source: SessionKeySource, now = Date.now()): Promise<string> {
  const expires = now + SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${TOKEN_VERSION}.${expires}.${nonce}`;
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(source), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  source: SessionKeySource,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, expiresRaw, nonce, signatureRaw] = parts as [string, string, string, string];
  if (version !== TOKEN_VERSION || !expiresRaw || !nonce || !signatureRaw) return false;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires <= now) return false;

  const signature = fromBase64Url(signatureRaw);
  if (!signature) return false;

  return crypto.subtle.verify(
    "HMAC",
    await sessionKey(source),
    signature,
    encoder.encode(`${version}.${expiresRaw}.${nonce}`),
  );
}

/** Constant-time password comparison (compares SHA-256 digests). */
export async function passwordsMatch(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/**
 * Only allow same-origin relative redirects after login. Backslashes and
 * control characters are rejected because browsers strip or reinterpret
 * them; the rest is resolved against a placeholder origin to catch "//host".
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.includes("\\") || hasControlChars(value)) return "/";
  const base = "http://placeholder.invalid";
  try {
    const url = new URL(value, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
