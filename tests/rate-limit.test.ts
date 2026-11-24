import { describe, expect, it } from "vitest";
import { clientIp, clientKey, createLoginThrottle, createRateLimiter, SHARED_CLIENT } from "@/lib/server/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit, then blocks until the window resets", () => {
    const limiter = createRateLimiter(1000);
    const t = 0;
    expect(limiter.check("a", 2, t).ok).toBe(true);
    expect(limiter.check("a", 2, t).ok).toBe(true);
    const blocked = limiter.check("a", 2, t + 100);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check("b", 2, t).ok).toBe(true);
    expect(limiter.check("a", 2, t + 1000).ok).toBe(true);
  });

  it("stays bounded when flooded with new keys inside one window", () => {
    const limiter = createRateLimiter(60_000, 3);
    limiter.check("a", 1, 0);
    expect(limiter.check("a", 1, 0).ok).toBe(false);
    for (const key of ["b", "c", "d", "e"]) limiter.check(key, 1, 0);
    // "a" was the oldest window, so it was evicted and starts fresh.
    expect(limiter.check("a", 1, 0).ok).toBe(true);
    // "e" was kept.
    expect(limiter.check("e", 1, 0).ok).toBe(false);
  });
});

describe("clientIp", () => {
  const xff = (value: string) => new Headers({ "x-forwarded-for": value });

  it("ignores forwarding headers when no proxy is trusted", () => {
    expect(clientIp(xff("1.2.3.4"), 0)).toBe("direct");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }), 0)).toBe("direct");
  });

  it("takes the address appended by the outermost trusted proxy", () => {
    expect(clientIp(xff("1.2.3.4"), 1)).toBe("1.2.3.4");
    expect(clientIp(xff("6.6.6.6, 1.2.3.4"), 1)).toBe("1.2.3.4");
    expect(clientIp(xff("6.6.6.6, 1.2.3.4, 10.0.0.1"), 2)).toBe("1.2.3.4");
  });

  it("can't be spoofed by prepending addresses", () => {
    const real = clientIp(xff("1.2.3.4"), 1);
    expect(clientIp(xff("9.9.9.9, 8.8.8.8, 1.2.3.4"), 1)).toBe(real);
  });

  it("groups IPv6 clients by /64", () => {
    expect(clientIp(xff("2001:db8:1:2:aaaa::1"), 1)).toBe("2001:db8:1:2::/64");
    expect(clientIp(xff("2001:db8:1:2:bbbb:cccc:dddd:eeee"), 1)).toBe("2001:db8:1:2::/64");
  });

  it("falls back to the leftmost entry when there are fewer hops than trusted", () => {
    expect(clientIp(xff("1.2.3.4"), 3)).toBe("1.2.3.4");
    expect(clientIp(new Headers(), 1)).toBe("unknown");
  });
});

describe("clientKey", () => {
  it.each([
    ["1.2.3.4", "1.2.3.4"],
    ["2001:DB8:0001:0002:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["[2001:db8:1:2::9]:443", "2001:db8:1:2::/64"],
    ["::ffff:1.2.3.4", "1.2.3.4"],
    ["not-an-ip", "not-an-ip"],
  ])("%s -> %s", (ip, key) => {
    expect(clientKey(ip)).toBe(key);
  });
});

describe("login throttle", () => {
  const options = { perClient: 3, clientWindowMs: 60_000, globalBudget: 5, globalWindowMs: 3_600_000, maxBackoffMs: 8_000 };

  it("counts only failures, per client", () => {
    const t = createLoginThrottle(options);
    for (let i = 0; i < 20; i++) expect(t.check("a", 0).ok).toBe(true); // checks alone never count
    for (let i = 0; i < 3; i++) t.failed("a", 0);
    const blocked = t.check("a", 1000);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 59 });
    expect(t.check("b", 1000).ok).toBe(true);
    expect(t.check("a", 60_000).ok).toBe(true);
  });

  it("clears a client's failures when it signs in", () => {
    const t = createLoginThrottle(options);
    for (let i = 0; i < 2; i++) t.failed("a", 0);
    t.succeeded("a");
    t.failed("a", 0);
    t.failed("a", 0);
    expect(t.check("a", 0).ok).toBe(true);
  });

  it("never locks out the shared key, but backs off globally once the budget is spent", () => {
    const t = createLoginThrottle(options);
    for (let i = 0; i < 4; i++) t.failed(SHARED_CLIENT, 0);
    expect(t.check(SHARED_CLIENT, 0).ok).toBe(true);
    t.failed(SHARED_CLIENT, 0); // budget of 5 spent

    // One attempt per backoff period, doubling up to maxBackoffMs.
    expect(t.check(SHARED_CLIENT, 10).ok).toBe(true);
    expect(t.check(SHARED_CLIENT, 20)).toEqual({ ok: false, retryAfterSeconds: 1 });
    t.failed(SHARED_CLIENT, 20);
    expect(t.check(SHARED_CLIENT, 1500).ok).toBe(false);
    expect(t.check(SHARED_CLIENT, 2010).ok).toBe(true);
    for (let i = 0; i < 10; i++) t.failed(SHARED_CLIENT, 2010);
    expect(t.check(SHARED_CLIENT, 9000).ok).toBe(false);
    expect(t.check(SHARED_CLIENT, 10_010).ok).toBe(true); // capped at 8 s

    // The budget applies to everyone together, not just one key.
    expect(t.check("other", 10_020).ok).toBe(false);
    // Failures older than the window no longer count.
    expect(t.check("other", 3_700_000).ok).toBe(true);
  });

  it("lifts the global backoff after a correct password", () => {
    const t = createLoginThrottle(options);
    for (let i = 0; i < 6; i++) t.failed("x", 0);
    expect(t.check("y", 0).ok).toBe(true);
    expect(t.check("y", 0).ok).toBe(false);
    t.succeeded("y");
    expect(t.check("y", 0).ok).toBe(true);
    expect(t.check("y", 0).ok).toBe(true);
  });
});
