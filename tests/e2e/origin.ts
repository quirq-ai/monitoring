export const origin = "http://127.0.0.1:3010";

/** The settings editor in local (gh) mode, with the fake gh. */
export const editorOrigin = "http://127.0.0.1:3012";

/** The key that server is started with; a real run makes a fresh random one. */
export const EDITOR_KEY = "e2e-key-0123456789abcdefghijklmnopqrstuvwxyz";

/** Where tests/fake-gh/gh logs the writes it was asked for (outside test-results/, which Playwright clears). */
export const FAKE_GH_LOG = `${process.env.TMPDIR ?? "/tmp"}/monitoring-e2e-fake-gh.log`;
