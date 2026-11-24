import { describe, expect, it } from "vitest";
import { parseSse } from "@/lib/server/sse";

function streamOf(...chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}

describe("parseSse", () => {
  it("parses events split across chunks", async () => {
    const events = [];
    for await (const e of parseSse(streamOf("event: a\ndata: {\"x\"", ":1}\n\n: comment\n\ndata: [DONE]\n\n"))) events.push(e);
    expect(events).toEqual(['{"x":1}', "[DONE]"]);
  });

  it("handles CRLF and a trailing event without a blank line", async () => {
    const events = [];
    for await (const e of parseSse(streamOf("data: one\r\n\r\ndata: two"))) events.push(e);
    expect(events).toEqual(["one", "two"]);
  });
});
