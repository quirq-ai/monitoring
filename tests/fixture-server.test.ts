import { describe, expect, it } from "vitest";
import { renderTokens } from "./fixtures/server.mjs";

describe("fixture server tokens", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("renders relative times and days", () => {
    expect(renderTokens("{{now}}", now)).toBe("2026-10-06T12:00:00Z");
    expect(renderTokens("{{now-90m}}", now)).toBe("2026-10-06T10:30:00Z");
    expect(renderTokens("{{now-2d}}", now)).toBe("2026-10-04T12:00:00Z");
    expect(renderTokens("runs/{{today}}.json", now)).toBe("runs/2026-10-06.json");
    expect(renderTokens("{{yesterday}}", now)).toBe("2026-10-05");
    expect(renderTokens("plain", now)).toBe("plain");
  });
});
