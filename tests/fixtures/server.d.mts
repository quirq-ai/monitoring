export type FixtureRoute = {
  path?: string;
  raw?: string;
  query?: Record<string, string>;
  file?: string;
  body?: string;
  status?: number;
};

export type FixtureLog = { requests: number; api: number; nonGet: number; authorizationOnRaw: number; misses: string[] };

export function renderTokens(text: string, now?: Date): string;

export function createFixtureServer(options?: { root?: string; routes?: FixtureRoute[]; org?: string }): {
  log: FixtureLog;
  listen: (port?: number) => Promise<string>;
  close: () => Promise<void>;
};
