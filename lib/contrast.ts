export const TEXT_PAIRS = [
  ["--foreground", "--background"],
  ["--foreground", "--card"],
  ["--foreground", "--muted"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--card"],
  ["--muted-foreground", "--muted"],
  ["--card-foreground", "--background"],
  ["--card-foreground", "--card"],
  ["--card-foreground", "--muted"],
  ["--primary-foreground", "--primary"],
  ["--destructive-foreground", "--destructive"],
] as const;

export const MARKER_PAIRS = [
  ["--border", "--background"],
  ["--border", "--card"],
  ["--border", "--muted"],
  ["--input", "--background"],
  ["--input", "--card"],
  ["--input", "--muted"],
  ["--state-green", "--background"],
  ["--state-green", "--card"],
  ["--state-green", "--muted"],
  ["--state-red", "--background"],
  ["--state-red", "--card"],
  ["--state-red", "--muted"],
  ["--state-held", "--background"],
  ["--state-held", "--card"],
  ["--state-held", "--muted"],
  ["--state-pending", "--background"],
  ["--state-pending", "--card"],
  ["--state-pending", "--muted"],
  ["--state-unknown", "--background"],
  ["--state-unknown", "--card"],
  ["--state-unknown", "--muted"],
  ["--state-stale", "--background"],
  ["--state-stale", "--card"],
  ["--state-stale", "--muted"],
] as const;

const TEXT_MIN = 4.5;
const MARKER_MIN = 3;

export function parseColor(input: string): [number, number, number] {
  const value = input.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const [r, g, b] = short[1].split("");
    return [
      Number.parseInt(`${r}${r}`, 16),
      Number.parseInt(`${g}${g}`, 16),
      Number.parseInt(`${b}${b}`, 16),
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  throw new Error(`unparsed color: ${input}`);
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function contrast(a: string, b: string): number {
  const [ar, ag, ab] = parseColor(a);
  const [br, bg, bb] = parseColor(b);
  const l1 = 0.2126 * channel(ar) + 0.7152 * channel(ag) + 0.0722 * channel(ab);
  const l2 = 0.2126 * channel(br) + 0.7152 * channel(bg) + 0.0722 * channel(bb);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export type TokenBlock = Record<string, string>;

export function parseTokenBlocks(css: string): {
  light: TokenBlock;
  dark: TokenBlock;
  darkSystem: TokenBlock;
} {
  const blocks = new Map<string, TokenBlock>();
  const pattern =
    /\/\* token-block: (light|dark|dark-system) \*\/\s*[^{]*\{([^}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    const name = match[1];
    const body = match[2];
    if (!name || body === undefined) continue;
    const tokens: TokenBlock = {};
    for (const part of body.split(";")) {
      const idx = part.indexOf(":");
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key.startsWith("--")) tokens[key] = value;
    }
    blocks.set(name, tokens);
  }
  const light = blocks.get("light");
  const dark = blocks.get("dark");
  const darkSystem = blocks.get("dark-system");
  if (!light || !dark || !darkSystem) {
    throw new Error("globals.css is missing a light, dark, or dark-system token block");
  }
  return { light, dark, darkSystem };
}

export function contrastFailures(
  tokens: TokenBlock,
  pairs: readonly (readonly [string, string])[],
  minimum: number,
): string[] {
  const failures: string[] = [];
  for (const [fg, bg] of pairs) {
    const fgValue = tokens[fg];
    const bgValue = tokens[bg];
    if (!fgValue || !bgValue) {
      failures.push(`${fg} on ${bg}: missing token`);
      continue;
    }
    const ratio = contrast(fgValue, bgValue);
    if (ratio < minimum) {
      failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
    }
  }
  return failures;
}

export function themeContrastFailures(tokens: TokenBlock): string[] {
  return [
    ...contrastFailures(tokens, TEXT_PAIRS, TEXT_MIN),
    ...contrastFailures(tokens, MARKER_PAIRS, MARKER_MIN),
  ];
}
