// Which pages may show the dashboard inside an iframe (suraj's ask of 2026-10-21): the quirq.dev
// website, which shows it in a Live apps window, and the dashboard itself. Exact origins only,
// never a wildcard or a preview host, so no other site can frame it under a lookalike page.
export const FRAME_ANCESTORS = ["https://quirq.dev", "https://www.quirq.dev"] as const;

// Sent on every response (next.config.ts). Content-Security-Policy frame-ancestors, and no
// X-Frame-Options: that header cannot name another origin, and browsers ignore it when
// frame-ancestors is present.
export const FRAMING_CSP = `frame-ancestors 'self' ${FRAME_ANCESTORS.join(" ")}`;

// The local settings editor (`pnpm editor`) writes as the person, so no page frames it, not even
// the website's (proxy.ts sends this in its place).
export const NO_FRAMING_CSP = "frame-ancestors 'none'";
