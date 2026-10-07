export type FixtureRoute = {
  path?: string;
  raw?: string;
  query?: Record<string, string>;
  file?: string;
  body?: string;
  status?: number;
  /** Extra response headers, tokens rendered: `date` backdates a read, `x-ratelimit-*` fakes a limit. */
  headers?: Record<string, string>;
};

export type FixtureLog = { requests: number; api: number; nonGet: number; authorizationOnRaw: number; misses: string[] };

export function renderTokens(text: string, now?: Date): string;

export function createFixtureServer(options?: { root?: string; routes?: FixtureRoute[]; org?: string }): {
  log: FixtureLog;
  listen: (port?: number) => Promise<string>;
  close: () => Promise<void>;
};
