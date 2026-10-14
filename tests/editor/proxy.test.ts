import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

// In gh mode every page reads through the person's gh login, so a DNS-rebinding page (any Host
// that is not loopback) is refused before anything renders or reads.

const at = (host: string) => proxy(new NextRequest("http://127.0.0.1:3020/settings", { headers: { host } }));

afterEach(() => {
  delete process.env.MONITORING_EDITOR;
  delete process.env.VERCEL;
});

describe("proxy", () => {
  it("refuses a page or server function whose Host is not loopback, in gh mode only", async () => {
    expect(at("evil.example:3020").status).toBe(200);
    process.env.MONITORING_EDITOR = "gh";
    const refused = at("evil.example:3020");
    expect(refused.status).toBe(403);
    expect(await refused.text()).toMatch(/only at 127\.0\.0\.1/);
    expect(at("127.0.0.1.evil.example:3020").status).toBe(403);
    expect(at("127.0.0.1:3020").status).toBe(200);
    expect(at("localhost:3020").status).toBe(200);
    process.env.VERCEL = "1";
    expect(at("evil.example:3020").status).toBe(200);
  });
});
