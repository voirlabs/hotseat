/**
 * Fixed-window, in-memory rate limiter.
 *
 * This protects a single instance. On serverless platforms each instance
 * keeps its own counters, so treat it as a speed bump rather than a hard
 * quota, and set spend limits on your OpenAI account as well.
 */

interface Window {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

interface RateLimiter {
  check(key: string, limit: number, now?: number): RateLimitResult;
}

export function createRateLimiter(windowMs = 60_000, maxKeys = 10_000): RateLimiter {
  const windows = new Map<string, Window>();

  return {
    check(key, limit, now = Date.now()) {
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        windows.delete(key);
        if (windows.size >= maxKeys) {
          for (const [k, old] of windows) if (old.resetAt <= now) windows.delete(k);
          // Still full: drop the oldest windows. Maps iterate in insertion order.
          for (const k of windows.keys()) {
            if (windows.size < maxKeys) break;
            windows.delete(k);
          }
        }
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }

      w.count += 1;
      const ok = w.count <= limit;
      return { ok, retryAfterSeconds: ok ? 0 : Math.ceil((w.resetAt - now) / 1000) };
    },
  };
}

const globalForLimiter = globalThis as unknown as { __rateLimiter?: RateLimiter };
export const rateLimiter = (globalForLimiter.__rateLimiter ??= createRateLimiter());

export const SHARED_CLIENT = "direct";

/**
 * The client address for rate limiting. Each trusted proxy appends the
 * address it received the request from to X-Forwarded-For, so the client is
 * the entry `trustedProxyHops` from the end. Anything to the left of that was
 * sent by the client and can be spoofed. With no trusted proxies there is no
 * reliable address, so every request gets SHARED_CLIENT.
 */
export function clientIp(headers: Headers, trustedProxyHops: number): string {
  if (trustedProxyHops <= 0) return SHARED_CLIENT;
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = hops[Math.max(0, hops.length - trustedProxyHops)];
  return ip ? clientKey(ip) : "unknown";
}

/**
 * One key per client: IPv4 addresses as they are, IPv6 addresses by their /64
 * prefix, since one machine usually holds a whole /64 and could rotate through
 * it to dodge a per-address limit. IPv4-mapped IPv6 addresses count as IPv4.
 */
export function clientKey(ip: string): string {
  const addr = ip.trim().toLowerCase().replace(/^\[|\](:\d+)?$/g, "").replace(/%.*$/, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (mapped) return mapped[1]!;
  if (!addr.includes(":")) return addr;

  const [head = "", tail] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return addr;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

interface LoginThrottleOptions {
  /** Failed attempts one client may make per window before it is blocked. */
  perClient: number;
  clientWindowMs: number;
  /** Failed attempts from everyone together per window before backoff starts. */
  globalBudget: number;
  globalWindowMs: number;
  /** Longest wait between attempts once the global budget is spent. */
  maxBackoffMs: number;
}

const LOGIN_DEFAULTS: LoginThrottleOptions = {
  perClient: 10,
  clientWindowMs: 15 * 60_000,
  globalBudget: 50,
  globalWindowMs: 60 * 60_000,
  maxBackoffMs: 60_000,
};

/**
 * Limits failed sign-ins; successful ones are never counted.
 *
 * Each client may fail `perClient` times per window. On top of that, once
 * everyone together has failed `globalBudget` times in the last window, only
 * one attempt is allowed per backoff period, doubling from one second up to
 * `maxBackoffMs`. The owner can still sign in by waiting at most that long,
 * while a guesser spread over many addresses gets about one try a minute.
 * Clients without a reliable address (SHARED_CLIENT) share one key, so the
 * per-client limit doesn't apply to them: an attacker on that key could
 * otherwise lock the owner out. They get only the global backoff.
 */
export function createLoginThrottle(options: Partial<LoginThrottleOptions> = {}) {
  const o = { ...LOGIN_DEFAULTS, ...options };
  const clients = new Map<string, Window>();
  let failures: number[] = [];
  let lastAttemptAt = -Infinity;

  return {
    /** Call before checking a password. */
    check(client: string, now = Date.now()): RateLimitResult {
      const mine = clients.get(client);
      if (client !== SHARED_CLIENT && mine && mine.resetAt > now && mine.count >= o.perClient) {
        return { ok: false, retryAfterSeconds: Math.ceil((mine.resetAt - now) / 1000) };
      }
      failures = failures.filter((t) => t > now - o.globalWindowMs);
      const over = failures.length - o.globalBudget;
      if (over >= 0) {
        const backoff = Math.min(o.maxBackoffMs, 1000 * 2 ** Math.min(over, 30));
        const wait = lastAttemptAt + backoff - now;
        if (wait > 0) return { ok: false, retryAfterSeconds: Math.ceil(wait / 1000) };
        lastAttemptAt = now;
      }
      return { ok: true, retryAfterSeconds: 0 };
    },

    /** Record a wrong password. */
    failed(client: string, now = Date.now()) {
      failures.push(now);
      // Enough to know the budget is spent and the backoff is at its cap; older entries add nothing.
      if (failures.length > o.globalBudget + 64) failures = failures.slice(-o.globalBudget - 32);
      if (client === SHARED_CLIENT) return;
      let w = clients.get(client);
      if (!w || w.resetAt <= now) {
        if (clients.size >= 10_000) {
          for (const [k, old] of clients) if (old.resetAt <= now) clients.delete(k);
          if (clients.size >= 10_000) clients.delete(clients.keys().next().value!);
        }
        w = { count: 0, resetAt: now + o.clientWindowMs };
        clients.set(client, w);
      }
      w.count += 1;
    },

    /** The right password: only the owner knows it, so clear the counters. */
    succeeded(client: string) {
      clients.delete(client);
      failures = [];
      lastAttemptAt = -Infinity;
    },
  };
}

const globalForLogin = globalThis as unknown as { __loginThrottle?: ReturnType<typeof createLoginThrottle> };
export const loginThrottle = (globalForLogin.__loginThrottle ??= createLoginThrottle());
