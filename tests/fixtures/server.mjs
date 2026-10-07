// A small HTTP server that serves the fixture files the way raw.githubusercontent.com and
// api.github.com would, so the sources, the pages and the Playwright run read real shapes with no
// network and no token. GET only: any other method is a 405 and is counted, so a test can prove
// the dashboard never writes.
//
//   node tests/fixtures/server.mjs 3011      # serve on 127.0.0.1:3011
//
// Request layout: `/raw/<org>/<repo>/refs/heads/<branch>/<path>` reads `raw/<repo>/<branch>/<path>`;
// `/api/<path>` is matched against routes.json (first match wins). `{{now}}`, `{{now-5m}}`,
// `{{today}}` and `{{yesterday}}` in file names and file contents are replaced per request.

import { createServer } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @typedef {{ path?: string, raw?: string, query?: Record<string, string>, file?: string, body?: string, status?: number, headers?: Record<string, string> }} Route */

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function renderTokens(text, now = new Date()) {
  return text.replace(/\{\{(now|today|yesterday)([+-]\d+[smhd])?\}\}/g, (_, base, offset) => {
    let at = now.getTime();
    if (base === "yesterday") at -= UNIT_MS.d;
    if (offset) {
      const sign = offset[0] === "-" ? -1 : 1;
      const unit = offset.at(-1);
      at += sign * Number(offset.slice(1, -1)) * UNIT_MS[unit];
    }
    const iso = new Date(at).toISOString().replace(/\.\d{3}Z$/, "Z");
    return base === "now" ? iso : iso.slice(0, 10);
  });
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// A `*` segment in a route path matches exactly one path segment; a final `**` matches the rest
// of the path, however many segments, so one route can take an API or a raw tree down.
function matchPath(pattern, actual) {
  const p = pattern.split("/");
  const a = actual.split("/");
  if (p.at(-1) === "**") return p.length - 1 <= a.length && p.slice(0, -1).every((seg, i) => seg === "*" || seg === a[i]);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg === "*" || seg === a[i]);
}

function matchQuery(wanted, params) {
  if (!wanted) return true;
  return Object.entries(wanted).every(([key, value]) => {
    const actual = params.get(key);
    if (actual === null) return false;
    return value.endsWith("*") ? actual.startsWith(value.slice(0, -1)) : actual === value;
  });
}

/**
 * @param {{ root?: string, routes?: Route[], org?: string }} options
 *   routes are tried before routes.json; a route with `raw` matches a raw path (relative to
 *   the raw directory, e.g. release/release-state/channels.json; a `*` segment matches any one
 *   segment, as in API paths), one with `path` an API path.
 */
export function createFixtureServer(options = {}) {
  const root = options.root ?? here;
  const org = options.org ?? "quirq-ai";
  const defaults = JSON.parse(readFileSync(join(root, "routes.json"), "utf8"));
  const routes = [...(options.routes ?? []), ...defaults];
  const rawRoot = join(root, "raw");
  const templatedRaw = walk(rawRoot)
    .map((f) => relative(rawRoot, f))
    .filter((f) => f.includes("{{"));
  const log = { requests: 0, api: 0, nonGet: 0, authorizationOnRaw: 0, misses: [] };

  // A templated name (`runs/{{today}}.json`) wins over a captured file of the same day, so the
  // synthetic "today" story is the same whatever the date.
  function rawFile(rawPath, now) {
    for (const candidate of templatedRaw) {
      if (renderTokens(candidate, now) === rawPath) return readFileSync(join(rawRoot, candidate), "utf8");
    }
    const literal = join(rawRoot, rawPath);
    try {
      if (statSync(literal).isFile()) return readFileSync(literal, "utf8");
    } catch {
      /* not a literal file */
    }
    return null;
  }

  // Extra headers a route asks for (`date` to backdate a read, `x-ratelimit-*` for a limit), with
  // tokens rendered, so a test can say "this answer was read an hour ago".
  function respond(res, status, body, type, headers = {}, now = new Date()) {
    const extra = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, renderTokens(v, now)]));
    res.writeHead(status, { "content-type": type, "cache-control": "max-age=300", ...extra });
    res.end(body);
  }

  const server = createServer((req, res) => {
    const now = new Date();
    log.requests += 1;
    if (req.method !== "GET") {
      log.nonGet += 1;
      return respond(res, 405, JSON.stringify({ message: "fixture server is read-only" }), "application/json");
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (pathname.startsWith("/raw/")) {
      if (req.headers.authorization) log.authorizationOnRaw += 1;
      const prefix = `/raw/${org}/`;
      if (!pathname.startsWith(prefix)) return respond(res, 404, "404: Not Found", "text/plain");
      const [repo, refs, heads, branch, ...rest] = pathname.slice(prefix.length).split("/");
      if (refs !== "refs" || heads !== "heads" || !repo || !branch) return respond(res, 404, "404: Not Found", "text/plain");
      const rawPath = `${repo}/${branch}/${rest.join("/")}`;
      const route = routes.find((r) => r.raw && matchPath(renderTokens(r.raw, now), rawPath));
      if (route) {
        const body = route.body ?? (route.file ? readFileSync(join(root, route.file), "utf8") : "");
        return respond(res, route.status ?? 200, renderTokens(body, now), "text/plain; charset=utf-8", route.headers, now);
      }
      const text = rawFile(rawPath, now);
      if (text === null) {
        log.misses.push(pathname);
        return respond(res, 404, "404: Not Found", "text/plain");
      }
      return respond(res, 200, renderTokens(text, now), "text/plain; charset=utf-8");
    }

    if (pathname.startsWith("/api/")) {
      log.api += 1;
      const apiPath = pathname.slice("/api".length);
      const route = routes.find((r) => r.path && matchPath(r.path, apiPath) && matchQuery(r.query, url.searchParams));
      if (!route) {
        log.misses.push(pathname + url.search);
        return respond(res, 404, JSON.stringify({ message: "Not Found" }), "application/json");
      }
      const body = route.body ?? (route.file ? readFileSync(join(root, route.file), "utf8") : "");
      res.setHeader("x-ratelimit-remaining", "4999");
      return respond(res, route.status ?? 200, renderTokens(body, now), "application/json; charset=utf-8", route.headers, now);
    }

    respond(res, 404, "404: Not Found", "text/plain");
  });

  return {
    log,
    listen: (port = 0) =>
      new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`);
        });
      }),
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? 3011);
  const fixtures = createFixtureServer();
  fixtures.listen(port).then((url) => console.log(`fixture server on ${url}`));
}
