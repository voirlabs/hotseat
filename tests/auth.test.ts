import { describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  passwordsMatch,
  PBKDF2_ITERATIONS,
  safeRedirectPath,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from "@/lib/auth";

const withSecret = { password: "hunter2-hunter2", sessionSecret: "s".repeat(32) };
const withoutSecret = { password: "hunter2-hunter2", sessionSecret: null };

describe("session tokens", () => {
  it.each([
    ["with SESSION_SECRET", withSecret],
    ["with the PBKDF2-derived key", withoutSecret],
  ])("verifies a fresh token %s", async (_, source) => {
    const token = await createSessionToken(source);
    expect(token.split(".")[0]).toBe("v2");
    expect(await verifySessionToken(token, source)).toBe(true);
  });

  it("is revoked by changing the password or the secret", async () => {
    const token = await createSessionToken(withSecret);
    expect(await verifySessionToken(token, { ...withSecret, password: "another-password" })).toBe(false);
    expect(await verifySessionToken(token, { ...withSecret, sessionSecret: "t".repeat(32) })).toBe(false);
    expect(await verifySessionToken(token, withoutSecret)).toBe(false);
  });

  it("gives every sign-in a different token", async () => {
    const now = Date.now();
    expect(await createSessionToken(withSecret, now)).not.toBe(await createSessionToken(withSecret, now));
  });

  it("derives the key without a secret with slow PBKDF2, once", async () => {
    const derive = vi.spyOn(crypto.subtle, "deriveBits");
    const source = { password: "a-fresh-password-1", sessionSecret: null };
    await createSessionToken(source);
    await createSessionToken(source);
    expect(derive).toHaveBeenCalledOnce();
    expect(derive.mock.calls[0]![0]).toMatchObject({ name: "PBKDF2", iterations: PBKDF2_ITERATIONS });
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    derive.mockRestore();
  });

  it("rejects expired tokens", async () => {
    const now = Date.now();
    const token = await createSessionToken(withSecret, now);
    expect(await verifySessionToken(token, withSecret, now + SESSION_MAX_AGE_SECONDS * 1000 + 1)).toBe(false);
  });

  it("rejects tampered tokens, old v1 tokens and garbage", async () => {
    const token = await createSessionToken(withSecret);
    const [v, exp, nonce, sig] = token.split(".");
    expect(await verifySessionToken(`${v}.${Number(exp) + 1000}.${nonce}.${sig}`, withSecret)).toBe(false);
    expect(await verifySessionToken(`${v}.${exp}.other.${sig}`, withSecret)).toBe(false);
    expect(await verifySessionToken(`v1.${exp}.${sig}`, withSecret)).toBe(false);
    expect(await verifySessionToken("nope", withSecret)).toBe(false);
    expect(await verifySessionToken(undefined, withSecret)).toBe(false);
    expect(await verifySessionToken("v2.9999999999999.x.!!!", withSecret)).toBe(false);
  });
});

describe("passwordsMatch", () => {
  it("compares exactly", async () => {
    expect(await passwordsMatch("abc", "abc")).toBe(true);
    expect(await passwordsMatch("abc", "abcd")).toBe(false);
    expect(await passwordsMatch("", "abc")).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/room/seed-skeptic", "/room/seed-skeptic"],
    ["/room/seed-skeptic?x=1#top", "/room/seed-skeptic?x=1#top"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/\\/evil.com", "/"],
    ["/\t/evil.com", "/"],
    ["/\n/evil.com", "/"],
    ["/\r//evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["", "/"],
    [null, "/"],
    [undefined, "/"],
  ])("%j -> %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it("blocks the decoded tab-smuggled redirect from a query string", () => {
    const next = new URLSearchParams("next=/%09/evil.com").get("next");
    expect(safeRedirectPath(next)).toBe("/");
  });
});
