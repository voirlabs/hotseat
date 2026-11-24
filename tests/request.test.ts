import { describe, expect, it } from "vitest";
import { isHttps, isSameOrigin, secureCookie } from "@/lib/server/request";

const h = (init: Record<string, string>) => new Headers(init);

describe("isSameOrigin", () => {
  it("accepts a same-host origin, whatever the scheme the app sees", () => {
    expect(isSameOrigin(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://app.example.com", host: "app.example.com" }))).toBe(true);
  });

  it("uses the forwarded host behind a proxy", () => {
    expect(
      isSameOrigin(h({ origin: "https://app.example.com", host: "10.0.0.5:3000", "x-forwarded-host": "app.example.com" })),
    ).toBe(true);
  });

  it("rejects other origins", () => {
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "https://app.example.com.evil.example", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "app.example.com" }))).toBe(false);
  });

  it("rejects requests the browser marks as cross-site", () => {
    expect(isSameOrigin(h({ "sec-fetch-site": "cross-site", host: "app.example.com" }))).toBe(false);
  });

  it("lets non-browser clients without an Origin through", () => {
    expect(isSameOrigin(h({ host: "app.example.com" }))).toBe(true);
  });
});

describe("isHttps", () => {
  it("prefers the forwarded protocol", () => {
    expect(isHttps(h({ "x-forwarded-proto": "https" }), new URL("http://internal:3000/"))).toBe(true);
    expect(isHttps(h({ "x-forwarded-proto": "http" }), new URL("https://example.com/"))).toBe(false);
  });

  it("falls back to the request URL", () => {
    expect(isHttps(h({}), new URL("https://example.com/"))).toBe(true);
    expect(isHttps(h({}), new URL("http://192.168.1.10:3000/"))).toBe(false);
  });
});

describe("secureCookie", () => {
  const internal = new URL("http://internal:3000/");

  it("is secure whenever the public URL is https, even without X-Forwarded-Proto", () => {
    expect(secureCookie(h({}), internal, "https://hotseat.example.com")).toBe(true);
  });

  it("otherwise follows the connection", () => {
    expect(secureCookie(h({ "x-forwarded-proto": "https" }), internal, "http://localhost:3000")).toBe(true);
    expect(secureCookie(h({}), new URL("http://192.168.1.10:3000/"), "http://localhost:3000")).toBe(false);
  });
});
