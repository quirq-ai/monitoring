import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Waiting on you became the Blockers page (2026-10-15); old links and bookmarks land there.
  async redirects() {
    return [{ source: "/waiting", destination: "/blockers", permanent: true }];
  },
};

export default nextConfig;
