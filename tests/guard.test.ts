import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { guard, parseJson, readBody } from "@/lib/server/api";
import { loginRequestSchema } from "@/lib/schemas";

const URL_ = "http://localhost:3000/api/chat";

function request(headers: Record<string, string> = {}) {
  return new NextRequest(URL_, { method: "POST", headers: { host: "localhost:3000", ...headers } });
}

afterEach(() => vi.unstubAllEnvs());

describe("guard", () => {
  it("rejects cross-origin requests", async () => {
    const { reject } = await guard(request({ origin: "https://evil.example" }), { bucket: "api" });
    expect(reject?.status).toBe(403);
  });

  it("requires the owner's session, except on public routes", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw-guard-one-1");
    expect((await guard(request(), { bucket: "api" })).reject?.status).toBe(401);
    expect((await guard(request(), { bucket: "login", public: true })).reject).toBeUndefined();
  });

  it("stays locked when ADMIN_PASSWORD is not set or too short", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect((await guard(request(), { bucket: "api" })).reject?.status).toBe(401);
    vi.stubEnv("ADMIN_PASSWORD", "short");
    const cookie = `${SESSION_COOKIE}=${await createSessionToken({ password: "short", sessionSecret: null })}`;
    expect((await guard(request({ cookie }), { bucket: "api" })).reject?.status).toBe(401);
  });

  it("never rate-limits the login bucket itself (the route counts failures)", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw-guard-login");
    for (let i = 0; i < 30; i++) {
      expect((await guard(request(), { bucket: "login", public: true })).reject).toBeUndefined();
    }
  });

  it("gives each signed-in session its own bucket when the client IP is unknown", async () => {
    const auth = { password: "pw-guard-two-2", sessionSecret: "k".repeat(32) };
    vi.stubEnv("ADMIN_PASSWORD", auth.password);
    vi.stubEnv("SESSION_SECRET", auth.sessionSecret);
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "2");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    const noisy = `${SESSION_COOKIE}=${await createSessionToken(auth)}`;
    const quiet = `${SESSION_COOKIE}=${await createSessionToken(auth)}`;

    for (let i = 0; i < 2; i++) expect((await guard(request({ cookie: noisy }), { bucket: "api" })).reject).toBeUndefined();
    expect((await guard(request({ cookie: noisy }), { bucket: "api" })).reject?.status).toBe(429);
    expect((await guard(request({ cookie: quiet }), { bucket: "api" })).reject).toBeUndefined();
  });
});

describe("body size limits", () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request(URL_, { method: "POST", body, headers, duplex: "half" } as RequestInit);

  it("reads bodies within the limit", async () => {
    expect(await readBody(post("hello"), 5)).toBe("hello");
    const { data } = await parseJson(post(JSON.stringify({ password: "x" })), loginRequestSchema, 100);
    expect(data).toEqual({ password: "x" });
  });

  it("rejects a declared Content-Length over the limit without reading", async () => {
    const req = post("{}", { "content-length": "5000" });
    expect(await readBody(req, 100)).toBeNull();
    expect(req.bodyUsed).toBe(false);
  });

  it("counts the bytes actually sent when there is no Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(50));
        controller.close();
      },
    });
    expect(await readBody(post(stream), 100)).toBeNull();
  });

  it("counts bytes, not characters", async () => {
    expect(await readBody(post("é".repeat(60)), 100)).toBeNull();
  });

  it("answers 413 for oversized JSON and 400 for invalid JSON", async () => {
    expect((await parseJson(post("x".repeat(200)), loginRequestSchema, 100)).error?.status).toBe(413);
    expect((await parseJson(post("{"), loginRequestSchema, 100)).error?.status).toBe(400);
  });
});
