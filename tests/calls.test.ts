import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "@/app/api/realtime/route";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { callIdFromLocation, callRegistry, createCallRegistry, HANGUP_GRACE_MS, MAX_ACTIVE_CALLS } from "@/lib/server/calls";

describe("callIdFromLocation", () => {
  it.each([
    ["/v1/realtime/calls/rtc_abc123", "rtc_abc123"],
    ["https://api.openai.com/v1/realtime/calls/rtc_X-9", "rtc_X-9"],
    ["/v1/realtime/calls/", null],
    ["/v1/realtime/calls/rtc_a?x=1", "rtc_a"],
    ["/v1/realtime/calls/bad%20id", null],
    [null, null],
  ])("%s -> %s", (location, id) => {
    expect(callIdFromLocation(location)).toBe(id);
  });
});

describe("call registry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows at most maxActive calls and frees slots on hangup, timeout or failure", () => {
    const calls = createCallRegistry(2);
    const onTimeout = vi.fn();
    const a = calls.reserve()!;
    const b = calls.reserve()!;
    expect(calls.reserve()).toBeNull();

    calls.release(b); // failed to start
    const c = calls.reserve()!;
    calls.started(a, "rtc_a", 1000, onTimeout);
    calls.started(c, "rtc_c", 5000, onTimeout);
    expect(calls.reserve()).toBeNull();

    expect(calls.ended("rtc_c")).toBe(true);
    expect(calls.ended("rtc_c")).toBe(false);
    expect(calls.active).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith("rtc_a");
    expect(calls.active).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(onTimeout).toHaveBeenCalledOnce(); // the call that was hung up early doesn't time out
  });
});

describe("/api/realtime", () => {
  const auth = { password: "realtime-test-pw", sessionSecret: null };
  const sdp = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n";
  let cookie = "";
  let callCount = 0;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubEnv("ADMIN_PASSWORD", auth.password);
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("CALL_MAX_MINUTES", "1");
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "600");
    cookie = `${SESSION_COOKIE}=${await createSessionToken(auth)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/hangup")
          ? new Response(null, { status: 200 })
          : new Response("v=0 answer", { status: 201, headers: { Location: `/v1/realtime/calls/rtc_${++callCount}` } }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const start = () =>
    POST(
      new NextRequest("http://localhost:3000/api/realtime", {
        method: "POST",
        headers: { host: "localhost:3000", cookie, "content-type": "application/json" },
        body: JSON.stringify({ personaId: "seed-skeptic", sdp }),
      }),
    );
  const end = (callId: string) =>
    DELETE(
      new NextRequest("http://localhost:3000/api/realtime", {
        method: "DELETE",
        headers: { host: "localhost:3000", cookie, "content-type": "application/json" },
        body: JSON.stringify({ callId }),
      }),
    );
  const hangups = () =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/hangup")).map(([url]) => String(url));

  it("caps concurrent calls, frees a slot when the browser hangs up, and hangs up at the time limit", async () => {
    expect(callRegistry.active).toBe(0);
    const first = await start();
    expect(first.status).toBe(200);
    const firstId = first.headers.get("x-call-id")!;
    expect(await first.text()).toBe("v=0 answer");

    const second = await start();
    expect(second.status).toBe(200);
    expect(MAX_ACTIVE_CALLS).toBe(2);
    expect((await start()).status).toBe(409);

    // The browser ends the first call: its slot opens and OpenAI is told to hang up.
    expect((await end(firstId)).status).toBe(204);
    expect(hangups()).toEqual([`https://api.openai.com/v1/realtime/calls/${firstId}/hangup`]);
    expect((await end(firstId)).status).toBe(404);

    const third = await start();
    expect(third.status).toBe(200);

    // Nobody hangs up: the server does once CALL_MAX_MINUTES (plus grace) is up.
    await vi.advanceTimersByTimeAsync(60_000 + HANGUP_GRACE_MS);
    expect(hangups()).toHaveLength(3);
    expect(callRegistry.active).toBe(0);
  });

  it("frees the slot when OpenAI refuses the call", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await start()).status).toBe(502);
    expect(callRegistry.active).toBe(0);
  });
});
