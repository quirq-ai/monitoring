import { NextResponse, type NextRequest } from "next/server";
import { NO_FRAMING_CSP } from "@/config/framing";
import { editorMode, refuseRead } from "@/lib/editor/mode";

// Only does anything when the settings editor runs on a person's machine (`pnpm editor`): then
// every page may read through their gh login, so a request whose Host is not loopback (a DNS
// rebinding page) gets a 403 before any page renders, and no page may frame it (the website's
// frame-ancestors from next.config.ts is replaced). On Vercel and in `pnpm dev` it passes.
export function proxy(request: NextRequest) {
  const refused = refuseRead(request.headers.get("host"));
  const response = refused
    ? new NextResponse(`${refused}\n`, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } })
    : NextResponse.next();
  if (editorMode() === "gh") response.headers.set("Content-Security-Policy", NO_FRAMING_CSP);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
