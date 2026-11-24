import { describe, expect, it, vi } from "vitest";
import { getAuthConfig, getServerConfig, isConfigured, parseTranscribeLanguage } from "@/lib/server/env";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("getServerConfig", () => {
  it("is unconfigured without an OpenAI key", () => {
    expect(isConfigured(getServerConfig(env({})))).toBe(false);
  });

  it("applies defaults and trims the base URL", () => {
    const { openai } = getServerConfig(env({ OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "http://localhost:11434/v1/" }));
    expect(openai).toMatchObject({
      apiKey: "sk-test",
      baseUrl: "http://localhost:11434/v1",
      chatModel: "gpt-5.4-mini",
      realtimeModel: "gpt-realtime-2.1-mini",
      transcribeModel: "gpt-4o-transcribe",
      transcribeLanguage: undefined,
    });
  });

  it("reads the transcription language", () => {
    const { openai } = getServerConfig(env({ OPENAI_API_KEY: "sk", TRANSCRIBE_LANGUAGE: "DE" }));
    expect(openai?.transcribeLanguage).toBe("de");
  });

  it("parses the password, session secret and rate limit", () => {
    const config = getServerConfig(env({ ADMIN_PASSWORD: " long-enough-pw ", RATE_LIMIT_PER_MINUTE: "5" }));
    expect(config.auth).toEqual({ password: "long-enough-pw", sessionSecret: null });
    const secret = "x".repeat(32);
    expect(getServerConfig(env({ ADMIN_PASSWORD: "long-enough-pw", SESSION_SECRET: secret })).auth?.sessionSecret).toBe(secret);
    expect(config.rateLimitPerMinute).toBe(5);
    expect(getServerConfig(env({ RATE_LIMIT_PER_MINUTE: "-1" })).rateLimitPerMinute).toBe(30);
  });

  it("refuses to sign anyone in with a missing or short password or secret", () => {
    expect(getAuthConfig(env({}))).toEqual({ auth: null, problem: "missing-password" });
    expect(getAuthConfig(env({ ADMIN_PASSWORD: "elevenchars" }))).toEqual({ auth: null, problem: "short-password" });
    expect(getAuthConfig(env({ ADMIN_PASSWORD: "twelve-chars" })).problem).toBeNull();
    expect(getAuthConfig(env({ ADMIN_PASSWORD: "twelve-chars", SESSION_SECRET: "short" }))).toEqual({
      auth: null,
      problem: "short-secret",
    });
    expect(getServerConfig(env({ ADMIN_PASSWORD: "short" })).auth).toBeNull();
  });

  it("caps call length, defaulting to 20 minutes", () => {
    expect(getServerConfig(env({})).callMaxMinutes).toBe(20);
    expect(getServerConfig(env({ CALL_MAX_MINUTES: "5" })).callMaxMinutes).toBe(5);
    expect(getServerConfig(env({ CALL_MAX_MINUTES: "0" })).callMaxMinutes).toBe(20);
  });

  it("normalises the transcription language and ignores invalid values", () => {
    expect(parseTranscribeLanguage("en-US")).toBe("en");
    expect(parseTranscribeLanguage("pt_BR")).toBe("pt");
    expect(parseTranscribeLanguage(undefined)).toBeUndefined();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseTranscribeLanguage("english")).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("trusts no proxy hops by default, one on known platforms, or what TRUSTED_PROXY_HOPS says", () => {
    expect(getServerConfig(env({})).trustedProxyHops).toBe(0);
    expect(getServerConfig(env({ VERCEL: "1" })).trustedProxyHops).toBe(1);
    for (const key of ["RENDER", "RAILWAY_ENVIRONMENT_NAME", "FLY_APP_NAME", "DYNO"]) {
      expect(getServerConfig(env({ [key]: "x" })).trustedProxyHops).toBe(1);
    }
    expect(getServerConfig(env({ VERCEL: "1", TRUSTED_PROXY_HOPS: "2" })).trustedProxyHops).toBe(2);
    expect(getServerConfig(env({ TRUSTED_PROXY_HOPS: "0", VERCEL: "1" })).trustedProxyHops).toBe(0);
  });
});
