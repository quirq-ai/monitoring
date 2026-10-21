import type { NextConfig } from "next";
import { FRAMING_CSP } from "./config/framing";

const nextConfig: NextConfig = {
  // Waiting on you became the Blockers page (2026-10-15); old links and bookmarks land there.
  async redirects() {
    return [{ source: "/waiting", destination: "/blockers", permanent: true }];
  },
  // Every response, pages, the API, static files and 404s alike, may be framed only by the
  // quirq.dev website (config/framing.ts).
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: FRAMING_CSP }] }];
  },
};

export default nextConfig;
