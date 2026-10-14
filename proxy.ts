import { NextResponse, type NextRequest } from "next/server";
import { refuseRead } from "@/lib/editor/mode";

// Only does anything when the settings editor runs on a person's machine (`pnpm editor`): then
// every page may read through their gh login, so a request whose Host is not loopback (a DNS
// rebinding page) gets a 403 before any page renders. On Vercel and in `pnpm dev` it passes.
export function proxy(request: NextRequest) {
  const refused = refuseRead(request.headers.get("host"));
  if (refused) return new NextResponse(`${refused}\n`, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
