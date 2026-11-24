import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { proxy, PUBLIC_PATHS } from "@/proxy";

const auth = { password: "proxy-test-password", sessionSecret: null };
const get = (path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", auth.password);
  vi.stubEnv("SESSION_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("lets the login flow and brand assets through without a session", async () => {
    for (const path of PUBLIC_PATHS) {
      const res = await get(path);
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("matches public paths exactly", async () => {
    for (const path of ["/login/../room/x", "/loginx", "/api/auth/other", "/logo.svg/x"]) {
      const res = await get(path);
      expect(res.headers.get("x-middleware-next"), path).toBeNull();
    }
  });

  it("sends pages to the login page and answers 401 on API routes", async () => {
    const page = await get("/room/seed-skeptic?x=1");
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost:3000/login?next=%2Froom%2Fseed-skeptic%3Fx%3D1");
    expect((await get("/api/chat")).status).toBe(401);
  });

  it("opens everything with a valid session and skips the login page", async () => {
    const cookie = `${SESSION_COOKIE}=${await createSessionToken(auth)}`;
    expect((await get("/room/seed-skeptic", { cookie })).headers.get("x-middleware-next")).toBe("1");
    const login = await get("/login?next=/room/seed-skeptic", { cookie });
    expect(login.headers.get("location")).toBe("http://localhost:3000/room/seed-skeptic");
  });

  it("stays locked when the password is too short", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "short");
    const cookie = `${SESSION_COOKIE}=${await createSessionToken({ password: "short", sessionSecret: null })}`;
    expect((await get("/", { cookie })).status).toBe(307);
  });

  it("sends HSTS only over https", async () => {
    expect((await get("/login")).headers.get("strict-transport-security")).toBeNull();
    const res = await get("/login", { "x-forwarded-proto": "https" });
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });
});
