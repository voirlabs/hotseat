import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personas, personaSchema } from "@/lib/personas";

const dir = join(process.cwd(), "personas");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("personas", () => {
  it.each(files)("%s is valid and its id matches the file name", (file) => {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const result = personaSchema.safeParse(raw);
    expect(result.success, result.success ? "" : result.error.message).toBe(true);
    expect(result.data?.id).toBe(file.replace(/\.json$/, ""));
  });

  it("registers every persona file in lib/personas/index.ts", () => {
    const registered = new Set(personas.map((p) => p.id));
    for (const file of files) expect(registered, `${file} is not imported`).toContain(file.replace(/\.json$/, ""));
  });

  it("rejects an unknown TTS voice", () => {
    const raw = JSON.parse(readFileSync(join(dir, files[0]!), "utf8"));
    expect(personaSchema.safeParse({ ...raw, voice: { openai: "morgan-freeman" } }).success).toBe(false);
  });

  it("has unique ids", () => {
    const ids = personas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
